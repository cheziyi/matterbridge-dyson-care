/**
 * @file vitest/fakeDyson.ts
 * @description This file contains the fake Dyson machine and fixtures shared by the tests.
 * @author Calvin Che
 */

/* oxlint-disable typescript/require-await */
/* oxlint-disable typescript/no-unsafe-type-assertion */

import {
  type DysonMachine,
  EnvironmentalCareClient,
  type EnvironmentalCareCapabilities,
  type EnvironmentalCareControl,
  type EnvironmentalCareSensors,
  type EnvironmentalCareState,
} from 'dyson-control';
import type { Mock } from 'vitest';

import type { MachineClient, MachineClientFactory, MachineClientHandlers } from '../src/accessory/dysonAccessory.js';
import type { DysonAccountConfig, DysonDeviceConfig } from '../src/config.js';

export const account: DysonAccountConfig = {
  email: 'someone@example.com',
  accountId: 'account-1',
  token: 'token-1',
  tokenType: 'Bearer',
  country: 'GB',
  culture: 'en-GB',
};

/** A Purifier Cool whose firmware takes two oscillation angles: it purifies, turns its air to the back and has an auto mode. */
export const purifierCool: DysonMachine = {
  serialNumber: 'NK6-EU-MHA0001A',
  type: '438',
  category: 'environmentalCare',
  name: 'Living Room',
  productName: 'Purifier Cool',
  firmwareVersion: '0612.1',
  firmwareCapabilities: ['AdvanceOscillationDay1'],
};

/** A Hot+Cool heater with preset oscillation angles alone. */
export const hotCool: DysonMachine = {
  serialNumber: 'NK6-EU-MHA0002A',
  type: '527',
  category: 'environmentalCare',
  name: 'Bedroom',
  productName: 'Purifier Hot+Cool',
  firmwareCapabilities: ['AdvanceOscillationDay0'],
};

/** A Humidify+Cool, whose barrel turns to a preset angle or breezes. */
export const humidifyCool: DysonMachine = { serialNumber: 'NK6-EU-MHA0003A', type: '358', category: 'environmentalCare', name: 'Nursery', productName: 'Purifier Humidify+Cool' };

/** A cooling fan that measures no air and has no auto mode. */
export const coolFan: DysonMachine = { serialNumber: 'NK6-EU-MHA0004A', type: '739', category: 'environmentalCare', name: 'Study', productName: 'Cool Tower' };

/**
 * Read what a machine takes, as the client of dyson-control decodes it
 *
 * @param {DysonMachine} machine The machine.
 * @returns {EnvironmentalCareCapabilities} Its capabilities.
 */
export function capabilitiesOf(machine: DysonMachine): EnvironmentalCareCapabilities {
  return new EnvironmentalCareClient(machine, { account }).capabilities;
}

/**
 * Build a stored device
 *
 * @param {DysonMachine} machine The machine of the device.
 * @param {Partial<DysonDeviceConfig>} overrides The fields to replace.
 * @returns {DysonDeviceConfig} The device, with every control native and every sensor asked for, as devices of their own.
 */
export function createDeviceConfig(machine: DysonMachine = purifierCool, overrides: Partial<DysonDeviceConfig> = {}): DysonDeviceConfig {
  return {
    name: machine.name ?? 'Unnamed',
    serialNumber: machine.serialNumber,
    type: machine.type,
    productName: machine.productName,
    firmwareVersion: machine.firmwareVersion,
    firmwareCapabilities: machine.firmwareCapabilities,
    deviceType: 'airPurifier',
    fanControl: 'steps',
    fanAutoControl: 'native',
    oscillationControl: 'native',
    nightModeControl: 'native',
    airflowDirectionControl: 'native',
    heatControl: 'thermostat',
    humidificationControl: 'select',
    hasContinuousMonitoringSwitch: false,
    hasAirQualitySensor: true,
    hasTemperatureSensor: true,
    hasHumiditySensor: true,
    isComposed: false,
    ...overrides,
  };
}

/**
 * Build the readings of a machine that measures every pollutant
 *
 * @param {Partial<EnvironmentalCareSensors>} overrides The readings to replace.
 * @returns {EnvironmentalCareSensors} The readings.
 */
