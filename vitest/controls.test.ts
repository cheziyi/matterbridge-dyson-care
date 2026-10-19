/**
 * @file vitest/controls.test.ts
 * @description This file contains the tests for what the capabilities of a machine let its device have in Matter.
 * @author Calvin Che
 */

import { addReportedSensors, fitToCapabilities, getAvailableControls, hasSameControls, noReportedSensors } from '../src/controls.js';
import { capabilitiesOf, coolFan, createDeviceConfig, createEmptySensors, createSensors, hotCool, humidifyCool, purifierCool } from './fakeDyson.js';

describe('controls', () => {
  it('should offer the sweeps to a machine that takes any two angles', () => {
    expect(getAvailableControls(capabilitiesOf(purifierCool))).toEqual({
      hasAutoMode: true,
      hasOscillation: true,
      oscillationAngles: [45, 90, 180, 350],
      hasAirflowDirection: true,
      hasHeat: false,
      hasHumidification: false,
      hasAutoHumidification: false,
      hasContinuousMonitoring: true,
      hasAirQualitySensor: true,
    });
  });

  it('should offer the preset angles, the heating and the humidifying of the machines that have them', () => {
    expect(getAvailableControls(capabilitiesOf(hotCool))).toMatchObject({ hasHeat: true, oscillationAngles: [45, 90, 180, 350] });
    expect(getAvailableControls(capabilitiesOf(humidifyCool))).toMatchObject({ hasHumidification: true, hasAutoHumidification: true, oscillationAngles: [45, 90, 'breeze'] });
  });

  it('should offer a fan without an auto mode or an air quality sensor none of them', () => {
    expect(getAvailableControls(capabilitiesOf(coolFan))).toMatchObject({ hasAutoMode: false, hasAirQualitySensor: false, hasContinuousMonitoring: false });
  });

  it('should offer no sweep to a machine that takes its two angles one way alone', () => {
    const narrow = { serialNumber: 'NK6-EU-MHA0031A', type: '739', category: 'environmentalCare' as const, firmwareCapabilities: ['AdvanceOscillationDay1'] };
    expect(capabilitiesOf(narrow).oscillationAngleWidthsInDegrees).toEqual([0]);
    expect(getAvailableControls(capabilitiesOf(narrow))).toMatchObject({ hasOscillation: true, oscillationAngles: [] });
  });

  it('should offer no oscillation to a machine that does not oscillate or tilts', () => {
    expect(getAvailableControls({ ...capabilitiesOf(purifierCool), oscillation: 'tilt' })).toMatchObject({ hasOscillation: false, oscillationAngles: [] });
    expect(getAvailableControls({ ...capabilitiesOf(purifierCool), oscillation: 'basic', oscillationAngles: null, oscillationAngleWidthsInDegrees: [] })).toMatchObject({
      hasOscillation: true,
      oscillationAngles: [],
    });
  });

  it('should drop the settings a machine has no use for', () => {
    const device = createDeviceConfig(coolFan, { fanAutoControl: 'switch', airflowDirectionControl: 'switch', hasContinuousMonitoringSwitch: true });
    expect(fitToCapabilities(device, capabilitiesOf(coolFan))).toEqual({
      ...device,
      fanAutoControl: 'native',
      airflowDirectionControl: 'hidden',
      heatControl: 'hidden',
      humidificationControl: 'hidden',
      hasContinuousMonitoringSwitch: false,
      hasAirQualitySensor: false,
    });
  });

  it('should keep the humidifying of a humidifier', () => {
    expect(fitToCapabilities(createDeviceConfig(humidifyCool, { humidificationControl: 'switches' }), capabilitiesOf(humidifyCool)).humidificationControl).toBe('switches');
  });

  it('should turn an oscillation select without angles into a switch, and hide one the machine lacks', () => {
    const device = createDeviceConfig(purifierCool, { oscillationControl: 'select' });
    expect(
      fitToCapabilities(device, { ...capabilitiesOf(purifierCool), oscillation: 'basic', oscillationAngles: null, oscillationAngleWidthsInDegrees: [] }).oscillationControl,
    ).toBe('switch');
    expect(fitToCapabilities(device, { ...capabilitiesOf(purifierCool), oscillation: 'none' }).oscillationControl).toBe('hidden');
    expect(fitToCapabilities(device, capabilitiesOf(purifierCool)).oscillationControl).toBe('select');
  });

  it('should tell whether two capabilities build the same controls', () => {
    const capabilities = capabilitiesOf(purifierCool);
    expect(hasSameControls(capabilities, capabilitiesOf({ ...purifierCool, firmwareVersion: '1' }))).toBe(true);
    // Both offer 45° to 350°, but the one sends two angles and the other a preset.
    const presetsOnly = capabilitiesOf({ ...purifierCool, firmwareCapabilities: ['AdvanceOscillationDay0'] });
    expect(getAvailableControls(presetsOnly).oscillationAngles).toEqual(getAvailableControls(capabilities).oscillationAngles);
    expect(hasSameControls(capabilities, presetsOnly)).toBe(false);
  });

  it('should add the readings a machine gives for the first time, and keep the known ones otherwise', () => {
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
