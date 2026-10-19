/**
 * @file vitest/mapping.test.ts
 * @description This file contains the tests for the conversions between the Dyson model and the Matter clusters.
 * @author Calvin Che
 */

import { AirQuality, ConcentrationMeasurement, FanControl } from 'matterbridge/matter/clusters';

import {
  clampHeatTarget,
  composeDeviceName,
  fanModeScale,
  fanStepToPercent,
  getAirQuality,
  getFanModePick,
  getFanModeSequence,
  getNearestHumidityTarget,
  getPickedSpeed,
  getSweep,
  getSweepAngles,
  getSweeps,
  indexToAirQuality,
  indexToLevel,
  isOscillating,
  isOscillationSweep,
  oscillationSelectChoices,
  percentToFanStep,
  toMatterHumidity,
  toMatterTemperature,
  toModeOptions,
} from '../src/mapping.js';
import { createEmptySensors, createSensors } from './fakeDyson.js';

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

  it('should tell a fan mode a controller picked from one a percent set, by the middle percent Matterbridge gives a pick', () => {
    expect(getFanModePick(FanControl.FanMode.Low, 17, fanModeScale)).toBe('slowest');
    expect(getFanModePick(FanControl.FanMode.Medium, 50, fanModeScale)).toBe('middle');
    expect(getFanModePick(FanControl.FanMode.High, 84, fanModeScale)).toBe('fastest');
    expect(getFanModePick(FanControl.FanMode.High, 90, fanModeScale)).toBeUndefined();
    expect(getFanModePick(FanControl.FanMode.Auto, null, fanModeScale)).toBeUndefined();
    // With two fan modes or one, the shares are halves or the whole.
    expect(getFanModePick(FanControl.FanMode.Low, 26, [FanControl.FanMode.Low, FanControl.FanMode.High])).toBe('slowest');
    expect(getFanModePick(FanControl.FanMode.High, 76, [FanControl.FanMode.Low, FanControl.FanMode.High])).toBe('fastest');
    expect(getFanModePick(FanControl.FanMode.High, 51, [FanControl.FanMode.High])).toBe('slowest');
  });

  it('should find the slowest, the middle and the fastest speed', () => {
    expect(getPickedSpeed([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'slowest')).toBe(1);
    expect(getPickedSpeed([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'middle')).toBe(5);
    expect(getPickedSpeed([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'fastest')).toBe(10);
    expect(getPickedSpeed(['a', 'b', 'c', 'd', 'e', 'f'], 'middle')).toBe('c');
  });

  it('should pick the fan mode sequence with or without auto', () => {
    expect(getFanModeSequence(true)).toBe(FanControl.FanModeSequence.OffLowMedHighAuto);
    expect(getFanModeSequence(false)).toBe(FanControl.FanModeSequence.OffLowMedHigh);
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
