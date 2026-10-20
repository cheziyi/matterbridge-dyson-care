/**
 * @file src/module.ts
 * @description This file contains the Matterbridge platform for Dyson purifiers, fans, heaters and humidifiers controlled on the LAN and through the Dyson cloud.
 * @author Luca Liguori
 * @contributor Calvin Che
 * @created 2025-06-15
 * @version 3.0.0
 * @license Apache-2.0
 *
 * Copyright 2025, 2026, 2027 Luca Liguori.
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

import {
  type DysonAccount,
  type DysonMachine,
  EnvironmentalCareClient,
  type EnvironmentalCareCapabilities,
  type EnvironmentalCareSensors,
  getCountries,
  getMachines,
  login,
  requestLoginCode,
} from 'dyson-control';
import { MatterbridgeDynamicPlatform, type MatterbridgeEndpoint, type PlatformConfig, type PlatformMatterbridge } from 'matterbridge';
import type { AnsiLogger, LogLevel } from 'matterbridge/logger';

import { DysonAccessory, type MachineClientFactory } from './accessory/dysonAccessory.js';
import {
  type DysonAccountConfig,
  type DysonDeviceConfig,
  type DysonPlatformConfig,
  getUnreadableDevices,
  hasSameExposure,
  hasSameMachine,
  isTriedOnLan,
  normalizePollInterval,
  parseAccountConfig,
  parseDeviceConfigs,
  toDysonMachine,
  withoutLanPassword,
} from './config.js';
import { addReportedSensors, fitToCapabilities, getAvailableControls, hasSameControls, noReportedSensors, type ReportedSensors } from './controls.js';
import { describeSignInFailure, getErrorMessage, isSignInRequired, type SignInStep, signInRequiredStatus } from './errors.js';
import { getMachineUpdate } from './platform/machineSync.js';
import { SensorStore } from './platform/sensorStore.js';
import { parseSetupRevision, SetupRevisions } from './platform/setupRevisions.js';
import { getMachineSupport, probeMachine, type ProbeResult, searchLan } from './setup/probe.js';
import { type FoundMachine, getMachineReport, handleSetupRequest, type SetupDevice, type SetupPlatform, type SetupState, type SignInRequest } from './setup/setupApi.js';

/** How often, in milliseconds, the machine list of the account is read to keep the firmware of each machine up to date. */
export const machineSyncIntervalInMs = 15 * 60 * 1000;

/** How long, in milliseconds, a call waits for each of the cloud, the broker and the machine. A machine whose own broker does not answer on the LAN is reached through the cloud after it. */
export const machineTimeoutInMs = 10_000;

const requiredMatterbridgeVersion = '3.10.10';

export type { DysonPlatformConfig } from './config.js';

/**
 * This is the standard interface for Matterbridge plugins.
 * Each plugin should export a default function that follows this signature.
 *
 * @param {PlatformMatterbridge} matterbridge - An instance of MatterBridge.
 * @param {AnsiLogger} log - An instance of AnsiLogger. This is used for logging messages in a format that can be displayed with ANSI color codes and in the frontend.
 * @param {DysonPlatformConfig} config - The platform configuration.
 * @returns {DysonPlatform} - An instance of the MatterbridgeAccessory or MatterbridgeDynamicPlatform class. This is the main interface for interacting with the Matterbridge system.
 */
export default function initializePlugin(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: DysonPlatformConfig): DysonPlatform {
  return new DysonPlatform(matterbridge, log, config);
}

/**
 * The platform: it holds the Dyson account, stores the devices by the serial number of their machine, keeps their
 * firmware up to date, exposes each one to Matter and serves the guided setup.
 */
