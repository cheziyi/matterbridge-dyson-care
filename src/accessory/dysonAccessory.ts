/**
 * @file src/accessory/dysonAccessory.ts
 * @description This file contains the bridge between one Dyson machine and its Matter endpoints.
 * @author Calvin Che
 * @created 2026-10-19
 * @version 1.1.0
 * @license Apache-2.0
 *
 * Copyright 2026 Calvin Che.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type {
  EnvironmentalCareClient,
  EnvironmentalCareControl,
  EnvironmentalCareFaults,
  EnvironmentalCareSensors,
  EnvironmentalCareState,
  FanSpeed,
  Filter,
  HostType,
  TiltAngle,
} from 'dyson-control';
import type { MatterbridgeEndpoint } from 'matterbridge';
import type { AnsiLogger } from 'matterbridge/logger';
import { type ActionContext, Node } from 'matterbridge/matter';
import { BridgedDeviceBasicInformation, FanControl, ModeSelect, OnOff, Thermostat, ThermostatUserInterfaceConfiguration } from 'matterbridge/matter/clusters';

import { type DysonDeviceConfig, type SettingControlKey, withExposureOf } from '../config.js';
import { addReportedSensors, noReportedSensors, type ReportedSensors } from '../controls.js';
import { getErrorMessage, getErrorStatus } from '../errors.js';
import { findAndFollowSelectChoices, humiditySelectChoices, oscillationSelectChoices, type SelectChoices, tiltSelectChoices, toModeOptions } from '../mapping.js';
import { EndpointIds } from '../platform/endpointIds.js';
import { type SettingSelect, settingControls } from '../settingControls.js';
import {
  applyDeviceLabel,
  createAirQualityEndpoint,
  createHumidityEndpoint,
  createMainEndpoint,
  createModeSelectEndpoint,
  createOscillationFanEndpoint,
  createSwitchEndpoint,
  createTemperatureEndpoint,
  createThermostatEndpoint,
  type EndpointIdentity,
} from './endpoints.js';
import { type AccessoryLayout, getAccessoryLayout } from './layout.js';
import { type AccessoryEndpoints, applySensors, applyState, type OscillationFanRequest, readFanRequest } from './matterState.js';
import { PendingCommand } from './pendingCommand.js';

/** How long, in milliseconds, the writes of a controller are collected before they are sent as one command. */
export const defaultCommandDelayInMs = 300;

/** How many reads in a row have to fail before the device is reported as unreachable. */
const unreachableAfterFailures = 2;

/** How long, in milliseconds, the faults of a machine are kept before a poll asks for them again: they change rarely, and the machine also sends them as they change. */
const faultsIntervalInMs = 15 * 60 * 1000;

/** The broker a connection goes through, as the log names it. */
const hostTypeNames: Readonly<Record<HostType, string>> = { local: 'the LAN', remote: 'the Dyson cloud' };

/** What a machine's client takes and gives: the part of `EnvironmentalCareClient` the accessory calls. */
export type MachineClient = Pick<
  EnvironmentalCareClient,
  'capabilities' | 'hostType' | 'connect' | 'disconnect' | 'getState' | 'setState' | 'getSensors' | 'getFaults' | 'resetFilterLife'
>;

/** What the client of a machine calls the accessory back with. */
export interface MachineClientHandlers {
  onState: (state: EnvironmentalCareState) => void;
  onSensors: (sensors: EnvironmentalCareSensors) => void;
  onFaults: (faults: EnvironmentalCareFaults) => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}

/** Creates the client of a machine, wired to the handlers of its accessory. */
export type MachineClientFactory = (handlers: MachineClientHandlers) => MachineClient;

/** What a device is built from: its stored configuration, the factory of the client of its machine, the readings the machine has given and the logger. */
export interface DysonAccessoryOptions {
  config: DysonDeviceConfig;
  createClient: MachineClientFactory;
  /** The readings the machine has given, which each get their place in Matter. Defaults to none. */
  reportedSensors?: ReportedSensors;
  log: AnsiLogger;
  /** The vendor id of the bridge, used for the bridged device information. */
  vendorId: number;
  /** The endpoint ids of the device, which give an endpoint that comes back after it was taken away a new id. Defaults to the base ids. */
  ids?: EndpointIds;
  /** How long to collect the writes of a controller before sending them. Defaults to 300 milliseconds. */
  commandDelayInMs?: number;
}

/** What the setup page shows about a running device. */
export interface DysonAccessoryStatus {
  isReachable: boolean;
  /** Whether the first read of a new client has not finished yet, while it connects. */
  isConnecting: boolean;
  /** The broker the open connection goes through: the machine's own on the LAN, or the cloud's. Undefined while none is open. */
  hostType?: HostType;
  lastError?: string;
  /** The status of the last error, such as 401 for credentials the cloud no longer accepts. */
  lastErrorStatus?: number;
  state?: EnvironmentalCareState;
  /** The faults the machine last reported, each by Dyson's name, or undefined until it reports them. */
  faults?: string[];
}

/**
 * List the faults a machine reports, whichever group each is in
 *
 * @param {EnvironmentalCareFaults} faults The faults, as dyson-control reads them.
 * @returns {string[]} Each fault once, by Dyson's name, in alphabetical order.
 */
function listFaults(faults: EnvironmentalCareFaults): string[] {
  return [...new Set([...faults.productErrors, ...faults.productWarnings, ...faults.moduleErrors, ...faults.moduleWarnings])].toSorted();
}

/**
 * Tell whether an attribute change came from a Matter controller
 *
 * @param {ActionContext} context The context of the change.
 * @returns {boolean} False for a change this plugin made itself.
 */
function isControllerWrite(context: ActionContext): boolean {
  return context.fabric !== undefined;
}

