/**
 * @file vitest/accessory/dysonAccessory.test.ts
 * @description This file contains the tests for the bridge between a Dyson machine and its Matter endpoints.
 * @author Calvin Che
 */

/**
 * WARNING!!!
 * The tests in this unit are supposed to run sequentially because they depend on the Matter state.
 */

import { DysonError } from 'dyson-control';
import type { MatterbridgeEndpoint } from 'matterbridge';
import type { ActionContext } from 'matterbridge/matter';
import {
  AirQuality,
  BridgedDeviceBasicInformation,
  ConcentrationMeasurement,
  Descriptor,
  FanControl,
  ModeSelect,
  OnOff,
  RelativeHumidityMeasurement,
  TemperatureMeasurement,
  Thermostat,
} from 'matterbridge/matter/clusters';
import { log, setupTest } from 'matterbridge/vitest-utils';
import { addDevice, aggregator, createServerNode, createTestEnvironment, startServerNode, stopServerNode } from 'matterbridge/vitest-utils/matter';

import { DysonAccessory } from '../../src/accessory/dysonAccessory.js';
import { readFanRequest } from '../../src/accessory/matterState.js';
import { noReportedSensors, type ReportedSensors } from '../../src/controls.js';
import { coolFan, createDeviceConfig, createEmptySensors, createFakeClient, createSensors, factoryOf, type FakeClient, hotCool, humidifyCool, purifierCool } from '../fakeDyson.js';

const online = { fabric: 1 } as unknown as ActionContext;
const vendorId = 0xfff1;
const everySensor: ReportedSensors = {
  temperature: true,
  humidity: true,
  airQuality: true,
  pm25: true,
  pm10: true,
  volatileOrganicCompounds: true,
  nitrogenDioxide: true,
  formaldehyde: false,
  carbonDioxide: false,
};

/**
 * Add every endpoint of an accessory to the test aggregator
 *
 * @param {DysonAccessory} accessory The accessory.
 * @returns {Promise<void>} Resolves when the endpoints are active.
 */
async function addAccessory(accessory: DysonAccessory): Promise<void> {
  for (const endpoint of accessory.endpoints) expect(await addDevice(aggregator, endpoint)).toBe(true);
}

/**
 * Write several attributes the way a controller does in one go: every value lands, then the changes are announced with a
 * fabric, one right after the other
 *
 * @param {MatterbridgeEndpoint} endpoint The endpoint.
 * @param {readonly (readonly [string, string, unknown])[]} writes The cluster name, the attribute name and the value of each write.
 * @returns {Promise<void>} Resolves when the changes are announced.
 */
async function writeTogetherAsController(endpoint: MatterbridgeEndpoint, writes: readonly (readonly [cluster: string, attribute: string, value: unknown])[]): Promise<void> {
  const announcements: (() => void)[] = [];
  for (const [cluster, attribute, value] of writes) {
    const previous: unknown = endpoint.getAttribute(cluster, attribute);
    await endpoint.setAttribute(cluster, attribute, value as never);
    const events = endpoint.eventsOf(cluster.charAt(0).toLowerCase() + cluster.slice(1)) as Record<string, { emit: (...parameters: unknown[]) => void } | undefined>;
    announcements.push(() => events[`${attribute}$Changed`]?.emit(value, previous, online));
  }
  for (const announce of announcements) announce();
}

/**
 * Get an endpoint the test needs
 *
 * @param {MatterbridgeEndpoint | undefined} endpoint The endpoint, when the accessory has it.
 * @returns {MatterbridgeEndpoint} The endpoint.
 * @throws {Error} When the accessory does not have it.
 */
function required(endpoint: MatterbridgeEndpoint | undefined): MatterbridgeEndpoint {
  if (endpoint === undefined) throw new Error('The endpoint is missing');
  return endpoint;
}

/**
 * Write an attribute the way a controller does: the value lands, then the change is announced with a fabric
 *
 * @param {MatterbridgeEndpoint | undefined} endpoint The endpoint.
 * @param {string} cluster The cluster name.
 * @param {string} attribute The attribute name.
 * @param {unknown} value The value to write.
 * @returns {Promise<void>} Resolves when the change is announced.
 */
async function writeAsController(endpoint: MatterbridgeEndpoint | undefined, cluster: string, attribute: string, value: unknown): Promise<void> {
  await writeTogetherAsController(required(endpoint), [[cluster, attribute, value]]);
}

await setupTest('DysonAccessory', false);