export class DysonPlatform extends MatterbridgeDynamicPlatform implements SetupPlatform {
  private account: DysonAccountConfig | undefined;
  /** Whether the cloud refused the account's token, so that it has to be signed in again. */
  private isAccountRejected = false;
  private devices: DysonDeviceConfig[];
  /** The stored devices this version cannot read, which are stored again as they are. */
  private unreadableDevices: unknown[];
  /** The running devices, by the serial number of their machine. */
  private readonly accessories = new Map<string, DysonAccessory>();
  private readonly sensorStore = new SensorStore(() => this.context);
  /** Why a stored device is not running, by the serial number of its machine. */
  private readonly startErrors = new Map<string, string>();
  /** What the sensors of a machine read at the last successful setup check, by its serial number, until the device is stored. */
  private readonly probedSensors = new Map<string, EnvironmentalCareSensors>();
  private pollTimer: NodeJS.Timeout | undefined;
  private syncTimer: NodeJS.Timeout | undefined;
  private pollIntervalInSeconds: number;
  private readonly revisions: SetupRevisions;
  /** The devices whose machine is being read, so that a machine that is slow to answer holds up no other. */
  private readonly polling = new Set<DysonAccessory>();
  private machineList: Promise<DysonMachine[]> | undefined;
  /** The password of the broker of each machine on the LAN, by its serial number, as the machine list of the account last reported it: the setup page never sees it, so a device it saves takes it from here. */
  private readonly lanPasswords = new Map<string, string>();
  // Changes to the device list run one after the other.
  private changes: Promise<void> = Promise.resolve();

  constructor(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: DysonPlatformConfig) {
    // Always call super(matterbridge, log, config)
    super(matterbridge, log, config);

    // Verify that Matterbridge is the correct version
    if (typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion(requiredMatterbridgeVersion)) {
      throw new Error(
        `This plugin requires Matterbridge version >= "${requiredMatterbridgeVersion}". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend.`,
      );
    }

    this.log.info(`Initializing platform ${this.config.name}...`);
    this.account = parseAccountConfig(config.account);
    if (config.account !== undefined && this.account === undefined) this.log.warn('The stored Dyson account cannot be read: sign in again in the setup page');
    this.devices = parseDeviceConfigs(config.devices, (message) => this.log.warn(message));
    this.unreadableDevices = getUnreadableDevices(config.devices, this.devices);
    this.revisions = new SetupRevisions(config.setupRevision);
    this.pollIntervalInSeconds = normalizePollInterval(config.pollIntervalInSeconds);
    this.log.info(`Platform ${this.config.name} initialized successfully`);
  }

  override async onStart(reason?: string): Promise<void> {
    this.log.info(`Starting platform ${this.config.name} with reason: ${reason ?? 'no reason provided'}...`);

    // Wait for the platform storage, which holds the readings each machine has given.
    await this.ready;

    if (this.account === undefined && this.devices.length > 0) this.log.warn('No Dyson account is signed in: sign in in the setup page to start the devices');
    for (const device of this.devices) await this.startDevice(device);
    this.startTimers();
    // The stored firmware may be out of date: do not hold the start for the cloud.
    void this.syncMachines();

    this.log.info(`Platform ${this.config.name} started successfully`);
  }

  override async onConfigure(): Promise<void> {
    // Always call super.onConfigure()
    await super.onConfigure();

    this.log.info(`Configuring platform ${this.config.name}...`);
    await this.pollDevices();
    this.log.info(`Platform ${this.config.name} configured successfully`);
  }

  // oxlint-disable-next-line typescript/require-await
  override async onChangeLoggerLevel(logLevel: LogLevel): Promise<void> {
    this.log.info(`onChangeLoggerLevel called with: ${logLevel}`);
  }

  override async onShutdown(reason?: string): Promise<void> {
    // Always call super.onShutdown(reason)
    await super.onShutdown(reason);

    this.log.info(`Shutting down platform ${this.config.name} with reason: ${reason ?? 'no reason provided'}...`);

    this.stopTimers();
    await this.changes;
    for (const accessory of this.accessories.values()) await accessory.dispose();
    this.accessories.clear();
    if (this.config.unregisterOnShutdown) await this.unregisterAllDevices();

    this.log.info(`Platform ${this.config.name} shut down successfully`);
  }

