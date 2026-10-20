/**
 * @file vitest/mapping.test.ts
 * @description This file contains the tests for the conversions between the Dyson model and the Matter clusters.
 * @author Calvin Che
 */

import { AirQuality, ConcentrationMeasurement, FanControl, ResourceMonitoring } from 'matterbridge/matter/clusters';

import {
  clampHeatTarget,
  composeDeviceName,
  fanStepToPercent,
  filterHoursToPercent,
  getAirQuality,
  getFanModeSequence,
  getFilterChangeIndication,
  getNearestHumidityTarget,
  getSweep,
  getSweepAngles,
  getSweeps,
  indexToAirQuality,
  indexToLevel,
  isOscillating,
  isOscillationSweep,
  isTiltFanAngle,
  oscillationSelectChoices,
  percentToFanStep,
  toFilterCondition,
  toMatterHumidity,
  toMatterTemperature,
  toModeOptions,
  toOscillationMode,
} from '../src/mapping.js';
import { capabilitiesOf, createEmptySensors, createFakeClient, createSensors, humidifyCool, purifierCool } from './fakeDyson.js';

describe('mapping', () => {
  it('should turn each fan step into a percent that turns back into the same step', () => {
    for (let step = 1; step <= 11; step++) expect(percentToFanStep(11, fanStepToPercent(11, step))).toBe(step);
    expect(fanStepToPercent(10, 4)).toBe(40);
    // Rounded down, as Matterbridge rounds the speed setting up: four sixths are 66.7 %.
    expect(fanStepToPercent(6, 4)).toBe(66);
    expect(fanStepToPercent(11, 6)).toBe(54);
    expect(percentToFanStep(10, 0)).toBe(1);
    expect(percentToFanStep(10, 100)).toBe(10);
    // The nearest step, the faster one halfway.
    expect(percentToFanStep(10, 31)).toBe(3);
    expect(percentToFanStep(10, 34)).toBe(3);
    expect(percentToFanStep(10, 35)).toBe(4);
    expect(percentToFanStep(10, 4)).toBe(1);
  });

  it('should pick the fan mode sequence with or without auto', () => {
    expect(getFanModeSequence(true)).toBe(FanControl.FanModeSequence.OffLowMedHighAuto);
    expect(getFanModeSequence(false)).toBe(FanControl.FanModeSequence.OffLowMedHigh);
  });

  it('should pick a fan mode sequence for the fewer speeds of an oscillation fan', () => {
    expect(getFanModeSequence(false, 3)).toBe(FanControl.FanModeSequence.OffLowMedHigh);
    expect(getFanModeSequence(true, 2)).toBe(FanControl.FanModeSequence.OffLowHighAuto);
    expect(getFanModeSequence(false, 2)).toBe(FanControl.FanModeSequence.OffLowHigh);
    expect(getFanModeSequence(true, 1)).toBe(FanControl.FanModeSequence.OffHighAuto);
    expect(getFanModeSequence(false, 1)).toBe(FanControl.FanModeSequence.OffHigh);
  });

  it('should tell the angles a machine tilts to from the ones it sweeps', () => {
    expect(isTiltFanAngle(0)).toBe(true);
    expect(isTiltFanAngle(25)).toBe(true);
    expect(isTiltFanAngle(50)).toBe(true);
    expect(isTiltFanAngle(45)).toBe(false);
  });

  it('should list the modes of a select in the order of its choices, numbered by their place', () => {
    expect(toModeOptions(oscillationSelectChoices, ['off', 'breeze', 45])).toEqual([
      { label: 'Off', mode: 0, semanticTags: [] },
      { label: '45°', mode: 3, semanticTags: [] },
      { label: 'Breeze', mode: 8, semanticTags: [] },
    ]);
  });

  it('should take on, idle on and scan as oscillating', () => {
    expect(isOscillating('on')).toBe(true);
    expect(isOscillating('idleOn')).toBe(true);
    expect(isOscillating('scan')).toBe(true);
    expect(isOscillating('idleOff')).toBe(false);
    expect(isOscillating(null)).toBe(false);
  });

  it('should turn the oscillation of a machine that stands by on and off with its idle modes', () => {
    const { state } = createFakeClient(humidifyCool);
    const modes = capabilitiesOf(humidifyCool).oscillationModes;
    expect(toOscillationMode(true, state, modes)).toBe('on');
    expect(toOscillationMode(false, undefined, modes)).toBe('off');
    expect(toOscillationMode(true, { ...state, oscillationState: 'idle' }, modes)).toBe('idleOn');
    expect(toOscillationMode(false, { ...state, oscillationMode: 'idleOn' }, modes)).toBe('idleOff');
    expect(toOscillationMode(true, { ...state, oscillationMode: 'idleOff' }, modes)).toBe('idleOn');
    // A basic oscillation has no idle modes.
    expect(toOscillationMode(true, { ...state, oscillationState: 'idle' }, ['off', 'on'])).toBe('on');
    expect(capabilitiesOf(purifierCool).oscillationModes).toContain('idleOn');
  });

  it('should show the life left in a filter, and warn when it is about to run out', () => {
    expect(filterHoursToPercent(4300)).toBe(100);
    expect(filterHoursToPercent(2150)).toBe(50);
    expect(filterHoursToPercent(5000)).toBe(100);
    expect(toFilterCondition(84.6)).toBe(85);
    expect(toFilterCondition(-3)).toBe(0);
    expect(getFilterChangeIndication(11)).toBe(ResourceMonitoring.ChangeIndication.Ok);
    expect(getFilterChangeIndication(10)).toBe(ResourceMonitoring.ChangeIndication.Warning);
    expect(getFilterChangeIndication(0)).toBe(ResourceMonitoring.ChangeIndication.Critical);
  });

  it('should offer the widths a machine takes as sweeps, but not one direction', () => {
    expect(isOscillationSweep(90)).toBe(true);
    expect(isOscillationSweep('breeze')).toBe(false);
    expect(getSweeps([0, 45, 90, 180, 350])).toEqual([45, 90, 180, 350]);
    expect(getSweeps([0])).toEqual([]);
  });

  it('should centre a sweep where the machine oscillates, within its range', () => {
    const range = { lowerInDegrees: 5, upperInDegrees: 355 };
    expect(getSweepAngles(90, { lowerInDegrees: 135, upperInDegrees: 225 }, range)).toEqual({ lowerInDegrees: 135, upperInDegrees: 225 });
    expect(getSweepAngles(180, { lowerInDegrees: 10, upperInDegrees: 30 }, range)).toEqual({ lowerInDegrees: 5, upperInDegrees: 185 });
    expect(getSweepAngles(180, { lowerInDegrees: 330, upperInDegrees: 350 }, range)).toEqual({ lowerInDegrees: 175, upperInDegrees: 355 });
    expect(getSweepAngles(350, null, range)).toEqual({ lowerInDegrees: 5, upperInDegrees: 355 });
    expect(getSweepAngles(45, null, { lowerInDegrees: 145, upperInDegrees: 215 })).toEqual({ lowerInDegrees: 158, upperInDegrees: 203 });
  });

  it('should find the sweep a machine oscillates through among those its select offers', () => {
    const offered = ['off', 45, 90, 180, 350] as const;
    expect(getSweep({ lowerInDegrees: 5, upperInDegrees: 355 }, offered)).toBe(350);
    expect(getSweep({ lowerInDegrees: 5, upperInDegrees: 60 }, offered)).toBeUndefined();
    expect(getSweep({ lowerInDegrees: 5, upperInDegrees: 20 }, ['off', 45])).toBeUndefined();
    expect(getSweep(null, offered)).toBeUndefined();
  });

  it('should clamp a heating setpoint to whole degrees from 1 to 37 °C', () => {
    expect(clampHeatTarget(21.4)).toBe(21);
    expect(clampHeatTarget(-5)).toBe(1);
    expect(clampHeatTarget(50)).toBe(37);
    expect(clampHeatTarget(Number.NaN)).toBe(21);
  });

  it('should find the nearest target humidity, the higher one at an equal distance', () => {
    expect(getNearestHumidityTarget(42)).toBe(40);
    expect(getNearestHumidityTarget(45)).toBe(50);
    expect(getNearestHumidityTarget(10)).toBe(30);
    expect(getNearestHumidityTarget(90)).toBe(70);
  });

  it('should turn a Dyson index into the Matter air quality and level', () => {
    expect([0, 4, 7, 9, 11, 13].map(indexToAirQuality)).toEqual([
      AirQuality.AirQualityEnum.Good,
      AirQuality.AirQualityEnum.Fair,
      AirQuality.AirQualityEnum.Moderate,
      AirQuality.AirQualityEnum.Poor,
      AirQuality.AirQualityEnum.VeryPoor,
      AirQuality.AirQualityEnum.ExtremelyPoor,
    ]);
    expect([null, 3, 6, 10, 12].map(indexToLevel)).toEqual([
      ConcentrationMeasurement.LevelValue.Unknown,
      ConcentrationMeasurement.LevelValue.Low,
      ConcentrationMeasurement.LevelValue.Medium,
      ConcentrationMeasurement.LevelValue.High,
      ConcentrationMeasurement.LevelValue.Critical,
    ]);
  });

  it('should take the air quality of the worst pollutant, and unknown without one', () => {
    expect(getAirQuality(createSensors({ nitrogenDioxideIndex: 9.5 }))).toBe(AirQuality.AirQualityEnum.Poor);
    expect(getAirQuality(createEmptySensors())).toBe(AirQuality.AirQualityEnum.Unknown);
  });

  it('should encode a temperature and a humidity in hundredths', () => {
    expect(toMatterTemperature(21.456)).toBe(2146);
    expect(toMatterHumidity(45.5)).toBe(4550);
  });

  it('should cut a long device name short, never its suffix', () => {
    expect(composeDeviceName('Living Room', 'Night Mode')).toBe('Living Room Night Mode');
    expect(composeDeviceName('A very long living room name', 'Continuous Monitoring')).toBe('A very lon Continuous Monitoring');
  });
});