/**
 * Do nothing: the settled value of a queued task is its caller's business, not the queue's
 *
 * @returns {void}
 */
function ignore(): void {
  // Intentionally empty.
}

/**
 * One Dyson machine and the Matter endpoints that stand for it: an air purifier or a fan with its fan control and, as
 * they are exposed, a thermostat for its heating, on/off switches and mode selects for what Matter has no place for or
 * the app shows no control for, a fan for its oscillation, and sensors for its readings. Each is a device of its own in Matter, or a part of the
 * main one when the device is exposed as a composed one.
 *
 * The endpoints are built in `endpoints.ts`, what the controllers ask for is collected in `pendingCommand.ts` and what
 * the machine answers is written to Matter in `matterState.ts`. This class wires them together: it takes the writes of
 * the controllers and the states the machine sends, and runs the reads and the commands one after the other.
 */
export class DysonAccessory implements AccessoryEndpoints {
  /** The name the user gave the device, which is its label in Matter. */
  name: string;
  /** What the machine takes, as the endpoints were built from it. */
  readonly capabilities: MachineClient['capabilities'];
  readonly endpoint: MatterbridgeEndpoint;
  readonly fanAutoSwitch: MatterbridgeEndpoint | undefined;
  readonly oscillationSwitch: MatterbridgeEndpoint | undefined;
  readonly oscillationSelect: MatterbridgeEndpoint | undefined;
  readonly tiltSelect: MatterbridgeEndpoint | undefined;
  readonly oscillationFan: MatterbridgeEndpoint | undefined;
  readonly findAndFollowSwitch: MatterbridgeEndpoint | undefined;
  readonly findAndFollowSelect: MatterbridgeEndpoint | undefined;
  readonly settingEndpoints = new Map<SettingControlKey, MatterbridgeEndpoint>();
  readonly nightModeSwitch: MatterbridgeEndpoint | undefined;
  readonly airflowDirectionSwitch: MatterbridgeEndpoint | undefined;
  readonly thermostat: MatterbridgeEndpoint | undefined;
  readonly heatSwitch: MatterbridgeEndpoint | undefined;
  readonly humidifySwitch: MatterbridgeEndpoint | undefined;
  readonly autoHumidifySwitch: MatterbridgeEndpoint | undefined;
  readonly humiditySelect: MatterbridgeEndpoint | undefined;
  readonly continuousMonitoringSwitch: MatterbridgeEndpoint | undefined;
  readonly airQualitySensor: MatterbridgeEndpoint | undefined;
  readonly temperatureSensor: MatterbridgeEndpoint | undefined;
  readonly humiditySensor: MatterbridgeEndpoint | undefined;
  private config: DysonDeviceConfig;
  /** The readings the machine is known to have given: those the endpoints were built for, and those noted since, which get their place at the next start of Matterbridge. */
  private reportedSensors: ReportedSensors;
  private client: MachineClient;
  private readonly log: AnsiLogger;
  private readonly commandDelayInMs: number;
  private readonly identity: EndpointIdentity;
  private readonly layout: AccessoryLayout;
  /** The main endpoint, when the other endpoints of the device are its parts. */
  private readonly parent: MatterbridgeEndpoint | undefined;

  private state: EnvironmentalCareState | undefined;
  private sensors: EnvironmentalCareSensors | undefined;
  /** The speed the fan last ran at outside the auto mode, which turning the auto mode off goes back to. */
  private lastManualFanSpeed: FanSpeed | undefined;
  /** The angle a machine that tilts was last seen at, which turning its breeze off goes back to. */
  private lastTiltAngle: TiltAngle | undefined;
  private faults: string[] | undefined;
  /** When the faults were last asked for, in milliseconds since the epoch. */
  private faultsReadAt: number | undefined;
  private isConnected = false;
  private isReachable = false;
  /** Until the first read of the client ends, which takes a moment to connect. */
  private isConnecting = true;
  /** The broker the log last named the connection through, so that a connection is logged when it goes through another. */
  private loggedHostType: HostType | null = null;
  private lastError: string | undefined;
  private lastErrorStatus: number | undefined;
  private failureCount = 0;
  private isDisposed = false;
  /** Whether the account was signed out: nothing is read or sent until a new client comes. */
  private isSuspended = false;

  // What the controllers asked for since the last command was sent.
  private readonly pending = new PendingCommand();
  private hasPendingCommand = false;
  private commandTimer: NodeJS.Timeout | undefined;
  // Reads and commands run one after the other, so a read never overwrites what a command is about to send.
  private queue: Promise<void> = Promise.resolve();
  // What is subscribed on each endpoint, to subscribe it again after a factory reset of the Matter node.
  private readonly subscriptions = new Map<MatterbridgeEndpoint, (() => void)[]>();
  // Whether a read waits for the Matter node to be online, which the endpoints are written to only while it is.
  private isAwaitingOnline = false;