export function createSensors(overrides: Partial<EnvironmentalCareSensors> = {}): EnvironmentalCareSensors {
  return {
    temperatureInC: 21.5,
    humidityInPercent: 45,
    pm25InUgPerM3: 12,
    pm25Index: 2,
    pm10InUgPerM3: 15,
    pm10Index: 1,
    volatileOrganicCompoundsIndex: 5,
    nitrogenDioxideIndex: 1,
    formaldehydeInUgPerM3: null,
    formaldehydeIndex: null,
    carbonDioxideInPpm: null,
    carbonDioxideIndex: null,
    sleepTimerInMinutes: null,
    ...overrides,
  };
}

/**
 * Build the readings of a machine that has given none yet
 *
 * @returns {EnvironmentalCareSensors} Every reading null.
 */
export function createEmptySensors(): EnvironmentalCareSensors {
  return createSensors({
    temperatureInC: null,
    humidityInPercent: null,
    pm25InUgPerM3: null,
    pm25Index: null,
    pm10InUgPerM3: null,
    pm10Index: null,
    volatileOrganicCompoundsIndex: null,
    nitrogenDioxideIndex: null,
  });
}

/**
 * Do nothing: what a client calls back before an accessory gives it handlers of its own
 *
 * @returns {void}
 */
function ignore(): void {
  // Intentionally empty.
}

export interface FakeClient extends MachineClient {
  state: EnvironmentalCareState;
  sensors: EnvironmentalCareSensors;
  /** What the accessory gave the client to call it back with. */
  handlers: MachineClientHandlers;
  connect: Mock<() => Promise<void>>;
  disconnect: Mock<() => Promise<void>>;
  getState: Mock<() => Promise<EnvironmentalCareState>>;
  setState: Mock<(control: EnvironmentalCareControl) => Promise<void>>;
  getSensors: Mock<() => Promise<EnvironmentalCareSensors>>;
}

/**
 * Build a client that holds the state of its machine in memory, and changes it as a machine does
 *
 * @param {DysonMachine} machine The machine, whose capabilities the client takes.
 * @param {Partial<EnvironmentalCareState>} state The fields of the state to replace.
 * @returns {FakeClient} The client, with every method a mock. Its handlers are a no-op until a factory gives it others.
 */
export function createFakeClient(machine: DysonMachine = purifierCool, state: Partial<EnvironmentalCareState> = {}): FakeClient {
  const client = {} as FakeClient;
  const methods: FakeClient = {
    capabilities: capabilitiesOf(machine),
    handlers: { onState: ignore, onSensors: ignore, onReconnect: ignore, onDisconnect: ignore },
    state: {
      fanPower: true,
      autoMode: false,
      fanSpeed: 4,
      oscillationMode: 'off',
      oscillationAngles: { lowerInDegrees: 135, upperInDegrees: 225 },
      oscillationPresetAngleInDegrees: 'custom',
      nightMode: false,
      continuousMonitoring: true,
      sleepTimerInMinutes: 'off',
      fanAirDirection: 'forward',
      heatMode: null,
      targetTemperatureInC: null,
      humidificationMode: null,
      autoHumidification: null,
      manualHumidificationTargetInPercent: null,
      ...state,
    },
    sensors: createSensors(),
    connect: vi.fn(async () => Promise.resolve()),
    disconnect: vi.fn(async () => Promise.resolve()),
    getState: vi.fn(async () => ({ ...client.state })),
    // As dyson-control and the machine do: a speed or the auto mode turn the machine on, and a speed leaves the auto mode.
    setState: vi.fn(async (control: EnvironmentalCareControl) => {
      const runs = control.autoMode !== undefined || control.fanSpeed !== undefined;
      Object.assign(client.state, control);
      if (control.fanPower === undefined && runs) client.state.fanPower = true;
      if (control.fanSpeed !== undefined && control.autoMode === undefined) client.state.autoMode = false;
      if (control.autoMode === true) client.state.fanSpeed = null;
    }),
    getSensors: vi.fn(async () => ({ ...client.sensors })),
  };
  Object.assign(client, methods);
  return client;
}

/**
 * Build the factory an accessory creates its client with, handing out a given fake client
 *
 * @param {FakeClient} client The client to hand out, which takes the handlers of the accessory.
 * @returns {MachineClientFactory} The factory.
 */
export function factoryOf(client: FakeClient): MachineClientFactory {
  return (handlers) => {
    client.handlers = handlers;
    return client;
  };
}