  /**
   * Apply a configuration saved in the Matterbridge config editor
   *
   * The editor changes the poll interval. The account and the devices are set up in the setup page alone, and the
   * editor does not list them.
   *
   * The editor still holds the whole configuration it loaded with its page, and sends all of it back. Saved after the
   * setup page changed the account or the devices meanwhile, that copy holds those of before: it is recognized by its
   * revision, and the account and the devices are stored again as they are.
   *
   * @param {PlatformConfig} config The saved configuration.
   * @returns {Promise<void>} Resolves when the configuration is applied.
   */
  // oxlint-disable-next-line typescript/require-await
  override async onConfigChanged(config: PlatformConfig): Promise<void> {
    if (this.pollTimer === undefined) return;
    // A configuration this plugin stored itself comes back here within moments, with nothing in it to apply.
    const revision = parseSetupRevision(config.setupRevision);
    if (this.revisions.acknowledge(revision)) return;
    const pollIntervalInSeconds = normalizePollInterval(config.pollIntervalInSeconds);
    if (pollIntervalInSeconds !== this.pollIntervalInSeconds) {
      this.pollIntervalInSeconds = pollIntervalInSeconds;
      this.startTimers();
    }
    if (revision !== this.revisions.current) this.storeConfig();
  }

  /**
   * Serve the setup page's requests to `/plugins/<plugin name>/api/<path>`
   *
   * @param {string} method The HTTP method.
   * @param {string} [path] The path after `api/`.
   * @param {Record<string, unknown>} [query] The query string parameters.
   * @param {unknown} [body] The parsed JSON body.
   * @returns {Promise<unknown>} The JSON reply, or undefined for a path the plugin does not serve.
   */
  override async onFetch(method: string, path?: string, query?: Record<string, unknown>, body?: unknown): Promise<unknown> {
    return handleSetupRequest(this, method, path, query, body);
  }

  /**
   * Describe the account and the stored devices for the setup page
   *
   * @returns {Promise<SetupState>} The account without its token, and each device with how it is doing and the readings its machine has given.
   */
  async getSetupState(): Promise<SetupState> {
    const devices: SetupDevice[] = [];
    for (const device of this.devices) {
      const accessory = this.accessories.get(device.serialNumber);
      const status = accessory?.getStatus();
      let state: SetupDevice['status'] = 'stopped';
      if (status?.isReachable === true) state = 'online';
      else if (status?.isConnecting === true) state = 'connecting';
      else if (status !== undefined) state = 'offline';
      const capabilities = accessory?.capabilities ?? this.readCapabilities(device);
      devices.push({
        ...withoutLanPassword(device),
        status: state,
        isTriedOnLan: isTriedOnLan(device),
        hostType: status?.hostType,
        error: status === undefined ? this.startErrors.get(device.serialNumber) : status.lastError,
        capabilities,
        controls: capabilities === undefined ? undefined : getAvailableControls(capabilities),
        reportedSensors: (await this.sensorStore.read(device)) ?? noReportedSensors,
        report: getMachineReport(status?.state, status?.faults),
      });
    }
    const { account } = this;
    return { account: account === undefined ? undefined : { email: account.email, country: account.country, needsSignIn: this.isAccountRejected }, devices };
  }

  /**
   * List the countries the cloud registers accounts in, for the setup page
   *
   * @returns {Promise<string[]>} Such as `["GB", "US"]`, in alphabetical order.
   */
  async getCountries(): Promise<string[]> {
    return (await getCountries({ timeoutInMs: machineTimeoutInMs })).toSorted();
  }

  /**
   * Have the cloud email a login code to an account
   *
   * @param {string} email The address of the account.
   * @param {string} country The country of the account, as two capital letters. The cloud answers the same in any culture, so dyson-control's default one is used.
   * @returns {Promise<string>} The challenge id to sign in with, with the code.
   * @throws {Error} When the cloud refuses the address or does not answer, with what went wrong and its HTTP status.
   */
  async requestLoginCode(email: string, country: string): Promise<string> {
    try {
      return await requestLoginCode({ email, country, timeoutInMs: machineTimeoutInMs });
    } catch (error) {
      throw this.signInFailure(error, 'code', `Dyson did not email a login code to ${email}`);
    }
  }