  /**
   * Create the endpoints of a device from what its machine takes and how it is configured
   *
   * The client is created here and sends nothing until `start`.
   *
   * @param {DysonAccessoryOptions} options The device, the factory of its client and the logger.
   */
  constructor(options: DysonAccessoryOptions) {
    this.config = options.config;
    this.client = this.wireClient(options.createClient);
    this.reportedSensors = options.reportedSensors ?? noReportedSensors;
    this.log = options.log;
    this.commandDelayInMs = options.commandDelayInMs ?? defaultCommandDelayInMs;
    this.name = options.config.name;
    this.capabilities = this.client.capabilities;
    const productName = options.config.productName ?? `Dyson ${options.config.type}`;
    this.identity = { label: this.name, serial: options.config.serialNumber, productName, vendorId: options.vendorId, ids: options.ids ?? new EndpointIds() };
    this.layout = getAccessoryLayout(options.config, this.capabilities, this.reportedSensors);

    this.endpoint = this.createMain();
    if (this.layout.isComposed) this.parent = this.endpoint;
    const { layout } = this;
    if (layout.hasFanAutoSwitch) this.fanAutoSwitch = this.createSwitch('auto-mode', 'A', 'Auto Mode', (isOn) => this.queueFanAuto(isOn));
    if (layout.hasOscillationSwitch) this.oscillationSwitch = this.createSwitch('oscillation', 'O', 'Oscillation', (isOn) => this.queueOscillation(isOn, 'oscillation'));
    if (layout.oscillationSelectValues.length > 0) {
      this.oscillationSelect = this.createSelect('oscillation-select', 'W', 'Oscillation', oscillationSelectChoices, layout.oscillationSelectValues, (value) => {
        this.pending.requestOscillation(value);
        this.scheduleCommand(`oscillation select ${value}`);
      });
    }
    if (layout.tiltSelectValues.length > 0) {
      this.tiltSelect = this.createSelect('tilt-select', 'L', 'Tilt', tiltSelectChoices, layout.tiltSelectValues, (angle) => {
        this.pending.requestTilt(angle);
        this.scheduleCommand(`tilt ${angle}`);
      });
    }
    if (layout.oscillationFanPositions.length > 0) this.oscillationFan = this.createOscillationFan();
    if (layout.hasFindAndFollowSwitch) {
      this.findAndFollowSwitch = this.createSwitch('find-and-follow', 'P', 'Find and Follow', (isOn) =>
        this.queueControl({ findAndFollowMode: isOn ? 'on' : 'off' }, `find and follow ${isOn ? 'on' : 'off'}`),
      );
    }
    if (layout.findAndFollowSelectValues.length > 0) {
      this.findAndFollowSelect = this.createSelect('find-and-follow-select', 'S', 'Find and Follow', findAndFollowSelectChoices, layout.findAndFollowSelectValues, (mode) =>
        this.queueControl({ findAndFollowMode: mode }, `find and follow ${mode}`),
      );
    }
    if (layout.hasNightModeSwitch)
      this.nightModeSwitch = this.createSwitch('night-mode', 'N', 'Night Mode', (isOn) => this.queueControl({ nightMode: isOn }, `night mode ${isOn ? 'on' : 'off'}`));
    if (layout.hasAirflowDirectionSwitch) {
      this.airflowDirectionSwitch = this.createSwitch('front-airflow', 'F', 'Front Airflow', (isOn) =>
        this.queueControl({ fanAirDirection: isOn ? 'forward' : 'backward' }, `front airflow ${isOn ? 'on' : 'off'}`),
      );
    }
    if (layout.hasThermostat) this.thermostat = this.createThermostat();
    if (layout.hasHeatSwitch) this.heatSwitch = this.createSwitch('heat', 'H', 'Heat', (isOn) => this.queueHeat(isOn, `heat ${isOn ? 'on' : 'off'}`));
    if (layout.hasHumidifySwitch) this.humidifySwitch = this.createSwitch('humidify', 'U', 'Humidify', (isOn) => this.queueHumidify(isOn));
    if (layout.hasAutoHumidifySwitch) {
      this.autoHumidifySwitch = this.createSwitch('auto-humidify', 'X', 'Auto Humidify', (isOn) =>
        this.queueControl({ autoHumidification: isOn }, `auto humidify ${isOn ? 'on' : 'off'}`),
      );
    }
    if (layout.humiditySelectValues.length > 0) {
      this.humiditySelect = this.createSelect('humidity-select', 'G', 'Target Humidity', humiditySelectChoices, layout.humiditySelectValues, (value) => {
        this.pending.requestHumidity(value);
        this.scheduleCommand(`target humidity ${value}`);
      });
    }
    for (const key of layout.settingControls) {
      const control = settingControls[key];
      const label = control.label.toLowerCase();
      const endpoint =
        control.kind === 'switch'
          ? this.createSwitch(control.key, control.code, control.label, (isOn) => this.queueControl(control.write(isOn), `${label} ${isOn ? 'on' : 'off'}`))
          : this.createSettingSelect(control);
      this.settingEndpoints.set(key, endpoint);
    }
    if (layout.hasContinuousMonitoringSwitch) {
      this.continuousMonitoringSwitch = this.createSwitch('continuous-monitoring', 'C', 'Continuous Monitoring', (isOn) =>
        this.queueControl({ continuousMonitoring: isOn }, `continuous monitoring ${isOn ? 'on' : 'off'}`),
      );
    }
    if (layout.hasAirQualitySensor) this.airQualitySensor = createAirQualityEndpoint(this.identity, layout, this.parent);
    if (layout.hasTemperatureSensor) this.temperatureSensor = createTemperatureEndpoint(this.identity, this.parent);
    if (layout.hasHumiditySensor) this.humiditySensor = createHumidityEndpoint(this.identity, this.parent);
  }

  /**
   * List the Matter endpoints of the device that are devices in Matter: the ones to register, which each say whether
   * the machine is reachable
   *
   * @returns {MatterbridgeEndpoint[]} The main endpoint, then the others the device has, unless they are parts of the main one.
   */
  get endpoints(): MatterbridgeEndpoint[] {
    if (this.parent !== undefined) return [this.parent];
    return [
      this.endpoint,
      this.thermostat,
      this.fanAutoSwitch,
      this.oscillationSwitch,
      this.oscillationSelect,
      this.tiltSelect,
      this.oscillationFan,
      this.findAndFollowSwitch,
      this.findAndFollowSelect,
      this.nightModeSwitch,
      this.airflowDirectionSwitch,
      this.heatSwitch,
      this.humidifySwitch,
      this.autoHumidifySwitch,
      this.humiditySelect,
      ...this.settingEndpoints.values(),
      this.continuousMonitoringSwitch,
      this.airQualitySensor,
      this.temperatureSensor,
      this.humiditySensor,
    ].filter((endpoint) => endpoint !== undefined);
  }