describe('DysonAccessory', () => {
  beforeAll(async () => {
    await createTestEnvironment();
    await createServerNode(6201);
    await startServerNode();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await stopServerNode();
    vi.restoreAllMocks();
  });

  describe('a purifier with every control native, and sensors of its own', () => {
    let client: FakeClient;
    let accessory: DysonAccessory;

    it('should create an air purifier with every fan control feature and a sensor for each reading', async () => {
      client = createFakeClient(purifierCool);
      // Longer than a slow machine takes between two writes of a test, so that a command only goes out when a test sends it.
      accessory = new DysonAccessory({
        config: createDeviceConfig(purifierCool),
        createClient: factoryOf(client),
        reportedSensors: everySensor,
        log,
        vendorId,
        commandDelayInMs: 500,
      });
      expect(accessory.endpoints).toHaveLength(4);
      expect(accessory.endpoint.deviceName).toBe('Living Room');
      expect(accessory.endpoint.serialNumber).toBe(purifierCool.serialNumber);
      // A device of its own beside the purifier has its serial number with a letter after a dash.
      expect(accessory.airQualitySensor?.serialNumber).toBe(`${purifierCool.serialNumber}-Q`);
      expect(accessory.airQualitySensor?.deviceName).toBe('Living Room Air Quality');
      expect(accessory.temperatureSensor?.deviceName).toBe('Living Room Temperature');
      expect(accessory.humiditySensor?.deviceName).toBe('Living Room Humidity');
      expect(accessory.thermostat).toBeUndefined();
      // Connecting until its first read ends.
      expect(accessory.getStatus()).toMatchObject({ isReachable: false, isConnecting: true });
      await addAccessory(accessory);
      expect(accessory.endpoint.getAttribute(FanControl, 'speedMax')).toBe(10);
      expect(accessory.endpoint.getAttribute(FanControl, 'fanModeSequence')).toBe(FanControl.FanModeSequence.OffLowMedHighAuto);
      expect(accessory.endpoint.getAttribute('FanControl', 'rockSupport')).toEqual({ rockLeftRight: true, rockUpDown: false, rockRound: false });
      expect(accessory.endpoint.getAttribute('FanControl', 'windSupport')).toEqual({ sleepWind: true, naturalWind: false });
      expect(accessory.endpoint.getAttribute('FanControl', 'airflowDirection')).toBe(FanControl.AirflowDirection.Forward);
      await accessory.clearReadings();
      expect(accessory.temperatureSensor?.getAttribute(TemperatureMeasurement, 'measuredValue')).toBeNull();
    });

    it('should write the state and the readings of the machine to Matter when it starts', async () => {
      client.state = { ...client.state, oscillationMode: 'on', nightMode: true, fanAirDirection: 'backward' };
      expect(await accessory.start()).toBe(true);
      expect(client.connect).toHaveBeenCalledTimes(1);
      const { endpoint } = accessory;
      expect(endpoint.getAttribute(OnOff, 'onOff')).toBe(true);
      expect(endpoint.getAttribute(FanControl, 'percentSetting')).toBe(40);
      expect(endpoint.getAttribute(FanControl, 'speedSetting')).toBe(4);
      expect(endpoint.getAttribute(FanControl, 'speedCurrent')).toBe(4);
      expect(endpoint.getAttribute('FanControl', 'rockSetting')).toEqual({ rockLeftRight: true, rockUpDown: false, rockRound: false });
      expect(endpoint.getAttribute('FanControl', 'windSetting')).toEqual({ sleepWind: true, naturalWind: false });
      expect(endpoint.getAttribute('FanControl', 'airflowDirection')).toBe(FanControl.AirflowDirection.Reverse);
      expect(endpoint.getAttribute(BridgedDeviceBasicInformation, 'reachable')).toBe(true);
      expect(accessory.temperatureSensor?.getAttribute(TemperatureMeasurement, 'measuredValue')).toBe(2150);
      expect(accessory.humiditySensor?.getAttribute(RelativeHumidityMeasurement, 'measuredValue')).toBe(4500);
      const sensor = accessory.airQualitySensor;
      // The worst pollutant is the volatile organic compounds, at 5: fair.
      expect(sensor?.getAttribute(AirQuality, 'airQuality')).toBe(AirQuality.AirQualityEnum.Fair);
      expect(sensor?.getAttribute('Pm25ConcentrationMeasurement', 'measuredValue')).toBe(12);
      expect(sensor?.getAttribute('Pm10ConcentrationMeasurement', 'measuredValue')).toBe(15);
      expect(sensor?.getAttribute('TotalVolatileOrganicCompoundsConcentrationMeasurement', 'levelValue')).toBe(ConcentrationMeasurement.LevelValue.Medium);
      expect(sensor?.getAttribute('NitrogenDioxideConcentrationMeasurement', 'levelValue')).toBe(ConcentrationMeasurement.LevelValue.Low);
      expect(accessory.getStatus()).toMatchObject({ isReachable: true, isConnecting: false, lastError: undefined });
    });

    it('should set the fan speed a controller picks', async () => {
      await writeAsController(accessory.endpoint, 'FanControl', 'percentSetting', 70);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ fanSpeed: 7 });
      expect(accessory.endpoint.getAttribute(FanControl, 'speedCurrent')).toBe(7);
    });

    it('should set the slowest, the middle and the fastest speed for the fan modes Low, Medium and High', async () => {
      await writeAsController(accessory.endpoint, 'FanControl', 'fanMode', FanControl.FanMode.Low);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenLastCalledWith({ fanSpeed: 1 });
      expect(accessory.endpoint.getAttribute(FanControl, 'percentSetting')).toBe(10);
      await writeAsController(accessory.endpoint, 'FanControl', 'fanMode', FanControl.FanMode.Medium);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenLastCalledWith({ fanSpeed: 5 });
      await writeAsController(accessory.endpoint, 'FanControl', 'fanMode', FanControl.FanMode.High);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenLastCalledWith({ fanSpeed: 10 });
      expect(accessory.endpoint.getAttribute(FanControl, 'fanMode')).toBe(FanControl.FanMode.High);
      // A percent stays the nearest speed, though it moves the fan mode too.
      await writeAsController(accessory.endpoint, 'FanControl', 'percentSetting', 31);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenLastCalledWith({ fanSpeed: 3 });
    });

    it('should turn the auto mode on when a controller picks the fan mode Auto', async () => {
      await writeAsController(accessory.endpoint, 'FanControl', 'fanMode', FanControl.FanMode.Auto);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ autoMode: true });
      expect(accessory.endpoint.getAttribute(FanControl, 'fanMode')).toBe(FanControl.FanMode.Auto);
    });

    it('should turn the machine off when a controller sets the fan to off', async () => {
      await writeAsController(accessory.endpoint, 'FanControl', 'fanMode', FanControl.FanMode.Off);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ fanPower: false });
      expect(accessory.endpoint.getAttribute(OnOff, 'onOff')).toBe(false);
      expect(accessory.endpoint.getAttribute(FanControl, 'percentSetting')).toBe(0);
    });

    it('should turn the machine on with its on/off', async () => {
      await writeAsController(accessory.endpoint, 'OnOff', 'onOff', true);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ fanPower: true });
    });

    it('should send the rocking, the sleep wind and the airflow direction', async () => {
      await writeTogetherAsController(accessory.endpoint, [
        ['FanControl', 'rockSetting', { rockLeftRight: false, rockUpDown: false, rockRound: false }],
        ['FanControl', 'windSetting', { sleepWind: false, naturalWind: false }],
        ['FanControl', 'airflowDirection', FanControl.AirflowDirection.Forward],
      ]);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ oscillationMode: 'off', nightMode: false, fanAirDirection: 'forward' });
    });

    it('should write a state the machine sends by itself', async () => {
      client.handlers.onState({ ...client.state, fanSpeed: 9, autoMode: false });
      await accessory.flushCommands();
      expect(accessory.endpoint.getAttribute(FanControl, 'speedCurrent')).toBe(9);
      client.handlers.onSensors(createEmptySensors());
      await accessory.flushCommands();
      expect(accessory.temperatureSensor?.getAttribute(TemperatureMeasurement, 'measuredValue')).toBeNull();
    });

    it('should report the machine as unreachable after two reads in a row fail', async () => {
      client.getState.mockRejectedValueOnce(new DysonError('The machine did not answer', 504));
      expect(await accessory.refresh()).toBe(false);
      expect(accessory.getStatus().isReachable).toBe(true);
      client.getState.mockRejectedValueOnce(new DysonError('The machine did not answer', 504));
      expect(await accessory.refresh()).toBe(false);
      expect(accessory.getStatus()).toMatchObject({ isReachable: false, lastError: 'The machine did not answer', lastErrorStatus: 504 });
      expect(accessory.endpoint.getAttribute(BridgedDeviceBasicInformation, 'reachable')).toBe(false);
      expect(await accessory.refresh()).toBe(true);
      expect(accessory.endpoint.getAttribute(BridgedDeviceBasicInformation, 'reachable')).toBe(true);
    });

    it('should connect again at the next read after the client gave up', async () => {
      client.handlers.onDisconnect();
      await accessory.flushCommands();
      expect(accessory.getStatus().isReachable).toBe(false);
      expect(await accessory.refresh()).toBe(true);
      expect(client.connect).toHaveBeenCalledTimes(1);
    });

    it('should disconnect when it is disposed', async () => {
      await accessory.dispose();
      expect(client.disconnect).toHaveBeenCalledTimes(1);
      expect(await accessory.refresh()).toBe(false);
    });
  });

  describe('a heater with switches and selects, as one composed device', () => {
    let client: FakeClient;
    let accessory: DysonAccessory;

    it('should create the switches, the oscillation select and the thermostat as parts of the purifier', async () => {
      client = createFakeClient(hotCool, { heatMode: 'off', targetTemperatureInC: 22, oscillationPresetAngleInDegrees: 90 });
      const config = createDeviceConfig(hotCool, {
        fanControl: 'percent',
        fanAutoControl: 'switch',
        oscillationControl: 'select',
        nightModeControl: 'switch',
        airflowDirectionControl: 'switch',
        heatControl: 'thermostat',
        hasContinuousMonitoringSwitch: true,
        isComposed: true,
      });
      accessory = new DysonAccessory({
        config,
        createClient: factoryOf(client),
        reportedSensors: { ...noReportedSensors, temperature: true },
        log,
        vendorId,
        commandDelayInMs: 500,
      });
      expect(accessory.endpoints).toEqual([accessory.endpoint]);
      expect(accessory.thermostat).toBeDefined();
      expect(accessory.airQualitySensor).toBeUndefined();
      await addAccessory(accessory);
      expect(accessory.endpoint.getChildEndpoints()).toHaveLength(7);
      expect(accessory.nightModeSwitch?.getAttribute(Descriptor, 'tagList')).toEqual([expect.objectContaining({ label: 'Night Mode' })]);
      expect(accessory.oscillationSelect?.getAttribute(ModeSelect, 'supportedModes')).toEqual([
        { label: 'Off', mode: 0, semanticTags: [] },
        { label: '45°', mode: 3, semanticTags: [] },
        { label: '90°', mode: 5, semanticTags: [] },
        { label: '180°', mode: 6, semanticTags: [] },
        { label: '350°', mode: 7, semanticTags: [] },
      ]);
      expect(accessory.thermostat?.getAttribute(Thermostat, 'maxHeatSetpointLimit')).toBe(3700);
      expect(accessory.endpoint.getAttribute(FanControl, 'speedMax')).toBeUndefined();
    });

    it('should write the heating, the switches and the preset angle', async () => {
      client.state = { ...client.state, oscillationMode: 'on' };
      expect(await accessory.refresh()).toBe(true);
      expect(accessory.thermostat?.getAttribute(Thermostat, 'systemMode')).toBe(Thermostat.SystemMode.Off);
      expect(accessory.thermostat?.getAttribute(Thermostat, 'occupiedHeatingSetpoint')).toBe(2200);
      expect(accessory.thermostat?.getAttribute(Thermostat, 'localTemperature')).toBe(2150);
      expect(accessory.oscillationSelect?.getAttribute(ModeSelect, 'currentMode')).toBe(5);
      expect(accessory.airflowDirectionSwitch?.getAttribute(OnOff, 'onOff')).toBe(true);
      expect(accessory.continuousMonitoringSwitch?.getAttribute(OnOff, 'onOff')).toBe(true);
      expect(accessory.fanAutoSwitch?.getAttribute(OnOff, 'onOff')).toBe(false);
    });

    it('should heat to the setpoint a controller sets, turning the machine on', async () => {
      await writeTogetherAsController(required(accessory.thermostat), [
        ['Thermostat', 'systemMode', Thermostat.SystemMode.Heat],
        ['Thermostat', 'occupiedHeatingSetpoint', 2350],
      ]);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ fanPower: true, heatMode: 'heat', targetTemperatureInC: 24 });
      expect(accessory.thermostat?.getAttribute(Thermostat, 'systemMode')).toBe(Thermostat.SystemMode.Heat);
      expect(accessory.thermostat?.getAttribute(Thermostat, 'thermostatRunningState')).toMatchObject({ heat: true });
    });

    it('should sweep the preset angle a controller picks', async () => {
      await writeAsController(accessory.oscillationSelect, 'ModeSelect', 'currentMode', 7);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ oscillationMode: 'on', oscillationPresetAngleInDegrees: 350 });
      await writeAsController(accessory.oscillationSelect, 'ModeSelect', 'currentMode', 0);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ oscillationMode: 'off' });
    });

    it('should leave the auto mode for the speed the fan last ran at', async () => {
      await writeAsController(accessory.fanAutoSwitch, 'OnOff', 'onOff', true);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ autoMode: true });
      await writeAsController(accessory.fanAutoSwitch, 'OnOff', 'onOff', false);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ fanSpeed: 4 });
    });

    it('should send the switches of the night mode, the airflow and the continuous monitoring', async () => {
      await writeAsController(accessory.nightModeSwitch, 'OnOff', 'onOff', true);
      await writeAsController(accessory.airflowDirectionSwitch, 'OnOff', 'onOff', false);
      await writeAsController(accessory.continuousMonitoringSwitch, 'OnOff', 'onOff', false);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ nightMode: true, fanAirDirection: 'backward', continuousMonitoring: false });
    });

    it('should ignore a thermostat mode a heater does not have', async () => {
      await writeAsController(accessory.thermostat, 'Thermostat', 'systemMode', Thermostat.SystemMode.Off);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ heatMode: 'off' });
      await accessory.dispose();
    });
  });

  describe('a humidifier with switches', () => {
    it('should send the humidifying and its auto mode', async () => {
      const client = createFakeClient(humidifyCool, { humidificationMode: 'off', autoHumidification: false, manualHumidificationTargetInPercent: 50, fanAirDirection: null });
      const config = createDeviceConfig(humidifyCool, { humidificationControl: 'switches', oscillationControl: 'switch' });
      const accessory = new DysonAccessory({ config, createClient: factoryOf(client), log, vendorId, commandDelayInMs: 500 });
      expect(accessory.humidifySwitch?.deviceName).toBe('Nursery Humidify');
      expect(accessory.autoHumidifySwitch?.deviceName).toBe('Nursery Auto Humidify');
      expect(accessory.airflowDirectionSwitch).toBeUndefined();
      await addAccessory(accessory);
      await accessory.start();
      await writeAsController(accessory.humidifySwitch, 'OnOff', 'onOff', true);
      await writeAsController(accessory.autoHumidifySwitch, 'OnOff', 'onOff', true);
      await writeAsController(accessory.oscillationSwitch, 'OnOff', 'onOff', true);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ fanPower: true, humidificationMode: 'humidify', autoHumidification: true, oscillationMode: 'on' });
      expect(accessory.humidifySwitch?.getAttribute(OnOff, 'onOff')).toBe(true);
      await accessory.dispose();
    });
  });

  describe('a humidifier with a target humidity select', () => {
    it('should pick off, auto and a target', async () => {
      // A machine of its own: the aggregator still holds the endpoints of the one before.
      const machine = { ...humidifyCool, serialNumber: 'NK6-EU-MHA0013A' };
      const client = createFakeClient(machine, { humidificationMode: 'humidify', autoHumidification: false, manualHumidificationTargetInPercent: 55, fanAirDirection: null });
      const accessory = new DysonAccessory({ config: createDeviceConfig(machine, { isComposed: true }), createClient: factoryOf(client), log, vendorId, commandDelayInMs: 500 });
      await addAccessory(accessory);
      await accessory.start();
      // 55 % is as near 50 % as 60 %, and the higher one wins.
      expect(accessory.humiditySelect?.getAttribute(ModeSelect, 'currentMode')).toBe(5);
      await writeAsController(accessory.humiditySelect, 'ModeSelect', 'currentMode', 2);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ fanPower: true, humidificationMode: 'humidify', autoHumidification: false, manualHumidificationTargetInPercent: 30 });
      await writeAsController(accessory.humiditySelect, 'ModeSelect', 'currentMode', 1);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ fanPower: true, humidificationMode: 'humidify', autoHumidification: true });
      expect(accessory.humiditySelect?.getAttribute(ModeSelect, 'currentMode')).toBe(1);
      await writeAsController(accessory.humiditySelect, 'ModeSelect', 'currentMode', 0);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ humidificationMode: 'off' });
      await accessory.dispose();
    });
  });

  describe('a fan with the auto mode as a step', () => {
    it('should make a fan without an auto mode, and ignore the auto step it cannot have', async () => {
      const client = createFakeClient(coolFan, { autoMode: null, fanAirDirection: null, continuousMonitoring: null });
      const config = createDeviceConfig(coolFan, { deviceType: 'fan', fanAutoControl: 'lastStep', hasAirQualitySensor: true });
      const accessory = new DysonAccessory({ config, createClient: factoryOf(client), reportedSensors: everySensor, log, vendorId, commandDelayInMs: 500 });
      // The fan measures no air, so it gets no air quality sensor whatever it reported.
      expect(accessory.airQualitySensor).toBeUndefined();
      await addAccessory(accessory);
      expect(accessory.endpoint.getAttribute(FanControl, 'speedMax')).toBe(10);
      expect(accessory.endpoint.getAttribute(FanControl, 'fanModeSequence')).toBe(FanControl.FanModeSequence.OffLowMedHigh);
      await accessory.dispose();
    });

    it('should put auto above the fastest speed', async () => {
      const machine = { ...purifierCool, serialNumber: 'NK6-EU-MHA0011A' };
      const client = createFakeClient(machine, { autoMode: true, fanSpeed: null });
      const config = createDeviceConfig(machine, { fanAutoControl: 'lastStep', hasAirQualitySensor: false, hasTemperatureSensor: false, hasHumiditySensor: false });
      const accessory = new DysonAccessory({ config, createClient: factoryOf(client), log, vendorId, commandDelayInMs: 500 });
      await addAccessory(accessory);
      expect(accessory.endpoint.getAttribute(FanControl, 'speedMax')).toBe(11);
      await accessory.start();
      expect(accessory.endpoint.getAttribute(FanControl, 'percentSetting')).toBe(100);
      await writeAsController(accessory.endpoint, 'FanControl', 'percentSetting', 9);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ fanSpeed: 1 });
      await writeAsController(accessory.endpoint, 'FanControl', 'percentSetting', 100);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ autoMode: true });
      await accessory.dispose();
    });
  });
  describe('a purifier with a sweep select and switches', () => {
    let client: FakeClient;
    let accessory: DysonAccessory;
    const machine = { ...purifierCool, serialNumber: 'NK6-EU-MHA0021A', productName: undefined };

    it('should name the product after the type when the cloud names none', async () => {
      client = createFakeClient(machine, { oscillationMode: 'on' });
      const config = createDeviceConfig(machine, {
        oscillationControl: 'select',
        nightModeControl: 'switch',
        airflowDirectionControl: 'switch',
        fanAutoControl: 'firstStep',
        hasContinuousMonitoringSwitch: true,
        productName: undefined,
      });
      // The pollutants it has given: none but the PM2.5.
      const reportedSensors = { ...noReportedSensors, airQuality: true, pm25: true };
      accessory = new DysonAccessory({ config, createClient: factoryOf(client), reportedSensors, log, vendorId, commandDelayInMs: 50 });
      await addAccessory(accessory);
      expect(accessory.endpoint.getAttribute(BridgedDeviceBasicInformation, 'productName')).toBe('Dyson 438');
      expect(accessory.endpoint.getAttribute(FanControl, 'speedMax')).toBe(11);
      expect(accessory.takeNewlyReportedSensors()).toBeUndefined();
      expect(await accessory.start()).toBe(true);
      expect(accessory.airQualitySensor?.getAttribute('Pm25ConcentrationMeasurement', 'measuredValue')).toBe(12);
      expect(accessory.airQualitySensor?.getAttribute('Pm10ConcentrationMeasurement', 'measuredValue')).toBeUndefined();
    });

    it('should show the sweep the machine oscillates through, and nothing for one the select does not list', async () => {
      expect(accessory.oscillationSelect?.getAttribute(ModeSelect, 'currentMode')).toBe(5);
      client.state.oscillationAngles = { lowerInDegrees: 5, upperInDegrees: 60 };
      await accessory.refresh();
      expect(accessory.oscillationSelect?.getAttribute(ModeSelect, 'currentMode')).toBe(5);
    });

    it('should send a sweep as two angles once the command delay runs out', async () => {
      await writeAsController(accessory.oscillationSelect, 'ModeSelect', 'currentMode', 6);
      await vi.waitFor(() => expect(client.setState).toHaveBeenCalledWith({ oscillationMode: 'on', oscillationAngles: { lowerInDegrees: 5, upperInDegrees: 185 } }));
      await accessory.flushCommands();
    });

    it('should put auto below speed 1, and send the switches both ways', async () => {
      client.state = { ...client.state, autoMode: true, fanSpeed: null };
      await accessory.refresh();
      expect(accessory.endpoint.getAttribute(FanControl, 'percentSetting')).toBe(9);
      await writeAsController(accessory.nightModeSwitch, 'OnOff', 'onOff', false);
      await writeAsController(accessory.airflowDirectionSwitch, 'OnOff', 'onOff', true);
      await writeAsController(accessory.continuousMonitoringSwitch, 'OnOff', 'onOff', true);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ nightMode: false, fanAirDirection: 'forward', continuousMonitoring: true });
    });

    it('should keep a state the machine sends while a command waits, for the command to read back', async () => {
      await writeAsController(accessory.endpoint, 'OnOff', 'onOff', false);
      client.handlers.onState({ ...client.state, fanSpeed: 2, autoMode: false });
      await vi.waitFor(() => expect(client.setState).toHaveBeenCalledWith({ fanPower: false }));
      await accessory.flushCommands();
      expect(accessory.endpoint.getAttribute(OnOff, 'onOff')).toBe(false);
    });

    it('should log a command the machine does not take, and connect first when the client gave up', async () => {
      client.handlers.onDisconnect();
      client.setState.mockRejectedValueOnce(new DysonError('The broker refused the command', 503));
      await writeAsController(accessory.endpoint, 'OnOff', 'onOff', true);
      await accessory.flushCommands();
      expect(client.connect).toHaveBeenCalledTimes(1);
      expect(accessory.getStatus()).toMatchObject({ lastError: undefined });
      expect(client.getState).toHaveBeenCalled();
    });

    it('should read the machine again when its client connects again by itself', async () => {
      client.handlers.onReconnect();
      await vi.waitFor(() => expect(client.getState).toHaveBeenCalledTimes(1));
    });

    it('should log what it cannot write to Matter, and carry on', async () => {
      const sensor = required(accessory.airQualitySensor);
      vi.spyOn(sensor, 'updateAttribute').mockRejectedValueOnce(new Error('Matter is busy'));
      client.handlers.onSensors(createSensors());
      await accessory.flushCommands();
      vi.spyOn(accessory.endpoint, 'updateAttribute').mockRejectedValueOnce(new Error('Matter is busy'));
      client.handlers.onState({ ...client.state });
      await accessory.flushCommands();
      expect(await accessory.refresh()).toBe(true);
    });

    it('should log a reachability it cannot write to Matter', async () => {
      client.getState.mockRejectedValue(new DysonError('The machine did not answer', 504));
      await accessory.refresh();
      vi.spyOn(accessory.endpoint, 'updateAttribute').mockRejectedValueOnce(new Error('Matter is busy'));
      await accessory.refresh();
      expect(accessory.getStatus().isReachable).toBe(false);
      client.getState.mockImplementation(async () => Promise.resolve({ ...client.state }));
      expect(await accessory.refresh()).toBe(true);
    });

    it('should ignore the callbacks of a client it replaced', async () => {
      const previous = client.handlers;
      client = createFakeClient(machine);
      expect(await accessory.updateConnection(factoryOf(client))).toBe(true);
      expect(client.connect).toHaveBeenCalledTimes(1);
      previous.onState({ ...client.state, fanPower: false });
      previous.onSensors(createEmptySensors());
      previous.onReconnect();
      previous.onDisconnect();
      await accessory.flushCommands();
      expect(accessory.endpoint.getAttribute(OnOff, 'onOff')).toBe(true);
      expect(accessory.getStatus().isReachable).toBe(true);
    });

    it('should read and send nothing while it is suspended, and resume with a new client', async () => {
      await accessory.suspend();
      expect(accessory.getStatus().isConnecting).toBe(false);
      expect(client.disconnect).toHaveBeenCalledTimes(1);
      expect(accessory.endpoint.getAttribute(BridgedDeviceBasicInformation, 'reachable')).toBe(false);
      client.handlers.onDisconnect();
      expect(await accessory.refresh()).toBe(false);
      await writeAsController(accessory.endpoint, 'OnOff', 'onOff', false);
      await accessory.flushCommands();
      expect(client.setState).not.toHaveBeenCalled();
      expect(await accessory.updateConnection(factoryOf(client))).toBe(true);
      expect(accessory.endpoint.getAttribute(BridgedDeviceBasicInformation, 'reachable')).toBe(true);
    });

    it('should take a reading with no place in Matter as known, and ask to be built again for one that has a place', async () => {
      client.sensors = createSensors({
        humidityInPercent: null,
        temperatureInC: null,
        pm25InUgPerM3: 12,
        pm10InUgPerM3: null,
        pm10Index: null,
        volatileOrganicCompoundsIndex: null,
        nitrogenDioxideIndex: null,
      });
      await accessory.refresh();
      expect(accessory.takeNewlyReportedSensors()).toBeUndefined();
      client.sensors = createSensors({
        temperatureInC: null,
        humidityInPercent: null,
        pm10InUgPerM3: null,
        pm10Index: null,
        volatileOrganicCompoundsIndex: null,
        nitrogenDioxideIndex: null,
        formaldehydeInUgPerM3: 2,
      });
      await accessory.refresh();
      expect(accessory.takeNewlyReportedSensors()).toEqual({ reported: { ...noReportedSensors, airQuality: true, pm25: true, formaldehyde: true }, needsRebuild: true });
    });

    it('should ignore what comes after it is disposed, and a client that does not close cleanly', async () => {
      client.disconnect.mockRejectedValueOnce(new Error('Not connected'));
      await accessory.dispose();
      client.handlers.onState({ ...client.state, fanPower: false });
      client.handlers.onSensors(createEmptySensors());
      client.handlers.onDisconnect();
      await writeAsController(accessory.endpoint, 'OnOff', 'onOff', false);
      await accessory.flushCommands();
      expect(client.setState).not.toHaveBeenCalled();
      expect(client.getState).not.toHaveBeenCalled();
    });
  });

  describe('a heater with a heat switch', () => {
    it('should heat with its switch, and ignore a thermostat mode it does not have', async () => {
      const machine = { ...hotCool, serialNumber: 'NK6-EU-MHA0022A' };
      const client = createFakeClient(machine, { heatMode: 'heat', targetTemperatureInC: null, fanSpeed: null, autoMode: false });
      const accessory = new DysonAccessory({
        config: createDeviceConfig(machine, { heatControl: 'switch' }),
        createClient: factoryOf(client),
        log,
        vendorId,
        commandDelayInMs: 500,
      });
      expect(accessory.thermostat).toBeUndefined();
      await addAccessory(accessory);
      await accessory.start();
      expect(accessory.heatSwitch?.getAttribute(OnOff, 'onOff')).toBe(true);
      await writeAsController(accessory.heatSwitch, 'OnOff', 'onOff', false);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ heatMode: 'off' });
      await writeAsController(accessory.heatSwitch, 'OnOff', 'onOff', true);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ fanPower: true, heatMode: 'heat' });
      await accessory.dispose();
    });

    it('should heat on its thermostat while the room is below the setpoint, and refuse a mode it does not have', async () => {
      const machine = { ...hotCool, serialNumber: 'NK6-EU-MHA0023A' };
      const client = createFakeClient(machine, { heatMode: 'heat', targetTemperatureInC: 20 });
      const accessory = new DysonAccessory({ config: createDeviceConfig(machine), createClient: factoryOf(client), log, vendorId, commandDelayInMs: 500 });
      await addAccessory(accessory);
      await accessory.start();
      // The room is at 21.5 °C, above the setpoint, before any reading counts it.
      expect(accessory.thermostat?.getAttribute(Thermostat, 'thermostatRunningState')).toMatchObject({ heat: false });
      const warn = vi.spyOn(log, 'warn');
      const events = accessory.thermostat?.eventsOf('thermostat') as Record<string, { emit: (...parameters: unknown[]) => void }>;
      events.systemMode$Changed.emit(Thermostat.SystemMode.Cool, Thermostat.SystemMode.Heat, online);
      await accessory.flushCommands();
      expect(warn).toHaveBeenCalledWith(`"Bedroom" only heats: the Matter system mode Cool is ignored`);
      expect(client.setState).not.toHaveBeenCalled();
      await accessory.dispose();
    });
  });

  describe('a humidifier without the auto humidifying, and machines that do not oscillate', () => {
    it('should offer the targets without auto, and show no target it does not hold', async () => {
      const machine = { serialNumber: 'NK6-EU-MHA0024A', type: '965', category: 'environmentalCare' as const, name: 'Hall', productName: 'Pure Humidify' };
      const client = createFakeClient(machine, { humidificationMode: 'humidify', autoHumidification: null, manualHumidificationTargetInPercent: null, fanAirDirection: null });
      // It has given the index of its volatile organic compounds alone, and no PM2.5 concentration.
      const reportedSensors = { ...noReportedSensors, airQuality: true, volatileOrganicCompounds: true };
      const accessory = new DysonAccessory({ config: createDeviceConfig(machine), createClient: factoryOf(client), reportedSensors, log, vendorId, commandDelayInMs: 500 });
      expect(accessory.oscillationSelect).toBeUndefined();
      await addAccessory(accessory);
      expect(accessory.airQualitySensor?.getAttribute('Pm25ConcentrationMeasurement', 'measuredValue')).toBeUndefined();
      expect(accessory.humiditySelect?.getAttribute(ModeSelect, 'supportedModes')).toHaveLength(6);
      expect(accessory.endpoint.getAttribute('FanControl', 'rockSupport')).toBeUndefined();
      await accessory.start();
      expect(accessory.humiditySelect?.getAttribute(ModeSelect, 'currentMode')).toBe(0);
      await writeAsController(accessory.humiditySelect, 'ModeSelect', 'currentMode', 4);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ fanPower: true, humidificationMode: 'humidify', manualHumidificationTargetInPercent: 50 });
      await accessory.dispose();
    });

    it('should switch the humidifying off', async () => {
      const machine = { ...humidifyCool, serialNumber: 'NK6-EU-MHA0025A' };
      const client = createFakeClient(machine, { humidificationMode: 'humidify', autoHumidification: true, fanAirDirection: null });
      const accessory = new DysonAccessory({
        config: createDeviceConfig(machine, { humidificationControl: 'switches' }),
        createClient: factoryOf(client),
        log,
        vendorId,
        commandDelayInMs: 500,
      });
      await addAccessory(accessory);
      await accessory.start();
      await writeAsController(accessory.humidifySwitch, 'OnOff', 'onOff', false);
      await writeAsController(accessory.autoHumidifySwitch, 'OnOff', 'onOff', false);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ humidificationMode: 'off', autoHumidification: false });
      await accessory.dispose();
    });

    it('should send the rocking and the sleep wind both ways, and leave a fan with no speed as it is', async () => {
      const machine = { serialNumber: 'NK6-EU-MHA0026A', type: '520', category: 'environmentalCare' as const, name: 'Den' };
      const client = createFakeClient(machine, { fanSpeed: null });
      const accessory = new DysonAccessory({ config: createDeviceConfig(machine), createClient: factoryOf(client), log, vendorId, commandDelayInMs: 500 });
      await addAccessory(accessory);
      await accessory.start();
      expect(accessory.endpoint.getAttribute(FanControl, 'percentSetting')).toBe(0);
      await writeTogetherAsController(accessory.endpoint, [
        ['FanControl', 'rockSetting', { rockLeftRight: true, rockUpDown: false, rockRound: false }],
        ['FanControl', 'windSetting', { sleepWind: true, naturalWind: false }],
      ]);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ oscillationMode: 'on', nightMode: true });
      await accessory.dispose();
    });
  });

  describe('a fan with no sensor of its own', () => {
    it('should write a state it is sent before any reading, and take readings with no place in Matter as known', async () => {
      const machine = { ...coolFan, serialNumber: 'NK6-EU-MHA0027A' };
      const client = createFakeClient(machine, { autoMode: null, fanAirDirection: null, continuousMonitoring: null, oscillationMode: 'on' });
      const config = createDeviceConfig(machine, { deviceType: 'fan', oscillationControl: 'switch', hasTemperatureSensor: false, hasHumiditySensor: false });
      const accessory = new DysonAccessory({ config, createClient: factoryOf(client), log, vendorId, commandDelayInMs: 500 });
      await addAccessory(accessory);
      client.handlers.onState({ ...client.state });
      await accessory.flushCommands();
      expect(accessory.oscillationSwitch?.getAttribute(OnOff, 'onOff')).toBe(true);
      await accessory.start();
      expect(accessory.takeNewlyReportedSensors()).toEqual({ reported: expect.objectContaining({ temperature: true, humidity: true }), needsRebuild: false });
      expect(accessory.takeNewlyReportedSensors()).toBeUndefined();
      await writeAsController(accessory.oscillationSwitch, 'OnOff', 'onOff', false);
      await accessory.flushCommands();
      expect(client.setState).toHaveBeenCalledWith({ oscillationMode: 'off' });
      await accessory.dispose();
    });
  });

  describe('readFanRequest', () => {
    it('should read nothing from a fan control that holds no percent', () => {
      const endpoint = { getAttribute: (_cluster: unknown, attribute: string) => (attribute === 'fanMode' ? FanControl.FanMode.Low : null) } as unknown as MatterbridgeEndpoint;
      expect(readFanRequest(endpoint, [1, 2, 3])).toBeUndefined();
    });
  });
});