  /**
   * Sign in to an account, store it and connect every stored device through it
   *
   * The password is used once and never stored: the account holds a token.
   *
   * @param {SignInRequest} request The address, the password, the emailed code and its challenge id, and the country.
   * @returns {Promise<void>} Resolves when the account is stored and the devices are connected through it.
   * @throws {Error} When the cloud refuses the password or the code, with what went wrong and its HTTP status.
   */
  async signIn(request: SignInRequest): Promise<void> {
    const { email, password, challengeId, otpCode, country } = request;
    let account: DysonAccount;
    try {
      account = await login({ email, password, challengeId, otpCode, country, timeoutInMs: machineTimeoutInMs });
    } catch (error) {
      throw this.signInFailure(error, 'login', `The sign in to the Dyson account ${email} failed`);
    }
    this.log.notice(`Signed in to the Dyson account ${email}`);
    const signedIn: DysonAccountConfig = { ...account, email };
    await this.enqueueChange(async () => {
      this.account = signedIn;
      this.isAccountRejected = false;
      this.storeConfig();
      for (const device of this.devices) {
        const accessory = this.accessories.get(device.serialNumber);
        if (accessory === undefined) await this.startDevice(device);
        else await accessory.updateConnection(this.createClientFactory(device, signedIn));
      }
    });
    void this.syncMachines();
  }

  /**
   * Forget the account
   *
   * The devices stay in Matter, with their rooms and their automations, and are unreachable until an account is signed
   * in again.
   *
   * @returns {Promise<void>} Resolves when the account is forgotten and every device is disconnected.
   */
  async signOut(): Promise<void> {
    await this.enqueueChange(async () => {
      this.account = undefined;
      this.isAccountRejected = false;
      this.storeConfig();
      for (const accessory of this.accessories.values()) await accessory.suspend();
    });
    this.log.notice('Signed out of the Dyson account');
  }

  /**
   * List the machines of the account, for the setup page
   *
   * The list also brings the firmware of the stored devices up to date.
   *
   * @returns {Promise<FoundMachine[]>} The machines, each marked when it is stored already and when the plugin cannot control it.
   * @throws {Error} When no account is signed in, or the cloud does not answer.
   */
  async listMachines(): Promise<FoundMachine[]> {
    const { account } = this;
    if (account === undefined) throw new Error('Sign in to your Dyson account first');
    const machines = await this.readMachines(account);
    await this.applyMachines(machines);
    return machines.map((machine) => ({
      ...withoutLanPassword(machine),
      isConfigured: this.devices.some((stored) => stored.serialNumber === machine.serialNumber),
      support: getMachineSupport(machine, account),
    }));
  }

  /**
   * Check whether a machine answers through the cloud, and search the LAN for it at the same time
   *
   * @param {DysonMachine} machine The machine to check.
   * @returns {Promise<ProbeResult>} `ready` with the readings the machine is known to have given and whether the search found it, or the failure that stands in the way.
   */
  async probe(machine: DysonMachine): Promise<ProbeResult> {
    const { account } = this;
    if (account === undefined) return { status: 'signInRequired', machine, message: 'No Dyson account is signed in' };
    // The setup page never sees the password of the broker of the machine on the LAN, which the search needs.
    const apPasswordHash = this.lanPasswords.get(machine.serialNumber) ?? this.devices.find((device) => device.serialNumber === machine.serialNumber)?.apPasswordHash;
    const [result, isFoundOnLan] = await Promise.all([probeMachine(machine, account), apPasswordHash === undefined ? undefined : searchLan({ ...machine, apPasswordHash })]);
    if (result.status === 'signInRequired') this.rejectAccount();
    if (result.sensors === undefined) return result;
    this.probedSensors.set(machine.serialNumber, result.sensors);
    // A reading the machine gave before still counts, whether or not this check got it.
    const known = (await this.sensorStore.read(machine)) ?? noReportedSensors;
    return { ...result, isFoundOnLan, reportedSensors: addReportedSensors(known, result.sensors) };
  }