  /**
   * Take the readings the machine gave for the first time, and tell whether the device lacks a place for one of them
   *
   * The readings are noted either way, so that they are reported once. A reading with no place in Matter, such as a
   * temperature without a temperature sensor, needs none. One with a place to come gets it when the device is built
   * again, at the next start of Matterbridge.
   *
   * @returns {{ reported: ReportedSensors; needsRebuild: boolean } | undefined} Every reading the machine has given, and whether the endpoints lack a place for one, or undefined when the last readings gave nothing new.
   */
  takeNewlyReportedSensors(): { reported: ReportedSensors; needsRebuild: boolean } | undefined {
    if (this.sensors === undefined) return undefined;
    const reported = addReportedSensors(this.reportedSensors, this.sensors);
    if (reported === this.reportedSensors) return undefined;
    const needsRebuild = JSON.stringify(getAccessoryLayout(this.config, this.capabilities, reported)) !== JSON.stringify(this.layout);
    this.reportedSensors = reported;
    return { reported, needsRebuild };
  }

  /**
   * Report how the device is doing
   *
   * @returns {DysonAccessoryStatus} Whether the last reads succeeded, the last error and the last state read.
   */
  getStatus(): DysonAccessoryStatus {
    return {
      isReachable: this.isReachable,
      isConnecting: this.isConnecting,
      hostType: this.client.hostType ?? undefined,
      lastError: this.lastError,
      lastErrorStatus: this.lastErrorStatus,
      state: this.state,
      faults: this.faults,
    };
  }

  /**
   * Show no reading until the machine is read
   *
   * A Matter thermostat is created with a room temperature, which is nobody's reading.
   *
   * @returns {Promise<void>} Resolves when the readings of the device have no value.
   */
  async clearReadings(): Promise<void> {
    await applySensors(this, this.layout, {
      temperatureInC: null,
      humidityInPercent: null,
      pm25InUgPerM3: null,
      pm25Index: null,
      pm10InUgPerM3: null,
      pm10Index: null,
      volatileOrganicCompoundsIndex: null,
      nitrogenDioxideIndex: null,
      formaldehydeInUgPerM3: null,
      formaldehydeIndex: null,
      carbonDioxideInPpm: null,
      carbonDioxideIndex: null,
      sleepTimerInMinutes: null,
    });
  }

  /**
   * Connect to the machine and read it
   *
   * @returns {Promise<boolean>} True when the machine answered.
   */
  async start(): Promise<boolean> {
    return this.refresh();
  }

  /**
   * Switch to a new client, after the account the machine is reached through changed
   *
   * The endpoints keep what the old client took: a machine whose capabilities changed is built again at the next start
   * of Matterbridge.
   *
   * @param {MachineClientFactory} createClient The factory of the new client.
   * @returns {Promise<boolean>} Resolves when the previous client is disconnected and the new one has read the machine: true when it answered.
   */
  async updateConnection(createClient: MachineClientFactory): Promise<boolean> {
    return this.enqueue(async () => {
      const previous = this.client;
      this.client = this.wireClient(createClient);
      this.isConnected = false;
      this.isSuspended = false;
      this.isConnecting = true;
      await this.disconnectClient(previous);
      return this.readAndApply(true);
    });
  }

  /**
   * Take a new configuration: the name, the connection and whatever else changes no endpoint
   *
   * A new name is written to the label of each endpoint that is a device of its own in Matter, which is what the Matter
   * apps show. The settings that decide the endpoints stay as the device was built: a change of them reaches Matter
   * when the device is built again, at the next start of Matterbridge.
   *
   * @param {DysonDeviceConfig} config The updated device.
   * @returns {Promise<void>} Resolves when a new name is written to the endpoints.
   */
  async updateConfig(config: DysonDeviceConfig): Promise<void> {
    const previous = this.name;
    this.config = withExposureOf(config, this.config);
    if (config.name === previous) return;
    this.name = config.name;
    await applyDeviceLabel(this.endpoints, config.name);
    this.log.info(`"${previous}" is now named "${config.name}"`);
  }

  /**
   * Disconnect from the machine until a new client comes, after the account was signed out
   *
   * The endpoints stay, and say that the machine is unreachable.
   *
   * @returns {Promise<void>} Resolves when the client is disconnected.
   */
  async suspend(): Promise<void> {
    await this.enqueue(async () => {
      this.isSuspended = true;
      this.isConnected = false;
      this.isConnecting = false;
      await this.disconnectClient(this.client);
      await this.setReachableQuietly(false);
    });
  }

  /**
   * Read the state and the readings of the machine and write them to the Matter endpoints, connecting first when the
   * client is not connected
   *
   * A read that fails is logged, never thrown: after two failures in a row the endpoints are reported as unreachable.
   * While the Matter node is offline, such as during a factory reset or before the bridge has started, the machine is
   * not read: it is read once the node is online.
   *
   * @returns {Promise<boolean>} True when the machine answered. False when it did not, or the node is offline.
   */
  async refresh(): Promise<boolean> {
    return this.enqueue(async () => this.readAndApply(true));
  }

  /**
   * Send what the controllers asked for now, without waiting for the command delay
   *
   * @returns {Promise<void>} Resolves when the command is sent and the state is read back, or when there was nothing to send.
   */
  async flushCommands(): Promise<void> {
    clearTimeout(this.commandTimer);
    this.commandTimer = undefined;
    await this.enqueue(async () => this.sendPendingCommand());
  }

