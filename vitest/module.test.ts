/**
 * @file vitest/module.test.ts
 * @description This file contains the tests for the Dyson platform.
 * @author Calvin Che
 */

/* oxlint-disable unicorn/no-useless-undefined */

/**
 * WARNING!!!
 * The tests in this unit are supposed to run sequentially because they depend on the Matterbridge/Matter state.
 * Is not possible for timing reasons to create and destroy a Matter node each test to keep isolation.
 */

import {
  type DysonMachine,
  DysonError,
  type EnvironmentalCareClientOptions,
  type EnvironmentalCareControl,
  getCountries,
  getMachines,
  login,
  requestLoginCode,
} from 'dyson-control';
import type { MatterbridgeEndpoint, PlatformConfig } from 'matterbridge';
import { BridgedDeviceBasicInformation, FanControl, TemperatureMeasurement } from 'matterbridge/matter/clusters';
import { log, setupTest } from 'matterbridge/test-utils/vitest';
import { addMatterbridge, createServerNode, createTestEnvironment, getMatterbridge, startServerNode, stopServerNode } from 'matterbridge/test-utils/vitest/matter';

import type { MachineClientHandlers } from '../src/accessory/dysonAccessory.js';
import type { DysonDeviceConfig } from '../src/config.js';
import initializePlugin, { DysonPlatform, type DysonPlatformConfig, machineSyncIntervalInMs, machineTimeoutInMs } from '../src/module.js';
import { account, coolFan, createDeviceConfig, createFakeClient, createSensors, type FakeClient, hotCool, purifierCool } from './fakeDyson.js';

// What the mocked client reaches: a fake machine for each serial number, created by the test body.
const cloud = vi.hoisted(() => ({
  unitFor: (_serialNumber: string): FakeClient => {
    throw new Error('No machine yet');
  },
  /** The options of every client the plugin created that connected, by serial number. */
  options: new Map<string, unknown>(),
}));

vi.mock('dyson-control', async (importOriginal) => {
  const original = await importOriginal<typeof import('dyson-control')>();
  // The constructor and the capabilities are the real ones: only what goes over the network is the fake machine's.
  class EnvironmentalCareClient extends original.EnvironmentalCareClient {
    private readonly serialNumber: string;
    private readonly handlers: Partial<MachineClientHandlers>;
    constructor(machine: DysonMachine, options: EnvironmentalCareClientOptions) {
      super(machine, options);
      this.serialNumber = machine.serialNumber;
      this.handlers = options;
    }
    override async connect(): Promise<void> {
      const unit = cloud.unitFor(this.serialNumber);
      const { onState, onSensors, onFaults, onReconnect, onDisconnect } = this.handlers;
      if (onState !== undefined && onSensors !== undefined && onFaults !== undefined && onReconnect !== undefined && onDisconnect !== undefined)
        unit.handlers = { onState, onSensors, onFaults, onReconnect, onDisconnect };
      cloud.options.set(this.serialNumber, this.handlers);
      return unit.connect();
    }
    override async disconnect(): Promise<void> {
      return cloud.unitFor(this.serialNumber).disconnect();
    }
    override async getState(): Promise<never> {
      return cloud.unitFor(this.serialNumber).getState() as Promise<never>;
    }
    override async setState(control: EnvironmentalCareControl): Promise<void> {
      return cloud.unitFor(this.serialNumber).setState(control);
    }
    override async getSensors(): Promise<never> {
      return cloud.unitFor(this.serialNumber).getSensors() as Promise<never>;
    }
    override async getFaults(): Promise<never> {
      return cloud.unitFor(this.serialNumber).getFaults() as Promise<never>;
    }
  }
  return { ...original, EnvironmentalCareClient, getMachines: vi.fn(), getCountries: vi.fn(), login: vi.fn(), requestLoginCode: vi.fn() };
});

const pluginName = 'matterbridge-dyson-care';
// Stored as the platform fits them to their machine: a purifier neither heats nor humidifies.
const livingRoom = createDeviceConfig(purifierCool, { heatControl: 'hidden', humidificationControl: 'hidden' });
const bedroom = createDeviceConfig(hotCool, { humidificationControl: 'hidden', isComposed: true });

// The machines the account lists, which a test changes for those that come after it.
let listed: DysonMachine[] = [purifierCool, hotCool];

// One fake machine for each serial number, as in the cloud.
const units = new Map<string, FakeClient>();
const machinesBySerial = new Map<string, DysonMachine>([purifierCool, hotCool, coolFan].map((machine) => [machine.serialNumber, machine]));
cloud.unitFor = (serialNumber: string): FakeClient => {
  let unit = units.get(serialNumber);
  if (unit === undefined) {
    unit = createFakeClient(machinesBySerial.get(serialNumber) ?? purifierCool);
    units.set(serialNumber, unit);
  }
  return unit;
};