  /**
   * Store a device, adding it or replacing the stored device of the same machine
   *
   * @param {DysonDeviceConfig} device The device.
   * @returns {Promise<void>} Resolves when the device is stored and started, restarted or updated.
   * @throws {Error} When another stored device already has the name.
   */
  async saveDevice(device: DysonDeviceConfig): Promise<void> {
    const stored = this.devices.find((candidate) => candidate.serialNumber === device.serialNumber);
    if (this.devices.some((candidate) => candidate !== stored && candidate.name === device.name)) throw new Error(`Another machine is already named "${device.name}"`);
    const sensors = this.probedSensors.get(device.serialNumber);
    if (sensors !== undefined) {
      // A reading the machine gave before still counts, whether or not the check got it.
      await this.sensorStore.write(device, addReportedSensors((await this.sensorStore.read(device)) ?? noReportedSensors, sensors));
      this.probedSensors.delete(device.serialNumber);
    }
    // The setup page never sees the password of the broker of the machine on the LAN.
    const apPasswordHash = this.lanPasswords.get(device.serialNumber) ?? stored?.apPasswordHash;
    const withPassword: DysonDeviceConfig = apPasswordHash === undefined ? withoutLanPassword(device) : { ...device, apPasswordHash };
    const capabilities = this.readCapabilities(withPassword);
    const next = capabilities === undefined ? withPassword : fitToCapabilities(withPassword, capabilities);
    const devices = stored === undefined ? [...this.devices, next] : this.devices.map((candidate) => (candidate === stored ? next : candidate));
    await this.applyDevices(devices);
  }

  /**
   * Remove a stored device and its Matter endpoints
   *
   * @param {string} serialNumber The serial number of its machine.
   * @returns {Promise<boolean>} False when no device has that machine.
   */
  async removeDevice(serialNumber: string): Promise<boolean> {
    if (!this.devices.some((device) => device.serialNumber === serialNumber)) return false;
    await this.applyDevices(this.devices.filter((device) => device.serialNumber !== serialNumber));
    return true;
  }

  /**
   * Read the machine list of the account and store the firmware and the room name of each stored device that changed
   *
   * A failed read is logged, never thrown.
   *
   * @returns {Promise<void>} Resolves when the stored devices are up to date and the devices that could not start were retried.
   */
  async syncMachines(): Promise<void> {
    const { account } = this;
    if (account === undefined) return;
    try {
      await this.applyMachines(await this.readMachines(account));
    } catch (error) {
      this.log.warn(`The machines of the Dyson account could not be read: ${getErrorMessage(error)}`);
    }
    try {
      await this.enqueueChange(async () => this.startStoppedDevices());
    } catch {
      // enqueueChange logged it.
    }
  }

  /**
   * Read the state and the readings of every running device once
   *
   * A device whose machine has not answered the read before this one is left out, so that the others are still read on
   * time. A machine that gave a reading its device shows nowhere yet has the device built again in Matter, with a
   * place for it.
   *
   * @returns {Promise<void>} Resolves when every device that was read answered or failed.
   */
  async pollDevices(): Promise<void> {
    if (this.account === undefined) return;
    const idle = [...this.accessories.values()].filter((accessory) => !this.polling.has(accessory));
    try {
      await Promise.all(
        idle.map(async (accessory) => {
          this.polling.add(accessory);
          try {
            await accessory.refresh();
            if (accessory.getStatus().lastErrorStatus === signInRequiredStatus) this.rejectAccount();
          } finally {
            this.polling.delete(accessory);
          }
        }),
      );
      await this.enqueueChange(async () => this.exposeNewSensors());
    } catch {
      // enqueueChange logged it.
    }
  }

  // Logged, since the setup page shows the reason and the log is where it is looked for afterwards.
  private signInFailure(error: unknown, step: SignInStep, what: string): Error {
    const description = describeSignInFailure(error, step);
    this.log.warn(`${what}: ${description}`);
    return new Error(description);
  }

  private rejectAccount(): void {
    if (!this.isAccountRejected) this.log.warn('The Dyson cloud no longer accepts the account: sign in again in the setup page');
    this.isAccountRejected = true;
  }

  private async readMachines(account: DysonAccountConfig): Promise<DysonMachine[]> {
    // Two reads at once would ask the cloud twice for the same list.
    this.machineList ??= getMachines(account, { timeoutInMs: machineTimeoutInMs }).finally(() => {
      this.machineList = undefined;
    });
    try {
      const machines = await this.machineList;
      this.isAccountRejected = false;
      for (const { serialNumber, apPasswordHash } of machines) {
        if (apPasswordHash === undefined) this.lanPasswords.delete(serialNumber);
        else this.lanPasswords.set(serialNumber, apPasswordHash);
      }
      return machines;
    } catch (error) {
      if (isSignInRequired(error)) this.rejectAccount();
      throw error;
    }
  }