  /**
   * Stop the device for good: drop what is waiting to be sent and disconnect from the machine. The device reads and
   * sends nothing afterwards, so a device that is needed again is built anew.
   *
   * @returns {Promise<void>} Resolves when the running read or command is done and the client is disconnected.
   */
  async dispose(): Promise<void> {
    this.isDisposed = true;
    clearTimeout(this.commandTimer);
    this.commandTimer = undefined;
    this.hasPendingCommand = false;
    await this.queue;
    await this.disconnectClient(this.client);
  }

  // Each handler checks the client it came from, so a client that was replaced calls back nothing.
  private wireClient(createClient: MachineClientFactory): MachineClient {
    const client: MachineClient = createClient({
      onState: (state) => {
        if (this.client === client) this.receiveState(state);
      },
      onSensors: (sensors) => {
        if (this.client === client) this.receiveSensors(sensors);
      },
      onFaults: (faults) => {
        if (this.client === client) this.receiveFaults(faults);
      },
      onReconnect: () => {
        if (this.client !== client) return;
        this.log.info(`"${this.name}" connected again${this.describeHostType()}`);
        void this.refresh();
      },
      onDisconnect: () => {
        if (this.client === client) this.handleDisconnect();
      },
    });
    return client;
  }

  private createMain(): MatterbridgeEndpoint {
    const endpoint = createMainEndpoint(this.identity, this.layout);
    this.listen(endpoint, () =>
      endpoint.subscribeAttribute(OnOff, 'onOff', (isOn: boolean, _wasOn: boolean, context: ActionContext) => {
        if (isControllerWrite(context)) this.queueControl({ fanPower: isOn }, `power ${isOn ? 'on' : 'off'}`);
      }),
    );
    const onFanWrite = (_value: unknown, _previous: unknown, context: ActionContext): void => {
      if (!isControllerWrite(context)) return;
      this.pending.requestFan();
      this.scheduleCommand('fan speed');
    };
    this.listen(endpoint, () => endpoint.subscribeAttribute(FanControl, 'fanMode', onFanWrite));
    this.listen(endpoint, () => endpoint.subscribeAttribute(FanControl, 'percentSetting', onFanWrite));
    if (this.layout.hasRocking) {
      this.listen(endpoint, () =>
        endpoint.subscribeAttribute('FanControl', 'rockSetting', (setting: { rockLeftRight?: boolean; rockUpDown?: boolean }, _previous: unknown, context: ActionContext) => {
          if (isControllerWrite(context)) this.queueOscillation((this.layout.isTilt ? setting.rockUpDown : setting.rockLeftRight) === true, 'rocking');
        }),
      );
    }
    // Matterbridge puts the condition back to full once the reset is sent, and the machine's own life comes with the next read.
    const filters = this.capabilities.filters;
    if (this.layout.hasHepaFilter) {
      const filter = filters.includes('filter') ? 'filter' : 'outerFilter';
      endpoint.addCommandHandler('HepaFilterMonitoring.resetCondition', async () => this.resetFilter(filter));
    }
    if (this.layout.hasCarbonFilter) endpoint.addCommandHandler('ActivatedCarbonFilterMonitoring.resetCondition', async () => this.resetFilter('innerFilter'));
    this.listen(endpoint, () =>
      endpoint.subscribeAttribute('FanControl', 'windSetting', (setting: { sleepWind?: boolean }, _previous: unknown, context: ActionContext) => {
        if (isControllerWrite(context)) this.queueControl({ nightMode: setting.sleepWind === true }, `sleep wind ${setting.sleepWind === true ? 'on' : 'off'}`);
      }),
    );
    if (this.layout.hasAirflowDirection) {
      this.listen(endpoint, () =>
        endpoint.subscribeAttribute('FanControl', 'airflowDirection', (direction: FanControl.AirflowDirection, _previous: unknown, context: ActionContext) => {
          const fanAirDirection = direction === FanControl.AirflowDirection.Forward ? 'forward' : 'backward';
          if (isControllerWrite(context)) this.queueControl({ fanAirDirection }, `airflow ${fanAirDirection}`);
        }),
      );
    }
    return endpoint;
  }

  private createOscillationFan(): MatterbridgeEndpoint {
    const endpoint = createOscillationFanEndpoint(this.identity, this.layout, this.parent);
    this.listen(endpoint, () =>
      endpoint.subscribeAttribute(OnOff, 'onOff', (isOn: boolean, _wasOn: boolean, context: ActionContext) => {
        // The on/off is the power of the machine: nothing is sent, and the read that follows puts it back.
        if (isControllerWrite(context)) this.scheduleCommand(`oscillation fan ${isOn ? 'on' : 'off'}, which follows the power`);
      }),
    );
    const onFanWrite = (_value: unknown, _previous: unknown, context: ActionContext): void => {
      if (!isControllerWrite(context)) return;
      this.pending.requestOscillationFan();
      this.scheduleCommand('oscillation fan speed');
    };
    this.listen(endpoint, () => endpoint.subscribeAttribute(FanControl, 'fanMode', onFanWrite));
    this.listen(endpoint, () => endpoint.subscribeAttribute(FanControl, 'percentSetting', onFanWrite));
    return endpoint;
  }

