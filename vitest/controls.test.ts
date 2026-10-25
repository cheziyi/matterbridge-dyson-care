/**
 * @file vitest/controls.test.ts
 * @description This file contains the tests for what the capabilities of a machine let its device have in Matter.
 * @author Calvin Che
 */

import { addReportedSensors, fitToCapabilities, getAvailableControls, hasSameControls, noReportedSensors } from '../src/controls.js';
import { bigQuiet, capabilitiesOf, coolFan, createDeviceConfig, createEmptySensors, createSensors, hotCool, humidifyCool, purifierCool, purifierFollow } from './fakeDyson.js';

describe('controls', () => {
  test('should offer the sweeps to a machine that takes any two angles', () => {
    expect(getAvailableControls(capabilitiesOf(purifierCool))).toEqual({
      hasAutoMode: true,
      hasOscillation: true,
      oscillationAngles: [45, 90, 180, 350],
      tiltAngles: [],
      oscillationFanAngles: [45, 90, 180, 350],
      hasFindAndFollow: false,
      hasAirflowDirection: true,
      hasHeat: false,
      hasHumidification: false,
      hasAutoHumidification: false,
      settingControls: [],
      hasFilterLife: true,
      hasContinuousMonitoring: true,
      hasAirQualitySensor: true,
    });
  });

  test('should offer the preset angles, the heating and the humidifying of the machines that have them', () => {
    expect(getAvailableControls(capabilitiesOf(hotCool))).toMatchObject({ hasHeat: true, oscillationAngles: [45, 90, 180, 350] });
    expect(getAvailableControls(capabilitiesOf(humidifyCool))).toMatchObject({
      hasHumidification: true,
      hasAutoHumidification: true,
      settingControls: ['hasWaterHardnessSelect'],
      oscillationAngles: [45, 90, 'breeze'],
      // The breeze is the fan mode Auto of an oscillation fan, and no speed.
      oscillationFanAngles: [45, 90],
    });
  });

  test('should offer the tilt of a machine that tilts as its oscillation, and find and follow to one that has it', () => {
    expect(getAvailableControls(capabilitiesOf(bigQuiet))).toMatchObject({
      hasOscillation: true,
      oscillationAngles: [],
      tiltAngles: [0, 25, 50, 'breeze'],
      oscillationFanAngles: [0, 25, 50],
    });
    expect(getAvailableControls(capabilitiesOf(purifierFollow))).toMatchObject({ hasFindAndFollow: true });
  });

  test('should offer a fan without an auto mode or an air quality sensor none of them', () => {
    expect(getAvailableControls(capabilitiesOf(coolFan))).toMatchObject({ hasAutoMode: false, hasAirQualitySensor: false, hasContinuousMonitoring: false, hasFilterLife: false });
  });

  test('should offer no sweep to a machine that takes its two angles one way alone', () => {
    const narrow = { serialNumber: 'NK6-EU-MHA0031A', type: '739', category: 'environmentalCare' as const, firmwareCapabilities: ['AdvanceOscillationDay1'] };
    expect(capabilitiesOf(narrow).oscillationAngleWidthsInDegrees).toEqual([0]);
    expect(getAvailableControls(capabilitiesOf(narrow))).toMatchObject({ hasOscillation: true, oscillationAngles: [] });
  });

  test('should offer no oscillation to a machine that does not oscillate, or tilts without a breeze', () => {
    expect(getAvailableControls({ ...capabilitiesOf(purifierCool), oscillation: 'none' })).toMatchObject({ hasOscillation: false, oscillationAngles: [] });
    expect(getAvailableControls({ ...capabilitiesOf(bigQuiet), tiltAnglesInDegrees: [0, 25] })).toMatchObject({
      hasOscillation: false,
      oscillationAngles: [],
      tiltAngles: [0, 25],
      oscillationFanAngles: [],
    });
    expect(getAvailableControls({ ...capabilitiesOf(purifierCool), oscillation: 'basic', oscillationAngles: null, oscillationAngleWidthsInDegrees: [] })).toMatchObject({
      hasOscillation: true,
      oscillationAngles: [],
    });
  });

  test('should drop the settings a machine has no use for', () => {
    const device = createDeviceConfig(coolFan, {
      fanAutoControl: 'switch',
      airflowDirectionControl: 'switch',
      findAndFollowControl: 'switch',
      hasWaterHardnessSelect: true,
      hasContinuousMonitoringSwitch: true,
    });
    expect(fitToCapabilities(device, capabilitiesOf(coolFan))).toEqual({
      ...device,
      fanAutoControl: 'native',
      heatControl: 'hidden',
      humidificationControl: 'hidden',
      findAndFollowControl: 'hidden',
      hasWaterHardnessSelect: false,
      hasContinuousMonitoringSwitch: false,
      hasAirQualitySensor: false,
    });
  });

  test('should keep the humidifying of a humidifier, and the controls of the machines that have them', () => {
    const humidifier = createDeviceConfig(humidifyCool, { humidificationControl: 'switches', hasWaterHardnessSelect: true });
    expect(fitToCapabilities(humidifier, capabilitiesOf(humidifyCool))).toMatchObject({
      humidificationControl: 'switches',
      hasWaterHardnessSelect: true,
    });
    expect(fitToCapabilities(createDeviceConfig(purifierFollow, { findAndFollowControl: 'select' }), capabilitiesOf(purifierFollow)).findAndFollowControl).toBe('select');
    // A tilt select picks the angle, so it stays a select.
    expect(fitToCapabilities(createDeviceConfig(bigQuiet, { oscillationControl: 'select' }), capabilitiesOf(bigQuiet)).oscillationControl).toBe('select');
  });

  test('should turn an oscillation select without angles into a switch, and keep the choice for one the machine lacks', () => {
    const device = createDeviceConfig(purifierCool, { oscillationControl: 'select' });
    expect(
      fitToCapabilities(device, { ...capabilitiesOf(purifierCool), oscillation: 'basic', oscillationAngles: null, oscillationAngleWidthsInDegrees: [] }).oscillationControl,
    ).toBe('switch');
    expect(fitToCapabilities(device, { ...capabilitiesOf(purifierCool), oscillation: 'none' }).oscillationControl).toBe('select');
    expect(fitToCapabilities(device, capabilitiesOf(purifierCool)).oscillationControl).toBe('select');
  });

  test('should turn an oscillation fan without angles into a switch, and keep the choice for one the machine lacks', () => {
    const device = createDeviceConfig(purifierCool, { oscillationControl: 'fan' });
    expect(
      fitToCapabilities(device, { ...capabilitiesOf(purifierCool), oscillation: 'basic', oscillationAngles: null, oscillationAngleWidthsInDegrees: [] }).oscillationControl,
    ).toBe('switch');
    // A barrel that breezes alone has an auto mode but no speed.
    expect(fitToCapabilities(device, { ...capabilitiesOf(humidifyCool), oscillationPresetAnglesInDegrees: ['breeze'] }).oscillationControl).toBe('switch');
    expect(fitToCapabilities(device, { ...capabilitiesOf(purifierCool), oscillation: 'none' }).oscillationControl).toBe('fan');
    expect(fitToCapabilities(device, capabilitiesOf(purifierCool)).oscillationControl).toBe('fan');
    expect(fitToCapabilities(createDeviceConfig(bigQuiet, { oscillationControl: 'fan' }), capabilitiesOf(bigQuiet)).oscillationControl).toBe('fan');
  });

  test('should tell whether two capabilities build the same controls', () => {
    const capabilities = capabilitiesOf(purifierCool);
    expect(hasSameControls(capabilities, capabilitiesOf({ ...purifierCool, firmwareVersion: '1' }))).toBe(true);
    // Both offer 45° to 350°, but the one sends two angles and the other a preset.
    const presetsOnly = capabilitiesOf({ ...purifierCool, firmwareCapabilities: ['AdvanceOscillationDay0'] });
    expect(getAvailableControls(presetsOnly).oscillationAngles).toEqual(getAvailableControls(capabilities).oscillationAngles);
    expect(hasSameControls(capabilities, presetsOnly)).toBe(false);
  });

  test('should add the readings a machine gives for the first time, and keep the known ones otherwise', () => {
    const known = addReportedSensors(noReportedSensors, createSensors());
    expect(known).toEqual({
      temperature: true,
      humidity: true,
      airQuality: true,
      pm25: true,
      pm10: true,
      volatileOrganicCompounds: true,
      nitrogenDioxide: true,
      formaldehyde: false,
      carbonDioxide: false,
    });
    expect(addReportedSensors(known, createEmptySensors())).toBe(known);
    expect(addReportedSensors(known, createSensors({ carbonDioxideInPpm: 600 }))).toEqual({ ...known, carbonDioxide: true });
  });
});