  private startTimers(): void {
    this.stopTimers();
    this.pollTimer = setInterval(() => void this.pollDevices(), this.pollIntervalInSeconds * 1000);
    this.pollTimer.unref();
    this.syncTimer = setInterval(() => void this.syncMachines(), machineSyncIntervalInMs);
    this.syncTimer.unref();
  }

  private stopTimers(): void {
    clearInterval(this.pollTimer);
    clearInterval(this.syncTimer);
    this.pollTimer = undefined;
    this.syncTimer = undefined;
  }

  private async enqueueChange(task: () => Promise<void>): Promise<void> {
    const result = this.changes.then(task);
    this.changes = result.catch((error: unknown) => {
      this.log.error(`A change to the devices failed: ${getErrorMessage(error)}`);
    });
    return result;
  }

  /**
   * Read what a stored machine takes, without connecting
   *
   * @param {DysonDeviceConfig} device The device.
   * @returns {EnvironmentalCareCapabilities | undefined} The capabilities, or undefined when no account is signed in or the plugin does not know the type of the machine.
   */
  private readCapabilities(device: DysonDeviceConfig): EnvironmentalCareCapabilities | undefined {
    const { account } = this;
    if (account === undefined) return undefined;
    try {
      return new EnvironmentalCareClient(toDysonMachine(device), { account }).capabilities;
    } catch {
      return undefined;
    }
  }

  // The machine's own broker on the LAN first, at its host or found by a search, and the cloud's when it does not answer;
  // or the cloud's alone, with no search to wait for.
  private createClientFactory(device: DysonDeviceConfig, account: DysonAccountConfig): MachineClientFactory {
    const brokers = isTriedOnLan(device) ? { host: device.host } : { local: false as const };
    return (handlers) => new EnvironmentalCareClient(toDysonMachine(device), { account, ...brokers, timeoutInMs: machineTimeoutInMs, ...handlers });
  }

  private async applyMachines(machines: DysonMachine[]): Promise<void> {
    await this.enqueueChange(async () => {
      const devices = this.devices.map((stored) => {
        const updated = getMachineUpdate(stored, machines, this.log);
        if (updated === undefined) return stored;
        if (updated.firmwareVersion !== stored.firmwareVersion) this.log.notice(`"${updated.name}" now runs the firmware ${updated.firmwareVersion ?? 'the cloud does not name'}`);
        return updated;
      });
      if (devices.some((device, index) => device !== this.devices[index])) await this.reconcile(devices);
    });
  }

  // Stores the account and the devices, under a new revision.
  private storeConfig(): void {
    this.config.setupRevision = this.revisions.advance();
    this.config.account = this.account;
    // A device this version cannot read stays stored, until one with its name or its serial number takes its place.
    this.unreadableDevices = getUnreadableDevices(this.unreadableDevices, this.devices);
    this.config.devices = [...this.devices, ...this.unreadableDevices];
    this.saveConfig(this.config);
  }

  /**
   * Make the running devices match a new device list
   *
   * @param {DysonDeviceConfig[]} devices The new list.
   * @returns {Promise<void>} Resolves when every device is started, stopped, restarted or updated.
   */
  private async applyDevices(devices: DysonDeviceConfig[]): Promise<void> {
    await this.enqueueChange(async () => this.reconcile(devices));
  }

  // Runs inside the queue of changes.
  private async reconcile(devices: DysonDeviceConfig[]): Promise<void> {
    const previous = this.devices;
    // A machine whose firmware changed may take other settings.
    this.devices = devices.map((device) => {
      const capabilities = this.readCapabilities(device);
      return capabilities === undefined ? device : fitToCapabilities(device, capabilities);
    });
    this.storeConfig();
    for (const device of previous) {
      if (!this.devices.some((candidate) => candidate.serialNumber === device.serialNumber)) await this.stopDevice(device, true);
    }
    for (const device of this.devices) {
      const before = previous.find((candidate) => candidate.serialNumber === device.serialNumber);
      const accessory = this.accessories.get(device.serialNumber);
      if (before === undefined || accessory === undefined) {
        await this.startDevice(device);
      } else if (!hasSameExposure(before, device) || !this.hasSameControls(accessory, device)) {
        if (hasSameExposure(before, device)) this.log.notice(`"${device.name}" takes other settings than when it was set up: it is built again in Matter`);
        // The name and the clusters of a registered endpoint cannot change, so the endpoints are built again.
        await this.stopDevice(before, false);
        await this.startDevice(device);
      } else if (!hasSameMachine(before, device) && this.account !== undefined) {
        await accessory.updateConnection(this.createClientFactory(device, this.account));
      }
    }
  }