  private createThermostat(): MatterbridgeEndpoint {
    const endpoint = createThermostatEndpoint(this.identity, this.layout, this.parent);
    if (this.layout.hasTemperatureUnit) {
      this.listen(endpoint, () =>
        endpoint.subscribeAttribute(
          ThermostatUserInterfaceConfiguration,
          'temperatureDisplayMode',
          (mode: ThermostatUserInterfaceConfiguration.TemperatureDisplayMode, _previous: unknown, context: ActionContext) => {
            const temperatureUnit = mode === ThermostatUserInterfaceConfiguration.TemperatureDisplayMode.Fahrenheit ? 'fahrenheit' : 'celsius';
            if (isControllerWrite(context)) this.queueControl({ temperatureUnit }, `temperature unit ${temperatureUnit}`);
          },
        ),
      );
    }
    this.listen(endpoint, () =>
      endpoint.subscribeAttribute(Thermostat, 'systemMode', (systemMode: Thermostat.SystemMode, _previous: Thermostat.SystemMode, context: ActionContext) => {
        if (!isControllerWrite(context)) return;
        const isHeat = systemMode === Thermostat.SystemMode.Heat || systemMode === Thermostat.SystemMode.EmergencyHeat;
        if (isHeat || systemMode === Thermostat.SystemMode.Off) {
          this.queueHeat(isHeat, `thermostat mode ${Thermostat.SystemMode[systemMode]}`);
          return;
        }
        this.log.warn(`"${this.name}" only heats: the Matter system mode ${Thermostat.SystemMode[systemMode]} is ignored`);
        // Nothing is sent, but the read that follows puts the machine's own mode back.
        this.scheduleCommand('a mode it does not have');
      }),
    );
    this.listen(endpoint, () =>
      endpoint.subscribeAttribute(Thermostat, 'occupiedHeatingSetpoint', (setpoint: number, _previous: number, context: ActionContext) => {
        if (!isControllerWrite(context)) return;
        this.pending.requestHeatTarget(setpoint / 100);
        this.scheduleCommand(`heating setpoint ${setpoint / 100} °C`);
      }),
    );
    return endpoint;
  }

  /**
   * Subscribe to an attribute of an endpoint, and again whenever the endpoint comes back from a factory reset
   *
   * Matter resets the node to factory defaults when its last fabric leaves, such as when the bridge is removed from the
   * last app it was in. The reset drops what was subscribed on each endpoint, so that the writes of the next app it is
   * paired with would reach nothing.
   *
   * @param {MatterbridgeEndpoint} endpoint The endpoint.
   * @param {() => void} subscribe Subscribes to the attribute, now and after each reset.
   * @returns {void}
   */
  private listen(endpoint: MatterbridgeEndpoint, subscribe: () => void): void {
    subscribe();
    const known = this.subscriptions.get(endpoint);
    if (known !== undefined) {
      known.push(subscribe);
      return;
    }
    const subscriptions = [subscribe];
    this.subscriptions.set(endpoint, subscriptions);
    let wasReset = false;
    endpoint.lifecycle.reset.on(() => {
      wasReset = true;
    });
    endpoint.lifecycle.ready.on(() => {
      if (!wasReset) return;
      wasReset = false;
      for (const again of subscriptions) again();
      if (endpoint === this.endpoint) this.log.info(`"${this.name}" is subscribed again after the Matter node was reset`);
      // The reset put every attribute back to its default: the state of the machine replaces them once the node is online.
      void this.refresh();
    });
  }

  /**
   * The Matter node the endpoints are in while it is offline, which they are written to only while it is online
   *
   * As the node goes online, the thermostat writes its temperature in a way that cannot wait for a write of the plugin,
   * and the node fails to start when one holds the thermostat then: after a factory reset, which takes the node offline
   * and brings it back, and when the bridge starts. Endpoints that are in no node yet are written to as they are.
   * The node stays theirs through a factory reset.
   *
   * @returns {Node | undefined} The node while it is offline. Undefined while it is online, or the endpoints are in no node.
   */
  private getOfflineNode(): Node | undefined {
    let root = this.endpoint.owner;
    while (root?.owner !== undefined) root = root.owner;
    return root instanceof Node && !root.lifecycle.isOnline ? root : undefined;
  }

  /**
   * Tell whether the endpoints wait for the Matter node to be online, and read the machine once it is
   *
   * @returns {boolean} True while the node is offline, when nothing is to be written to the endpoints.
   */
  private isWaitingForNode(): boolean {
    const node = this.getOfflineNode();
    if (node === undefined) return false;
    this.refreshWhenOnline(node);
    return true;
  }

  /**
   * Read the machine once the node is online, and write its state to the endpoints then
   *
   * A device signed out meanwhile is shown as unreachable instead, since it reads nothing.
   *
   * @param {Node} node The node the endpoints are in, while it is offline.
   * @returns {void}
   */
  private refreshWhenOnline(node: Node): void {
    if (this.isAwaitingOnline) return;
    this.isAwaitingOnline = true;
    // The read is not awaited, so that the node goes online without waiting for the machine. It does nothing once the
    // device is disposed.
    node.lifecycle.online.once(() => {
      this.isAwaitingOnline = false;
      void this.enqueue(async () => {
        if (this.isDisposed) return;
        if (this.isSuspended) await this.setReachableQuietly(false);
        else await this.readAndApply(true);
      });
    });
  }

  // The code tells the switches of one device apart in their serial numbers.
  private createSwitch(key: string, code: string, label: string, onWrite: (isOn: boolean) => void): MatterbridgeEndpoint {
    const endpoint = createSwitchEndpoint(this.identity, key, code, label, this.parent);
    this.listen(endpoint, () =>
      endpoint.subscribeAttribute(OnOff, 'onOff', (isOn: boolean, _wasOn: boolean, context: ActionContext) => {
        if (isControllerWrite(context)) onWrite(isOn);
      }),
    );
    return endpoint;
  }

  // Matter refuses a mode the select does not list, so a controller only ever picks one the machine takes.
  private createSelect<T extends string | number>(
    key: string,
    code: string,
    label: string,
    choices: SelectChoices<T>,
    supported: readonly T[],
    onPick: (value: T) => void,
  ): MatterbridgeEndpoint {
    const endpoint = createModeSelectEndpoint(this.identity, key, code, label, toModeOptions(choices, supported), this.parent);
    this.listen(endpoint, () =>
      endpoint.subscribeAttribute(ModeSelect, 'currentMode', (mode: number, _previous: number, context: ActionContext) => {
        if (isControllerWrite(context)) onPick(choices.values[mode]);
      }),
    );
    return endpoint;
  }