/**
 * Build the platform configuration
 *
 * @param {Partial<DysonPlatformConfig>} overrides The fields to replace.
 * @returns {DysonPlatformConfig} The configuration.
 */
function createConfig(overrides: Partial<DysonPlatformConfig> = {}): DysonPlatformConfig {
  return { name: pluginName, type: 'DynamicPlatform', version: '0.1.0', debug: false, unregisterOnShutdown: false, ...overrides };
}

await setupTest('DysonPlatform', false);

describe('DysonPlatform', () => {
  const matterbridge = { ...getMatterbridge(), bridgeMode: 'bridge' as const };
  const saveConfig = vi.spyOn(DysonPlatform.prototype, 'saveConfig').mockImplementation(() => undefined);
  const restartRequired = vi.spyOn(DysonPlatform.prototype, 'wssSendRestartRequired').mockImplementation(() => undefined);
  // The callbacks of the platform timers by period, so a test can fire one without waiting for it.
  const timers = new Map<number, () => void>();
  const startInterval = globalThis.setInterval;
  vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void, periodInMs?: number) => {
    timers.set(periodInMs ?? 0, callback);
    return startInterval(callback, periodInMs);
  }) as typeof setInterval);
  let platform: DysonPlatform;

  /**
   * Find the callback of the platform timer with a given period
   *
   * @param {number} periodInMs The period of the timer.
   * @returns {() => void} The callback of the timer started last.
   */
  function timerCallback(periodInMs: number): () => void {
    const callback = timers.get(periodInMs);
    if (callback === undefined) throw new Error(`No timer runs every ${periodInMs} ms`);
    return callback;
  }

  /**
   * Wait until the queued changes and reads of the platform are done
   *
   * @returns {Promise<void>} Resolves after the pending work.
   */
  async function settle(): Promise<void> {
    await platform.syncMachines();
    await platform.pollDevices();
  }

  /**
   * Find a registered device by the label the Matter apps show
   *
   * @param {string} label The label, such as `Living Room Temperature`.
   * @returns {MatterbridgeEndpoint | undefined} The device, when one has the label.
   */
  function byLabel(label: string): MatterbridgeEndpoint | undefined {
    return platform.getDevices().find((device) => device.getAttribute(BridgedDeviceBasicInformation, 'nodeLabel') === label);
  }

  /**
   * Shut the platform down, take its devices away and start a new one from its configuration, as a restart of Matterbridge does
   *
   * @returns {Promise<void>} Resolves when the new platform is started and configured.
   */
  async function restart(): Promise<void> {
    await platform.onShutdown('restart');
    await platform.unregisterAllDevices();
    platform = initializePlugin(matterbridge, log, platform.config);
    addMatterbridge(platform);
    await platform.onStart('restart');
    await platform.onConfigure();
  }

  beforeAll(async () => {
    await createTestEnvironment();
    await createServerNode(6202);
    await startServerNode();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMachines).mockImplementation(async () => Promise.resolve(listed));
    vi.mocked(getCountries).mockResolvedValue(['US', 'GB']);
  });

  afterAll(async () => {
    await stopServerNode();
    vi.restoreAllMocks();
  });

  test('should throw an error if matterbridge is not the required version', () => {
    expect(() => new DysonPlatform({ ...matterbridge, matterbridgeVersion: '2.0.0' }, log, createConfig())).toThrow(
      'This plugin requires Matterbridge version >= "3.10.10". Please update Matterbridge from 2.0.0 to the latest version in the frontend.',
    );
  });

  test('should warn of an account it cannot read, and start no device without one', async () => {
    // A machine of its own, which the platform of the tests that follow does not register.
    const study = createDeviceConfig(coolFan, { deviceType: 'fan', hasTemperatureSensor: false, hasHumiditySensor: false });
    const signedOut = initializePlugin(matterbridge, log, createConfig({ account: { token: 'x' }, devices: [study] }));
    expect(log.warn).toHaveBeenCalledWith('The stored Dyson account cannot be read: sign in again in the setup page');
    addMatterbridge(signedOut);
    await signedOut.onStart();
    expect(log.info).toHaveBeenCalledWith(`Starting platform ${pluginName} with reason: no reason provided...`);
    expect(log.warn).toHaveBeenCalledWith('No Dyson account is signed in: sign in in the setup page to start the devices');
    expect(signedOut.getDevices()).toHaveLength(0);
    expect(getMachines).not.toHaveBeenCalled();
    const state = await signedOut.getSetupState();
    expect(state.account).toBeUndefined();
    expect(state.devices[0]).toMatchObject({
      status: 'stopped',
      error: 'No Dyson account is signed in: sign in in the setup page',
      capabilities: undefined,
      reportedSensors: { temperature: false },
    });
    await expect(signedOut.listMachines()).rejects.toThrow('Sign in to your Dyson account first');
    expect(await signedOut.probe(purifierCool)).toEqual({ status: 'signInRequired', machine: purifierCool, message: 'No Dyson account is signed in' });
    // Nothing to read without an account.
    await signedOut.pollDevices();
    // Signing in starts the device that could not start without an account.
    vi.mocked(login).mockResolvedValueOnce(account);
    await signedOut.signIn({ email: account.email, password: 'secret', challengeId: 'challenge-1', otpCode: '123456', country: 'GB' });
    expect(signedOut.getDevices()).toHaveLength(1);
    await vi.waitFor(() => expect(cloud.unitFor(coolFan.serialNumber).getState).toHaveBeenCalled());
    // The fan has no sensor of its own, so its readings are stored and nothing is built again.
    await signedOut.pollDevices();
    expect(log.notice).not.toHaveBeenCalledWith(expect.stringContaining('gave a reading'));
    await signedOut.onShutdown();
    expect(log.info).toHaveBeenCalledWith(`Shutting down platform ${pluginName} with reason: no reason provided...`);
    expect(cloud.unitFor(coolFan.serialNumber).disconnect).toHaveBeenCalled();
  });

  test('should create the platform and report stored devices that are not valid', () => {
    const config = createConfig({ account, devices: [livingRoom, { name: 'Broken' }], pollIntervalInSeconds: 20 });
    platform = initializePlugin(matterbridge, log, config);
    expect(platform).toBeInstanceOf(DysonPlatform);
    addMatterbridge(platform);
    expect(log.info).toHaveBeenCalledWith(`Initializing platform ${pluginName}...`);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  test('should ignore a saved configuration before it is started', async () => {
    await platform.onConfigChanged(createConfig({ devices: [] }));
    expect(platform.getDevices()).toHaveLength(0);
  });

  test('should start the stored devices and read the machine list', async () => {
    await platform.onStart('Vitest');
    expect(log.info).toHaveBeenCalledWith(`Starting platform ${pluginName} with reason: Vitest...`);
    // No reading is known yet: the purifier alone.
    expect(platform.getDevices()).toHaveLength(1);
    await vi.waitFor(() => expect(getMachines).toHaveBeenCalledWith(account, { timeoutInMs: machineTimeoutInMs }));
    await vi.waitFor(() => expect(cloud.unitFor(purifierCool.serialNumber).getState).toHaveBeenCalled());
    expect(cloud.options.get(purifierCool.serialNumber)).toMatchObject({ account, timeoutInMs: machineTimeoutInMs });
  });

  test('should note a reading its machine gives for the first time, and build a sensor for it at the next start', async () => {
    await platform.onConfigure();
    expect(log.info).toHaveBeenCalledWith(`Configuring platform ${pluginName}...`);
    expect(log.notice).toHaveBeenCalledWith('"Living Room" gave a reading it shows nowhere in Matter yet');
    expect(log.notice).toHaveBeenCalledWith('"Living Room" is built again with its new options at the next restart of Matterbridge: until then it keeps its current ones');
    expect(restartRequired).toHaveBeenCalledTimes(1);
    // The purifier keeps its one endpoint until the restart, and the setup page says so.
    expect(platform.getDevices()).toHaveLength(1);
    expect((await platform.getSetupState()).devices[0]).toMatchObject({ needsRestart: true, reportedSensors: { temperature: true, humidity: true, airQuality: true } });
    // A reading the air quality sensor to come has no place for yet is noted too, and reported once.
    cloud.unitFor(purifierCool.serialNumber).sensors = createSensors({ carbonDioxideInPpm: 650, formaldehydeInUgPerM3: 3 });
    vi.mocked(log.notice).mockClear();
    await platform.pollDevices();
    expect(log.notice).toHaveBeenCalledWith('"Living Room" gave a reading it shows nowhere in Matter yet');
    expect(log.notice).not.toHaveBeenCalledWith(expect.stringContaining('next restart'));
    vi.mocked(log.notice).mockClear();
    await platform.pollDevices();
    expect(log.notice).not.toHaveBeenCalled();
    expect(restartRequired).toHaveBeenCalledTimes(2);

    // The next start builds the purifier with a sensor each for the air quality, the temperature and the humidity.
    await restart();
    expect(platform.getDevices()).toHaveLength(4);
    expect((await platform.getSetupState()).devices[0]).toMatchObject({ needsRestart: false });
    await settle();
    expect(byLabel('Living Room Temperature')?.getAttribute(TemperatureMeasurement, 'measuredValue')).toBe(2150);
    expect(byLabel('Living Room')?.getAttribute(FanControl, 'speedSetting')).toBe(4);
    expect(byLabel('Living Room Air Quality')?.getAttribute('CarbonDioxideConcentrationMeasurement', 'measuredValue')).toBe(650);
  });

  test('should read the machines on the timers', async () => {
    timerCallback(20_000)();
    await vi.waitFor(() => expect(cloud.unitFor(purifierCool.serialNumber).getState).toHaveBeenCalled());
    timerCallback(machineSyncIntervalInMs)();
    await vi.waitFor(() => expect(getMachines).toHaveBeenCalled());
    await settle();
  });

  test('should read each device once when two polls overlap, and the machine list once when two reads overlap', async () => {
    await Promise.all([platform.pollDevices(), platform.pollDevices()]);
    expect(cloud.unitFor(purifierCool.serialNumber).getState).toHaveBeenCalledTimes(1);
    await Promise.all([platform.syncMachines(), platform.syncMachines()]);
    expect(getMachines).toHaveBeenCalledTimes(1);
  });

  test('should describe the account without its token, and the devices with how they are doing', async () => {
    const state = await platform.getSetupState();
    expect(state.account).toEqual({ email: account.email, country: 'GB', needsSignIn: false });
    expect(state.devices).toHaveLength(1);
    expect(state.devices[0]).toMatchObject({
      name: 'Living Room',
      status: 'online',
      needsRestart: false,
      capabilities: { autoMode: true },
      controls: { oscillationAngles: [45, 90, 180, 350] },
      reportedSensors: { temperature: true, pm25: true, carbonDioxide: true },
    });
    expect(await platform.onFetch('GET', 'state')).toEqual({ ok: true, state });
  });

  test('should pass the countries and the login code through to the cloud', async () => {
    expect(await platform.getCountries()).toEqual(['GB', 'US']);
    vi.mocked(requestLoginCode).mockResolvedValueOnce('challenge-1');
    expect(await platform.requestLoginCode('someone@example.com', 'GB')).toBe('challenge-1');
    expect(requestLoginCode).toHaveBeenCalledWith({ email: 'someone@example.com', country: 'GB', timeoutInMs: machineTimeoutInMs });
  });

  test('should explain and log a sign in the cloud refuses', async () => {
    vi.mocked(requestLoginCode).mockRejectedValueOnce(new DysonError('Dyson request to /v3/userregistration/email/auth failed', 401));
    await expect(platform.requestLoginCode('someone@example.com', 'GB')).rejects.toThrow(
      'Dyson refused the address: check that it is the email address you sign in to the MyDyson app with. An account that signs in with a mobile number is not supported (HTTP 401)',
    );
    expect(log.warn).toHaveBeenCalledWith(expect.stringMatching(/^Dyson did not email a login code to someone@example.com: Dyson refused the address.*\(HTTP 401\)$/));
    vi.mocked(login).mockRejectedValueOnce(new DysonError('Dyson request to /v3/userregistration/email/verify failed', 400));
    await expect(platform.signIn({ email: account.email, password: 'wrong', challengeId: 'challenge-1', otpCode: '000000', country: 'GB' })).rejects.toThrow(
      'Dyson did not accept the password or the code: check both, or ask for a new code (HTTP 400)',
    );
    expect(platform.config.account).toEqual(account);
  });

  test('should mark the machines of the account for the setup page', async () => {
    vi.mocked(getMachines).mockResolvedValueOnce([purifierCool, hotCool, { ...coolFan, name: 'Bedroom' }, { serialNumber: 'R2D2', type: '276', category: 'robot', name: 'Robot' }]);
    expect(await platform.listMachines()).toEqual([
      { ...purifierCool, isConfigured: true, support: 'supported' },
      // Two machines in one room share its name, and each can be added under a name of its own.
      { ...hotCool, isConfigured: false, support: 'supported' },
      { ...coolFan, name: 'Bedroom', isConfigured: false, support: 'supported' },
      { serialNumber: 'R2D2', type: '276', category: 'robot', name: 'Robot', isConfigured: false, support: 'otherCategory' },
    ]);
    expect(saveConfig).not.toHaveBeenCalled();
  });

  test('should check a machine for the setup page and keep what its sensors read', async () => {
    const result = await platform.probe(hotCool);
    expect(result).toMatchObject({ status: 'ready', machine: hotCool, controls: { hasHeat: true }, reportedSensors: { temperature: true, humidity: true, carbonDioxide: false } });
    expect(cloud.unitFor(hotCool.serialNumber).disconnect).toHaveBeenCalledTimes(1);
    // A reading the plugin knows from a running device counts, whether or not the check got it.
    cloud.unitFor(purifierCool.serialNumber).sensors.carbonDioxideInPpm = null;
    expect((await platform.probe(purifierCool)).reportedSensors).toMatchObject({ carbonDioxide: true });
    cloud.unitFor(purifierCool.serialNumber).sensors.carbonDioxideInPpm = 650;
  });

  test('should add a device with the readings its check gave, and refuse a name another device has', async () => {
    // The cloud takes a moment to connect a new client: the device is connecting until its first read ends.
    let connected = (): void => undefined;
    cloud.unitFor(hotCool.serialNumber).connect.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          connected = (): void => resolve();
        }),
    );
    await platform.saveDevice(bedroom);
    expect((await platform.getSetupState()).devices[1]).toMatchObject({ name: 'Bedroom', status: 'connecting' });
    connected();
    await vi.waitFor(async () => expect((await platform.getSetupState()).devices[1]).toMatchObject({ status: 'online' }));
    // The stored device this version cannot read stays stored.
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ devices: [livingRoom, bedroom, { name: 'Broken' }] }));
    // One composed device, with the readings of the check: one endpoint.
    expect(platform.getDevices()).toHaveLength(5);
    expect(platform.getDeviceBySerialNumber(hotCool.serialNumber)?.getChildEndpoints().length).toBeGreaterThan(3);
    await expect(platform.saveDevice({ ...bedroom, serialNumber: 'NK6-EU-MHA0042A' })).rejects.toThrow('Another machine is already named "Bedroom"');
    await settle();
  });

  test('should fit a saved device to what its machine takes, and keep its endpoints until Matterbridge restarts', async () => {
    const before = platform.getDeviceBySerialNumber(hotCool.serialNumber);
    await platform.saveDevice({ ...bedroom, humidificationControl: 'switches', airflowDirectionControl: 'switch' });
    expect(platform.config.devices).toEqual([livingRoom, { ...bedroom, airflowDirectionControl: 'switch' }, { name: 'Broken' }]);
    // The new switch comes at the next restart: the device keeps its endpoints, and the setup page says so.
    expect(log.info).not.toHaveBeenCalledWith('"Bedroom" stopped');
    expect(log.notice).toHaveBeenCalledWith('"Bedroom" is built again with its new options at the next restart of Matterbridge: until then it keeps its current ones');
    expect(restartRequired).toHaveBeenCalledTimes(1);
    expect(platform.getDeviceBySerialNumber(hotCool.serialNumber)).toBe(before);
    expect((await platform.getSetupState()).devices[1]).toMatchObject({ airflowDirectionControl: 'switch', needsRestart: true });
    // A second change is noted once more, without a second notice.
    vi.mocked(log.notice).mockClear();
    await platform.saveDevice({ ...bedroom, airflowDirectionControl: 'switch', nightModeControl: 'switch' });
    expect(restartRequired).toHaveBeenCalledTimes(2);
    expect(log.notice).not.toHaveBeenCalled();
    await platform.saveDevice(bedroom);
    await settle();
  });

  test('should keep the name of a device when the room name of its machine changes in the MyDyson app', async () => {
    const device = platform.getDeviceBySerialNumber(purifierCool.serialNumber);
    listed = [{ ...purifierCool, name: 'Bedroom' }, hotCool];
    await platform.syncMachines();
    // The new room name is stored for the setup page, and the device stays as it was built.
    expect(saveConfig).toHaveBeenCalledTimes(1);
    expect(platform.config.devices).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Living Room', roomName: 'Bedroom' })]));
    expect(platform.getDeviceBySerialNumber(purifierCool.serialNumber)).toBe(device);
    // Another change of the machine is taken, without a new name or a notice of a new firmware.
    listed = [{ ...purifierCool, name: 'Bedroom', mqttRootTopicLevel: '438M' }, hotCool];
    await platform.syncMachines();
    expect(platform.config.devices).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Living Room', mqttRootTopicLevel: '438M' })]));
    expect(log.notice).not.toHaveBeenCalledWith(expect.stringContaining('now runs the firmware'));
    listed = [{ ...purifierCool, name: 'Bedroom' }, hotCool];
    await settle();
  });

  test('should reach a machine on the LAN first once the machine list gives the password of its broker, which the setup page never sees', async () => {
    const device = platform.getDeviceBySerialNumber(purifierCool.serialNumber);
    const clientOptions = (): Record<string, unknown> => ({ ...(cloud.options.get(purifierCool.serialNumber) as object) });
    listed = [{ ...purifierCool, name: 'Bedroom', apPasswordHash: 'hash-1' }, hotCool];
    await platform.syncMachines();
    expect(platform.config.devices).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Living Room', apPasswordHash: 'hash-1' })]));
    // Connected anew, without building the device again, and without a host: dyson-control searches the LAN for it.
    expect(clientOptions()).toMatchObject({ account, timeoutInMs: machineTimeoutInMs });
    expect(clientOptions().host).toBeUndefined();
    expect(platform.getDeviceBySerialNumber(purifierCool.serialNumber)).toBe(device);
    const [shown] = (await platform.getSetupState()).devices;
    expect(shown).toMatchObject({ name: 'Living Room', isTriedOnLan: true });
    expect(shown).not.toHaveProperty('apPasswordHash');
    expect((await platform.listMachines())[0]).not.toHaveProperty('apPasswordHash');
    // The setup page saves a host without the password, which the device keeps.
    await platform.saveDevice({ ...livingRoom, roomName: 'Bedroom', host: '192.168.1.20' });
    expect(platform.config.devices).toEqual(expect.arrayContaining([expect.objectContaining({ host: '192.168.1.20', apPasswordHash: 'hash-1' })]));
    expect(clientOptions()).toMatchObject({ host: '192.168.1.20' });
    expect(platform.getDeviceBySerialNumber(purifierCool.serialNumber)).toBe(device);
    // The check of the setup page searches the LAN beside the cloud, with the password the page never sees.
    expect(await platform.probe(purifierCool)).toMatchObject({ status: 'ready', isFoundOnLan: true });
    cloud.unitFor(purifierCool.serialNumber).connect.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new DysonError('No machine answered the search', 504));
    expect(await platform.probe(purifierCool)).toMatchObject({ status: 'ready', isFoundOnLan: false });
    // A machine set to the cloud alone is not searched for, and changes over without building the device again.
    await platform.saveDevice({ ...livingRoom, roomName: 'Bedroom', isCloudOnly: true });
    expect(clientOptions()).toMatchObject({ account, local: false });
    expect(clientOptions().host).toBeUndefined();
    expect(platform.getDeviceBySerialNumber(purifierCool.serialNumber)).toBe(device);
    expect((await platform.getSetupState()).devices[0]).toMatchObject({ isCloudOnly: true, isTriedOnLan: false });
    await platform.saveDevice({ ...livingRoom, roomName: 'Bedroom' });
    expect(clientOptions().local).toBeUndefined();
    // Without the password the machine is reached through the cloud alone.
    listed = [{ ...purifierCool, name: 'Bedroom' }, hotCool];
    await platform.syncMachines();
    expect(clientOptions()).toMatchObject({ local: false });
    expect(clientOptions().host).toBeUndefined();
    expect((await platform.getSetupState()).devices[0].isTriedOnLan).toBe(false);
    await platform.saveDevice({ ...livingRoom, roomName: 'Bedroom' });
    expect(platform.config.devices).toEqual(expect.arrayContaining([{ ...livingRoom, roomName: 'Bedroom' }]));
    await settle();
  });

  test('should give a device the name it is given in the setup page as its label, without building it again', async () => {
    const device = platform.getDeviceBySerialNumber(purifierCool.serialNumber);
    expect(device?.getAttribute(BridgedDeviceBasicInformation, 'nodeLabel')).toBe('Living Room');
    await platform.saveDevice({ ...livingRoom, name: 'Lounge' });
    expect(log.info).not.toHaveBeenCalledWith('"Living Room" stopped');
    expect(log.info).toHaveBeenCalledWith('"Living Room" is now named "Lounge"');
    expect(restartRequired).not.toHaveBeenCalled();
    // The name in Matterbridge is made of the serial number, so that the identity of the device in Matter never changes: the name given is its label.
    expect(platform.getDeviceBySerialNumber(purifierCool.serialNumber)).toBe(device);
    expect(device?.deviceName).toBe(`Dyson ${purifierCool.serialNumber}`);
    expect(device?.getAttribute(BridgedDeviceBasicInformation, 'nodeLabel')).toBe('Lounge');
    expect(byLabel('Lounge Temperature')).toBeDefined();
    expect(byLabel('Living Room Temperature')).toBeUndefined();
    expect((await platform.getSetupState()).devices[0]).toMatchObject({ name: 'Lounge', needsRestart: false });
    await settle();
  });

  test('should note a machine for the next restart when its firmware gives it other controls, and only connect anew otherwise', async () => {
    const device = platform.getDeviceBySerialNumber(purifierCool.serialNumber);
    listed = [{ ...purifierCool, name: 'Lounge', firmwareVersion: '0700.1' }, hotCool];
    await platform.syncMachines();
    expect(log.notice).toHaveBeenCalledWith('"Lounge" now runs the firmware 0700.1');
    expect(log.notice).not.toHaveBeenCalledWith(expect.stringContaining('takes other settings'));
    expect(restartRequired).not.toHaveBeenCalled();
    listed = [{ ...purifierCool, name: 'Lounge', firmwareVersion: undefined, firmwareCapabilities: ['AdvanceOscillationDay0'] }, hotCool];
    await platform.syncMachines();
    expect(log.notice).toHaveBeenCalledWith('"Lounge" now runs the firmware the cloud does not name');
    expect(log.notice).toHaveBeenCalledWith('"Lounge" takes other settings than when it was set up');
    expect(log.notice).toHaveBeenCalledWith('"Lounge" is built again with its new options at the next restart of Matterbridge: until then it keeps its current ones');
    expect(restartRequired).toHaveBeenCalledTimes(1);
    // The device keeps the endpoints it was built with, connected anew to the machine.
    expect(log.info).not.toHaveBeenCalledWith('"Lounge" stopped');
    expect(platform.getDeviceBySerialNumber(purifierCool.serialNumber)).toBe(device);
    expect((await platform.getSetupState()).devices[0]).toMatchObject({ needsRestart: true });
    await settle();
  });

  test('should log a machine list it cannot read, and ask for a new sign in when the cloud refuses the account', async () => {
    vi.mocked(getMachines).mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));
    await platform.syncMachines();
    expect(log.warn).toHaveBeenCalledWith('The machines of the Dyson account could not be read: getaddrinfo ENOTFOUND');
    vi.mocked(getMachines).mockRejectedValueOnce(new DysonError('Unauthorized', 401));
    await expect(platform.listMachines()).rejects.toThrow('Unauthorized');
    expect(log.warn).toHaveBeenCalledWith('The Dyson cloud no longer accepts the account: sign in again in the setup page');
    expect((await platform.getSetupState()).account?.needsSignIn).toBe(true);
    // A machine list that comes back means the account works again.
    await platform.syncMachines();
    expect((await platform.getSetupState()).account?.needsSignIn).toBe(false);
  });

  test('should ask for a new sign in when a machine or a check is refused the credentials of the account', async () => {
    const unit = cloud.unitFor(purifierCool.serialNumber);
    unit.getState.mockRejectedValueOnce(new DysonError('Unauthorized', 401));
    await platform.pollDevices();
    expect((await platform.getSetupState()).account?.needsSignIn).toBe(true);
    cloud.unitFor(hotCool.serialNumber).connect.mockRejectedValueOnce(new DysonError('Unauthorized', 401));
    // The probe connects a client of its own.
    expect(await platform.probe(hotCool)).toMatchObject({ status: 'signInRequired' });
    await settle();
  });

  test('should sign in, store the account and connect the devices through it', async () => {
    const signedIn = { ...account, token: 'token-2' };
    vi.mocked(login).mockResolvedValueOnce(signedIn);
    await platform.signIn({ email: account.email, password: 'secret', challengeId: 'challenge-1', otpCode: '123456', country: 'GB' });
    expect(login).toHaveBeenCalledWith({
      email: account.email,
      password: 'secret',
      challengeId: 'challenge-1',
      otpCode: '123456',
      country: 'GB',
      timeoutInMs: machineTimeoutInMs,
    });
    expect(platform.config.account).toEqual({ ...signedIn, email: account.email });
    expect(JSON.stringify(platform.config)).not.toContain('secret');
    expect((await platform.getSetupState()).account?.needsSignIn).toBe(false);
    await vi.waitFor(() => expect(cloud.options.get(purifierCool.serialNumber)).toMatchObject({ account: { token: 'token-2' } }));
    await settle();
  });

  test('should sign out and leave the devices in Matter, unreachable', async () => {
    await platform.signOut();
    expect(platform.config.account).toBeUndefined();
    expect(log.notice).toHaveBeenCalledWith('Signed out of the Dyson account');
    expect(platform.getDevices()).toHaveLength(5);
    expect(platform.getDeviceBySerialNumber(purifierCool.serialNumber)?.getAttribute(BridgedDeviceBasicInformation, 'reachable')).toBe(false);
    await platform.pollDevices();
    await platform.syncMachines();
    expect(getMachines).not.toHaveBeenCalled();
    const state = await platform.getSetupState();
    expect(state.account).toBeUndefined();
    expect(state.devices[0]).toMatchObject({ status: 'offline' });
  });

  test('should connect the devices again when an account is signed in again', async () => {
    vi.mocked(login).mockResolvedValueOnce(account);
    await platform.signIn({ email: account.email, password: 'secret', challengeId: 'challenge-2', otpCode: '654321', country: 'GB' });
    await settle();
    expect(platform.getDeviceBySerialNumber(purifierCool.serialNumber)?.getAttribute(BridgedDeviceBasicInformation, 'reachable')).toBe(true);
  });

  test('should retry a device that could not start at the next read of the machine list', async () => {
    const unknown = createDeviceConfig({ ...coolFan, type: '999', name: 'Mystery', serialNumber: 'NK6-EU-MHA0077A' });
    await platform.saveDevice(unknown);
    expect(log.warn).toHaveBeenCalledWith('"Mystery" could not be started and will be retried: 999 is no known type of environmental care machine');
    expect((await platform.getSetupState()).devices[2]).toMatchObject({ status: 'stopped', error: '999 is no known type of environmental care machine', capabilities: undefined });
    vi.clearAllMocks();
    await platform.syncMachines();
    // The same failure is not logged again.
    expect(log.warn).not.toHaveBeenCalled();
    expect(await platform.removeDevice(unknown.serialNumber)).toBe(true);
  });

  test('should log a change to the devices that fails, and unregister the endpoints of a device that could not start', async () => {
    saveConfig.mockImplementationOnce(() => {
      throw new Error('The disk is full');
    });
    await expect(platform.saveDevice({ ...bedroom, name: 'Spare' })).rejects.toThrow('The disk is full');
    expect(log.error).toHaveBeenCalledWith('A change to the devices failed: The disk is full');
    const registerForReal = platform.registerDevice.bind(platform);
    const register = vi.spyOn(platform, 'registerDevice');
    register.mockImplementationOnce(registerForReal).mockRejectedValueOnce(new Error('The aggregator is full'));
    const unregister = vi.spyOn(platform, 'unregisterDevice');
    // A fan with a switch as devices of their own: the fan registers, its switch does not.
    const study = createDeviceConfig(
      { ...coolFan, serialNumber: 'NK6-EU-MHA0044A' },
      { deviceType: 'fan', nightModeControl: 'switch', hasTemperatureSensor: false, hasHumiditySensor: false, isComposed: false },
    );
    await platform.saveDevice(study);
    expect(log.warn).toHaveBeenCalledWith('"Study" could not be started and will be retried: The aggregator is full');
    // The fan that registered before its switch failed.
    expect(unregister).toHaveBeenCalledTimes(1);
    register.mockRestore();
    unregister.mockRestore();
    expect(await platform.removeDevice(study.serialNumber)).toBe(true);
    await settle();
  });

  test('should remove a device and forget it', async () => {
    expect(await platform.removeDevice(bedroom.serialNumber)).toBe(true);
    expect(await platform.removeDevice(bedroom.serialNumber)).toBe(false);
    expect(platform.getDeviceBySerialNumber(hotCool.serialNumber)).toBeUndefined();
    expect(platform.config.devices).toEqual([expect.objectContaining({ name: 'Lounge' }), { name: 'Broken' }]);
  });

  test('should give an endpoint that comes back after it was taken away a new id, so that it gets a new endpoint number', async () => {
    const machine = { ...purifierCool, serialNumber: 'NK6-EU-MHA0099A', name: 'Attic' };
    const serial = machine.serialNumber;
    const withSwitch = createDeviceConfig(machine, {
      nightModeControl: 'switch',
      hasAirQualitySensor: false,
      hasTemperatureSensor: false,
      hasHumiditySensor: false,
      isComposed: false,
    });
    const startWith = async (devices: DysonDeviceConfig[]): Promise<DysonPlatform> => {
      const started = initializePlugin(matterbridge, log, createConfig({ account, devices }));
      addMatterbridge(started);
      await started.onStart();
      await started.syncMachines();
      return started;
    };
    const stop = async (started: DysonPlatform): Promise<void> => {
      await started.onShutdown();
      await started.unregisterAllDevices();
    };

    // Never built before: every endpoint has its base id.
    const first = await startWith([withSwitch]);
    expect(first.getDeviceById(serial)).toBeDefined();
    expect(first.getDeviceById(`${serial}-night-mode`)).toBeDefined();
    await stop(first);

    // The switch is taken away. matter.js still holds the endpoint number its id had.
    const second = await startWith([{ ...withSwitch, nightModeControl: 'native' }]);
    expect(second.getDeviceById(`${serial}-night-mode`)).toBeUndefined();
    await stop(second);

    // Brought back, the switch has a new id, so that it gets a new endpoint number instead of its old one: for the
    // Matter apps it is a new device, not the one they lost. The purifier, which stayed, keeps its id.
    const third = await startWith([withSwitch]);
    expect(third.getDeviceById(`${serial}-night-mode`)).toBeUndefined();
    expect(third.getDeviceById(`${serial}-night-mode-1`)).toBeDefined();
    expect(third.getDeviceById(serial)).toBeDefined();

    // The ids outlive a removal of the device: added again, the switch keeps its new id.
    expect(await third.removeDevice(serial)).toBe(true);
    await third.saveDevice(withSwitch);
    expect(third.getDeviceById(`${serial}-night-mode-1`)).toBeDefined();
    expect(await third.removeDevice(serial)).toBe(true);
    await stop(third);
  });

  test('should take a new poll interval from the config editor, and restore the devices of an older page', async () => {
    const stored = { ...platform.config } as PlatformConfig;
    // What the plugin stored itself comes back with nothing to apply.
    await platform.onConfigChanged(stored);
    expect(saveConfig).not.toHaveBeenCalled();
    // Saved again with nothing new: neither the timers nor the configuration change.
    await platform.onConfigChanged(stored);
    expect(saveConfig).not.toHaveBeenCalled();
    await platform.onConfigChanged({ ...stored, setupRevision: 1, pollIntervalInSeconds: 60, devices: [] });
    expect(timers.has(60_000)).toBe(true);
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ devices: [expect.objectContaining({ serialNumber: purifierCool.serialNumber }), { name: 'Broken' }] }));
  });

  test('should log a change of the logger level', async () => {
    await platform.onChangeLoggerLevel('debug' as never);
    expect(log.info).toHaveBeenCalledWith('onChangeLoggerLevel called with: debug');
  });

  test('should shut down, disconnect the machines and unregister the devices when asked to', async () => {
    platform.config.unregisterOnShutdown = true;
    await platform.onShutdown('Vitest');
    expect(cloud.unitFor(purifierCool.serialNumber).disconnect).toHaveBeenCalled();
    expect(platform.getDevices()).toHaveLength(0);
    expect(log.info).toHaveBeenCalledWith(`Platform ${pluginName} shut down successfully`);
  });
});