  private hasSameControls(accessory: DysonAccessory, device: DysonDeviceConfig): boolean {
    const capabilities = this.readCapabilities(device);
    return capabilities === undefined || hasSameControls(accessory.capabilities, capabilities);
  }

  private async startStoppedDevices(): Promise<void> {
    for (const device of this.devices) {
      if (!this.accessories.has(device.serialNumber)) await this.startDevice(device);
    }
  }

  /**
   * Create the Matter endpoints of a device and register them
   *
   * A device that cannot start is logged and retried on the next read of the machine list, never thrown.
   *
   * @param {DysonDeviceConfig} device The device.
   * @param {ReportedSensors} [knownSensors] The readings its machine has given. Left out, the stored ones are used.
   * @returns {Promise<void>} Resolves when the device runs, or could not be started.
   */
  private async startDevice(device: DysonDeviceConfig, knownSensors?: ReportedSensors): Promise<void> {
    const { account } = this;
    if (account === undefined) {
      this.startErrors.set(device.serialNumber, 'No Dyson account is signed in: sign in in the setup page');
      return;
    }
    const registered: MatterbridgeEndpoint[] = [];
    let accessory: DysonAccessory | undefined;
    try {
      const reportedSensors = knownSensors ?? (await this.sensorStore.read(device)) ?? noReportedSensors;
      accessory = new DysonAccessory({
        config: device,
        createClient: this.createClientFactory(device, account),
        reportedSensors,
        log: this.log,
        vendorId: this.matterbridge.aggregatorVendorId,
      });
      for (const endpoint of accessory.endpoints) {
        await this.registerDevice(endpoint);
        registered.push(endpoint);
      }
      await accessory.clearReadings();
      this.accessories.set(device.serialNumber, accessory);
      this.startErrors.delete(device.serialNumber);
      this.log.info(`"${device.name}" started with ${accessory.endpoints.length} Matter endpoint(s)`);
      // Not awaited: a machine that does not answer must not hold up the start of the others.
      void accessory.start();
    } catch (error) {
      const message = getErrorMessage(error);
      if (this.startErrors.get(device.serialNumber) !== message) this.log.warn(`"${device.name}" could not be started and will be retried: ${message}`);
      this.startErrors.set(device.serialNumber, message);
      for (const endpoint of registered) await this.unregisterDevice(endpoint);
      await accessory?.dispose();
    }
  }

  /**
   * Build again in Matter each device whose machine gave a reading it shows nowhere yet
   *
   * Runs inside the queue of changes.
   *
   * @returns {Promise<void>} Resolves when every such device has a place for the reading.
   */
  private async exposeNewSensors(): Promise<void> {
    for (const device of this.devices) {
      const news = this.accessories.get(device.serialNumber)?.takeNewlyReportedSensors();
      if (news === undefined) continue;
      const { reported } = news;
      await this.sensorStore.write(device, reported);
      if (!news.needsRebuild) continue;
      this.log.notice(`"${device.name}" gave a reading it shows nowhere in Matter yet: it is built again in Matter`);
      await this.stopDevice(device, false);
      await this.startDevice(device, reported);
    }
  }

  private async stopDevice(device: DysonDeviceConfig, shouldForget: boolean): Promise<void> {
    const { name, serialNumber } = device;
    const accessory = this.accessories.get(serialNumber);
    this.accessories.delete(serialNumber);
    this.startErrors.delete(serialNumber);
    if (accessory !== undefined) {
      await accessory.dispose();
      for (const endpoint of accessory.endpoints) await this.unregisterDevice(endpoint);
      this.log.info(`"${name}" stopped`);
    }
    if (shouldForget) await this.sensorStore.remove(device);
  }
}