  private queueOscillation(isOn: boolean, control: string): void {
    this.pending.requestOscillationOn(isOn);
    this.scheduleCommand(`${control} ${isOn ? 'on' : 'off'}`);
  }

  /**
   * Reset the life of a filter after a new one is fitted
   *
   * @param {Filter} filter The filter.
   * @returns {Promise<void>} Resolves once the broker has the reset.
   * @throws {Error} When the machine is not connected or the reset is not sent, so that the controller is told it failed.
   */
  private async resetFilter(filter: Filter): Promise<void> {
    this.log.info(`"${this.name}" received a reset of its ${filter}`);
    await this.enqueue(async () => {
      try {
        if (this.isSuspended) throw new Error('No Dyson account is signed in');
        if (!this.isConnected) await this.connect();
        await this.client.resetFilterLife(filter);
      } catch (error) {
        this.recordError(error);
        this.log.error(`"${this.name}" did not take a reset of its ${filter}: ${getErrorMessage(error)}`);
        throw error;
      }
      this.log.info(`"${this.name}" reset the life of its ${filter}`);
    });
  }

  private createSettingSelect(control: SettingSelect): MatterbridgeEndpoint {
    const endpoint = createModeSelectEndpoint(this.identity, control.key, control.code, control.label, control.modeOptions(this.capabilities), this.parent);
    this.listen(endpoint, () =>
      endpoint.subscribeAttribute(ModeSelect, 'currentMode', (mode: number, _previous: number, context: ActionContext) => {
        if (!isControllerWrite(context)) return;
        const fields = control.writeMode(mode);
        this.queueControl(fields, `${control.label.toLowerCase()} ${JSON.stringify(fields)}`);
      }),
    );
    return endpoint;
  }

  private queueFanAuto(isOn: boolean): void {
    this.pending.requestFanAuto(isOn);
    this.scheduleCommand(`auto mode ${isOn ? 'on' : 'off'}`);
  }

  // Heating and humidifying run only while the machine is on, so turning either on turns the machine on.
  private queueHeat(isOn: boolean, description: string): void {
    this.queueControl(isOn ? { fanPower: true, heatMode: 'heat' } : { heatMode: 'off' }, description);
  }

  private queueHumidify(isOn: boolean): void {
    this.queueControl(isOn ? { fanPower: true, humidificationMode: 'humidify' } : { humidificationMode: 'off' }, `humidify ${isOn ? 'on' : 'off'}`);
  }

  private queueControl(control: EnvironmentalCareControl, description: string): void {
    this.pending.requestControl(control);
    this.scheduleCommand(description);
  }

  private scheduleCommand(description: string): void {
    if (this.isDisposed) return;
    this.log.info(`"${this.name}" received ${description}`);
    this.hasPendingCommand = true;
    clearTimeout(this.commandTimer);
    this.commandTimer = setTimeout(() => {
      this.commandTimer = undefined;
      void this.enqueue(async () => this.sendPendingCommand());
    }, this.commandDelayInMs);
  }

  private async enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.then(ignore, ignore);
    return result;
  }

  private async sendPendingCommand(): Promise<void> {
    if (!this.hasPendingCommand) return;
    this.hasPendingCommand = false;
    if (this.isSuspended) {
      this.log.warn(`"${this.name}" is not connected while no Dyson account is signed in: the request is ignored`);
      this.pending.clear();
      return;
    }
    const machine = {
      state: this.state,
      capabilities: this.client.capabilities,
      lastManualFanSpeed: this.lastManualFanSpeed,
      isSweepSelect: this.layout.isSweepSelect,
      isTilt: this.layout.isTilt,
      lastTiltAngle: this.lastTiltAngle,
    };
    const { oscillationFan } = this;
    const readOscillationFan =
      oscillationFan === undefined ? undefined : (): OscillationFanRequest | undefined => readFanRequest(oscillationFan, this.layout.oscillationFanPositions);
    const control = this.pending.take(machine, () => readFanRequest(this.endpoint, this.layout.fanPositions), readOscillationFan);
    if (Object.keys(control).length > 0) {
      try {
        if (!this.isConnected) await this.connect();
        await this.client.setState(control);
        this.log.info(`"${this.name}" set to ${JSON.stringify(control)}`);
      } catch (error) {
        this.recordError(error);
        this.log.error(`"${this.name}" did not take ${JSON.stringify(control)}: ${getErrorMessage(error)}`);
      }
    }
    // Read back what the machine holds, which also undoes a request it did not take. The readings of the last poll are
    // recent enough to go with it.
    await this.readAndApply(false);
  }

  private async connect(): Promise<void> {
    await this.client.connect();
    this.isConnected = true;
    if (this.client.hostType !== this.loggedHostType) this.log.info(`"${this.name}" connected${this.describeHostType()}`);
  }

  // Such as " through the LAN": the broker the open connection goes through, which the log names from then on.
  private describeHostType(): string {
    const { hostType } = this.client;
    this.loggedHostType = hostType;
    return hostType === null ? '' : ` through ${hostTypeNames[hostType]}`;
  }

  /**
   * Read the machine and write what it holds to Matter
   *
   * @param {boolean} shouldReadSensors Whether to read the sensors too, instead of keeping the readings of the last poll.
   * @returns {Promise<boolean>} True when the machine answered. False when it did not, or the node is offline and it was not read.
   */
  private async readAndApply(shouldReadSensors: boolean): Promise<boolean> {
    if (this.isDisposed || this.isSuspended || this.isWaitingForNode()) return false;
    let state: EnvironmentalCareState;
    let sensors = this.sensors;
    try {
      if (!this.isConnected) await this.connect();
      state = await this.client.getState();
      if (shouldReadSensors || sensors === undefined) sensors = await this.client.getSensors();
    } catch (error) {
      this.isConnecting = false;
      await this.handleReadFailure(error);
      return false;
    }
    this.isConnecting = false;
    this.failureCount = 0;
    this.lastError = undefined;
    this.lastErrorStatus = undefined;
    this.sensors = sensors;
    if (shouldReadSensors) this.readFaultsWhenDue();
    await this.apply(state);
    return true;
  }

  /**
   * Ask the machine for its faults, when they were never asked for or not for a while
   *
   * The answer comes outside the queue of reads and commands, so that a machine slow to answer holds up nothing, and a
   * machine that does not answer is asked again at the next interval. Its answer reaches `receiveFaults` as well.
   *
   * @returns {void}
   */
  private readFaultsWhenDue(): void {
    const now = Date.now();
    if (this.faultsReadAt !== undefined && now - this.faultsReadAt < faultsIntervalInMs) return;
    this.faultsReadAt = now;
    void this.readFaults(this.client);
  }

  private async readFaults(client: MachineClient): Promise<void> {
    try {
      const faults = await client.getFaults();
      if (this.client === client) this.receiveFaults(faults);
    } catch (error) {
      this.log.debug(`"${this.name}" did not tell its faults: ${getErrorMessage(error)}`);
    }
  }

  private receiveFaults(faults: EnvironmentalCareFaults): void {
    if (this.isDisposed) return;
    const listed = listFaults(faults);
    if (this.faults !== undefined && listed.join() === this.faults.join()) return;
    if (listed.length > 0) this.log.warn(`"${this.name}" reports ${listed.join(', ')}`);
    else if (this.faults !== undefined) this.log.info(`"${this.name}" reports no fault any more`);
    this.faults = listed;
  }

  // A state the machine sent by itself, or the answer to a read of another client.
  private receiveState(state: EnvironmentalCareState): void {
    void this.enqueue(async () => {
      if (!this.isDisposed) await this.apply(state);
    });
  }

  // While the node is offline the readings are kept, and the read once it is online writes them.
  private receiveSensors(sensors: EnvironmentalCareSensors): void {
    void this.enqueue(async () => {
      if (this.isDisposed) return;
      this.sensors = sensors;
      if (this.isWaitingForNode()) return;
      try {
        await applySensors(this, this.layout, sensors);
      } catch (error) {
        this.log.warn(`"${this.name}" readings could not be written to Matter: ${getErrorMessage(error)}`);
      }
    });
  }

  private async apply(state: EnvironmentalCareState): Promise<void> {
    this.state = state;
    if (state.fanSpeed !== null && state.autoMode !== true) this.lastManualFanSpeed = state.fanSpeed;
    if (state.tiltAngleInDegrees !== null && state.tiltAngleInDegrees !== 'breeze') this.lastTiltAngle = state.tiltAngleInDegrees;
    // A controller wrote meanwhile: the command about to be sent reads these attributes. While the node is offline, the
    // state is kept and the read once it is online writes it.
    if (this.hasPendingCommand || this.isWaitingForNode()) return;
    try {
      await this.setReachable(true);
      if (this.sensors !== undefined) await applySensors(this, this.layout, this.sensors);
      await applyState(this, this.layout, state, this.sensors?.temperatureInC ?? null);
    } catch (error) {
      this.log.warn(`"${this.name}" state could not be written to Matter: ${getErrorMessage(error)}`);
    }
  }

  private recordError(error: unknown): void {
    this.lastError = getErrorMessage(error);
    this.lastErrorStatus = getErrorStatus(error);
  }

  private async handleReadFailure(error: unknown): Promise<void> {
    this.failureCount += 1;
    this.recordError(error);
    this.log.debug(`"${this.name}" did not answer (${this.failureCount} in a row): ${this.lastError}`);
    if (this.failureCount !== unreachableAfterFailures) return;
    this.log.warn(`"${this.name}" is unreachable: ${this.lastError}`);
    await this.setReachableQuietly(false);
  }

  // The client gave up connecting again by itself: the next poll connects.
  private handleDisconnect(): void {
    this.isConnected = false;
    if (this.isDisposed || this.isSuspended) return;
    this.log.warn(`"${this.name}" lost its connection, which is tried again at the next poll`);
    void this.enqueue(async () => this.setReachableQuietly(false));
  }

  // While the node is offline, the read once it is online tells whether the machine is reachable.
  private async setReachableQuietly(isReachable: boolean): Promise<void> {
    if (this.isWaitingForNode()) return;
    try {
      await this.setReachable(isReachable);
    } catch (error) {
      this.log.debug(`"${this.name}" reachability could not be written to Matter: ${getErrorMessage(error)}`);
    }
  }

  private async setReachable(isReachable: boolean): Promise<void> {
    if (this.isReachable !== isReachable) this.log.notice(`"${this.name}" is ${isReachable ? 'reachable' : 'unreachable'}`);
    this.isReachable = isReachable;
    for (const endpoint of this.endpoints) {
      const hasChanged = await endpoint.updateAttribute(BridgedDeviceBasicInformation, 'reachable', isReachable);
      if (hasChanged) await endpoint.triggerEvent(BridgedDeviceBasicInformation, 'reachableChanged', { reachableNewValue: isReachable });
    }
  }

  private async disconnectClient(client: MachineClient): Promise<void> {
    try {
      await client.disconnect();
    } catch (error) {
      this.log.debug(`"${this.name}" connection did not close cleanly: ${getErrorMessage(error)}`);
    }
  }
}
