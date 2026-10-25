/**
 * @file src/mapping.ts
 * @description This file contains the conversions between the Dyson model and the Matter clusters.
 * @author Calvin Che
 * @created 2026-10-19
 * @version 1.0.0
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

import {
  type EnvironmentalCareSensors,
  type EnvironmentalCareState,
  FAN_SPEEDS,
  FIND_AND_FOLLOW_MODES,
  type FanSpeed,
  type FindAndFollowMode,
  type OscillationAngles,
  type OscillationMode,
  type OscillationPresetAngle,
  TILT_ANGLES,
  type TiltAngle,
  WATER_HARDNESSES,
  type WaterHardness,
} from 'dyson-control';
import { AirQuality, ConcentrationMeasurement, FanControl, type ModeSelect, ResourceMonitoring } from 'matterbridge/matter/clusters';

import { maxDeviceNameLength } from './config.js';

/** A place on the scale of the fan control: a fan speed, or the auto mode when it is a step. */
export type FanPosition = FanSpeed | 'auto';

/** The fan speeds of every machine, slowest first. */
export const fanSteps: readonly FanSpeed[] = FAN_SPEEDS;

/** The fan speed turning the auto mode off goes to when the machine was never seen at a speed of its own. */
export const middleFanSpeed: FanSpeed = 5;

/** The heating setpoints a heater takes, in °C, in whole degrees. */
export const heatTargetRange = { min: 1, max: 37 } as const;

/** The room temperature a thermostat shows until the machine gives one, in °C: Matter wants one at the start. */
export const defaultHeatTargetInC = 21;

/** The target humidities a humidifier takes in the MyDyson app, in percent. */
export const humidityTargets = [30, 40, 50, 60, 70] as const;

export type HumidityTarget = (typeof humidityTargets)[number];

/**
 * The values a mode select picks from, in the order it lists them, and what each is called there
 *
 * The mode number of a value is its place in `values`, so that it stays the same whatever the machine takes.
 */
export interface SelectChoices<T extends string | number> {
  values: readonly T[];
  labels: Readonly<Record<T, string>>;
}

/** What the oscillation select picks: off, or the angle the machine sweeps, or a breeze. */
export type OscillationSelectValue = 'off' | Exclude<OscillationPresetAngle, 'custom'>;

/** Off and every angle a machine sweeps on its oscillation select, narrowest first. */
export const oscillationSelectChoices: SelectChoices<OscillationSelectValue> = {
  values: ['off', 15, 40, 45, 70, 90, 180, 350, 'breeze'],
  labels: { 'off': 'Off', '15': '15°', '40': '40°', '45': '45°', '70': '70°', '90': '90°', '180': '180°', '350': '350°', 'breeze': 'Breeze' },
};

/** An angle of the oscillation select, which a machine that takes two angles is sent as their width. */
export type OscillationSweep = Extract<OscillationSelectValue, number>;

/** An angle that is a speed of the oscillation fan: one the machine sweeps, or one a machine that tilts tilts to. */
export type OscillationFanAngle = OscillationSweep | Exclude<TiltAngle, 'breeze'>;

/** A speed of the oscillation fan: an angle, or `still` for a machine that does not tilt standing still, below its sweeps. */
export type OscillationFanPosition = 'still' | OscillationFanAngle;

/** What the humidity select picks: off, the auto mode, or a target humidity. */
export type HumiditySelectValue = 'off' | 'auto' | HumidityTarget;

/** Off, auto and every target humidity on the humidity select. */
export const humiditySelectChoices: SelectChoices<HumiditySelectValue> = {
  values: ['off', 'auto', ...humidityTargets],
  labels: { 'off': 'Off', 'auto': 'Auto', '30': '30 %', '40': '40 %', '50': '50 %', '60': '60 %', '70': '70 %' },
};

/** The angles a machine that tilts is tilted to on its tilt select, and its breeze, which tilts it up and down. */
export const tiltSelectChoices: SelectChoices<TiltAngle> = {
  values: TILT_ANGLES,
  labels: { '0': '0°', '25': '25°', '50': '50°', 'breeze': 'Breeze' },
};

/** The angle a machine that tilts goes back to when its breeze is turned off, until it is seen at another. */
export const defaultTiltAngle: TiltAngle = 0;

/** Off, follow and scan on the find and follow select: `on` follows the people the machine finds, and `scan` looks for them. */
export const findAndFollowSelectChoices: SelectChoices<FindAndFollowMode> = {
  values: FIND_AND_FOLLOW_MODES,
  labels: { off: 'Off', on: 'Follow', scan: 'Scan' },
};

/** The water hardnesses on the water hardness select, which set how often a humidifier asks for a clean cycle. */
export const waterHardnessSelectChoices: SelectChoices<WaterHardness> = {
  values: WATER_HARDNESSES,
  labels: { soft: 'Soft', medium: 'Medium', hard: 'Hard' },
};

/**
 * List the modes of a mode select
 *
 * @param {SelectChoices<T>} choices The values the select picks from.
 * @param {readonly T[]} supported The values the machine takes.
 * @returns {ModeSelect.ModeOption[]} One mode for each value the machine takes, in the order of `choices`.
 */
export function toModeOptions<T extends string | number>(choices: SelectChoices<T>, supported: readonly T[]): ModeSelect.ModeOption[] {
  return choices.values.flatMap((value, mode) => (supported.includes(value) ? [{ label: choices.labels[value], mode, semanticTags: [] }] : []));
}

/**
 * Convert a fan step to the Matter percent that stands for it
 *
 * The percent is the top of the step's share of 100, rounded down, so that `percentToFanStep` turns it back into the same
 * step. Rounded down rather than to the nearest: the fan control server of Matterbridge sets the speed setting to the
 * percent's share of the speeds rounded up, which is then the step itself.
 *
 * @param {number} stepCount How many steps the fan control has (>= 1).
 * @param {number} step The step, from 1 for the slowest to `stepCount`.
 * @returns {number} The percent, 1..100.
 */
export function fanStepToPercent(stepCount: number, step: number): number {
  return Math.max(1, Math.floor((step * 100) / stepCount));
}

/**
 * Convert a Matter percent to the nearest fan step
 *
 * Edge cases:
 *  - halfway between two steps -> the faster one
 *  - clamps to 1..`stepCount`, so 0 is the slowest step: the caller decides what off means
 *
 * @param {number} stepCount How many steps the fan control has (>= 1).
 * @param {number} percent The percent, 0..100.
 * @returns {number} The step, from 1 for the slowest to `stepCount`.
 */
export function percentToFanStep(stepCount: number, percent: number): number {
  return Math.min(Math.max(Math.round((stepCount * percent) / 100), 1), stepCount);
}

/**
 * Pick the Matter fan mode sequence of a fan control
 *
 * Every machine has ten speeds, so the sequence of its fan always has Low, Medium and High. The fan of its oscillation
 * can have fewer, one for each angle.
 *
 * Edge cases:
 *  - two speeds -> Low and High
 *  - one speed -> High alone
 *
 * @param {boolean} hasAuto Whether the fan control has the fan mode Auto.
 * @param {number} [speedCount] How many speeds the fan control has. Defaults to the ten of every machine.
 * @returns {FanControl.FanModeSequence} The sequence.
 */
export function getFanModeSequence(hasAuto: boolean, speedCount = fanSteps.length): FanControl.FanModeSequence {
  const { OffLowMedHighAuto, OffLowMedHigh, OffLowHighAuto, OffLowHigh, OffHighAuto, OffHigh } = FanControl.FanModeSequence;
  if (speedCount >= 3) return hasAuto ? OffLowMedHighAuto : OffLowMedHigh;
  if (speedCount === 2) return hasAuto ? OffLowHighAuto : OffLowHigh;
  return hasAuto ? OffHighAuto : OffHigh;
}

/**
 * Tell whether an oscillation mode is the machine oscillating
 *
 * `idleOn` is the oscillation on while the machine stands by with it paused. A machine reports `scan` and is never sent
 * it, and what it means is not known: see the UNSUPPORTED.md of dyson-control. It is taken as oscillating.
 *
 * @param {OscillationMode | null} mode The oscillation mode the machine reports.
 * @returns {boolean} True for `on`, `idleOn` and `scan`.
 */
export function isOscillating(mode: OscillationMode | null): boolean {
  return mode === 'on' || mode === 'idleOn' || mode === 'scan';
}

/**
 * Pick the oscillation mode that turns the oscillation on or off
 *
 * A machine whose oscillation is paused while it stands by takes `idleOn` and `idleOff` in place of `on` and `off`, as
 * dyson-control has it. A machine that has no idle modes always takes `on` and `off`.
 *
 * @param {boolean} isOn Whether the machine is to oscillate.
 * @param {EnvironmentalCareState | undefined} state The last state read, or undefined when the machine never answered.
 * @param {readonly OscillationMode[]} modes The oscillation modes the machine takes.
 * @returns {OscillationMode} The mode to send.
 */
export function toOscillationMode(isOn: boolean, state: EnvironmentalCareState | undefined, modes: readonly OscillationMode[]): OscillationMode {
  const isIdle = state?.oscillationState === 'idle' || state?.oscillationMode === 'idleOn' || state?.oscillationMode === 'idleOff';
  if (isIdle && modes.includes('idleOn')) return isOn ? 'idleOn' : 'idleOff';
  return isOn ? 'on' : 'off';
}

/**
 * Tell whether a value of the oscillation select is an angle, rather than off or a breeze
 *
 * @param {OscillationSelectValue} value The value.
 * @returns {boolean} True for an angle in degrees.
 */
export function isOscillationSweep(value: OscillationSelectValue): value is OscillationSweep {
  return typeof value === 'number';
}

/**
 * Tell whether an angle of the oscillation fan is one a machine that tilts tilts to, rather than one a machine sweeps
 *
 * @param {OscillationFanAngle} angle The angle.
 * @returns {boolean} True for 0°, 25° and 50°, which no machine sweeps.
 */
export function isTiltFanAngle(angle: OscillationFanAngle): angle is Exclude<TiltAngle, 'breeze'> {
  return TILT_ANGLES.some((tilt) => tilt === angle);
}

/**
 * List the sweeps an oscillation select offers a machine that takes two angles
 *
 * @param {readonly number[]} widths How far apart the machine takes its two angles, in degrees, as dyson-control reports it.
 * @returns {OscillationSweep[]} The widths the select has an angle for, narrowest first. A width of 0 points the machine one way and is no sweep.
 */
export function getSweeps(widths: readonly number[]): OscillationSweep[] {
  return oscillationSelectChoices.values.filter((value): value is OscillationSweep => isOscillationSweep(value) && widths.includes(value));
}

/**
 * Work out the two angles of a sweep, centred where the machine oscillates now
 *
 * Edge cases:
 *  - no angles reported -> centred in the middle of the range
 *  - a sweep that would pass an end of the range is moved back inside it, keeping its width
 *
 * @param {OscillationSweep} sweep The width of the sweep, in degrees: one the machine takes, which fits its range.
 * @param {OscillationAngles | null} current The angles the machine oscillates between now.
 * @param {OscillationAngles} range The widest angles the machine takes.
 * @returns {OscillationAngles} The two angles, within the range and the width of the sweep apart.
 */
export function getSweepAngles(sweep: OscillationSweep, current: OscillationAngles | null, range: OscillationAngles): OscillationAngles {
  const { lowerInDegrees: min, upperInDegrees: max } = range;
  const centre = current === null ? (min + max) / 2 : (current.lowerInDegrees + current.upperInDegrees) / 2;
  const lower = Math.round(Math.min(Math.max(centre - sweep / 2, min), max - sweep));
  return { lowerInDegrees: lower, upperInDegrees: lower + sweep };
}

/**
 * Find the sweep a machine that takes two angles oscillates through
 *
 * @param {OscillationAngles | null} angles The angles the machine oscillates between.
 * @param {readonly OscillationSelectValue[]} offered The values of its oscillation select.
 * @returns {OscillationSweep | undefined} The sweep whose width the angles are, or undefined when the select lists none such.
 */
export function getSweep(angles: OscillationAngles | null, offered: readonly OscillationSelectValue[]): OscillationSweep | undefined {
  if (angles === null) return undefined;
  const width = angles.upperInDegrees - angles.lowerInDegrees;
  return offered.find((value): value is OscillationSweep => value === width);
}

/**
 * Clamp a heating setpoint to what a heater takes
 *
 * Edge cases:
 *  - not a finite number -> the default of 21 °C
 *  - clamps to 1..37 °C and rounds to the whole degree
 *
 * @param {number} temperatureInC The requested setpoint in °C.
 * @returns {number} The setpoint the heater takes, in °C.
 */
export function clampHeatTarget(temperatureInC: number): number {
  if (!Number.isFinite(temperatureInC)) return defaultHeatTargetInC;
  return Math.min(Math.max(Math.round(temperatureInC), heatTargetRange.min), heatTargetRange.max);
}

/**
 * Find the target humidity of the humidity select nearest a target the machine holds
 *
 * Edge cases:
 *  - a target between two of them -> the nearer one, the higher one at an equal distance
 *  - clamps to 30..70 %
 *
 * @param {number} percent The target the machine holds, in percent.
 * @returns {HumidityTarget} The nearest target the select lists.
 */
export function getNearestHumidityTarget(percent: number): HumidityTarget {
  let nearest: HumidityTarget = humidityTargets[0];
  for (const target of humidityTargets) {
    if (Math.abs(target - percent) <= Math.abs(nearest - percent)) nearest = target;
  }
  return nearest;
}

/** The life of a new filter of a machine of the first generation, in hours, which it counts down from. */
const firstGenerationFilterLifeInHours = 4300;

/** The life left, in percent, at or below which a filter is about to need replacing. */
export const filterWarningInPercent = 10;

/**
 * Convert the life left in the filter of a machine of the first generation to a percent
 *
 * @param {number} hours The hours left, from 4300 when new.
 * @returns {number} The percent left, rounded and clamped to 0..100.
 */
export function filterHoursToPercent(hours: number): number {
  return toFilterCondition((hours / firstGenerationFilterLifeInHours) * 100);
}

/**
 * Convert the life left in a filter, as a machine reports it, to the condition Matter shows
 *
 * @param {number} percent The life left, in percent.
 * @returns {number} The percent rounded, and clamped to 0..100.
 */
export function toFilterCondition(percent: number): number {
  return Math.min(Math.max(Math.round(percent), 0), 100);
}

/**
 * Tell whether a filter needs replacing, from the life left in it
 *
 * @param {number} percent The life left, in percent.
 * @returns {ResourceMonitoring.ChangeIndication} Critical when none is left, a warning at 10 % or less, and fine otherwise.
 */
export function getFilterChangeIndication(percent: number): ResourceMonitoring.ChangeIndication {
  if (percent <= 0) return ResourceMonitoring.ChangeIndication.Critical;
  return percent <= filterWarningInPercent ? ResourceMonitoring.ChangeIndication.Warning : ResourceMonitoring.ChangeIndication.Ok;
}

/**
 * Convert a temperature to the Matter encoding
 *
 * @param {number} temperatureInC The temperature in °C.
 * @returns {number} The temperature in °C * 100, rounded.
 */
export function toMatterTemperature(temperatureInC: number): number {
  return Math.round(temperatureInC * 100);
}

/**
 * Convert a humidity to the Matter encoding
 *
 * @param {number} humidityInPercent The relative humidity in percent.
 * @returns {number} The humidity in percent * 100, rounded.
 */
export function toMatterHumidity(humidityInPercent: number): number {
  return Math.round(humidityInPercent * 100);
}

/** The pollutant indices of a machine, which each say how clean the air is on one scale. */
const pollutantIndices = ['pm25Index', 'pm10Index', 'volatileOrganicCompoundsIndex', 'nitrogenDioxideIndex', 'formaldehydeIndex', 'carbonDioxideIndex'] as const;

/**
 * Convert a Dyson index to the Matter air quality
 *
 * Dyson has six bands, from good to severe, and Matter six from good to extremely poor: the bands are taken in order.
 *
 * Edge cases:
 *  - under 4 good, under 7 fair, under 9 moderate, under 11 poor, under 13 very poor, else extremely poor
 *
 * @param {number} index The index, 0..15.
 * @returns {AirQuality.AirQualityEnum} The air quality.
 */
export function indexToAirQuality(index: number): AirQuality.AirQualityEnum {
  if (index < 4) return AirQuality.AirQualityEnum.Good;
  if (index < 7) return AirQuality.AirQualityEnum.Fair;
  if (index < 9) return AirQuality.AirQualityEnum.Moderate;
  if (index < 11) return AirQuality.AirQualityEnum.Poor;
  if (index < 13) return AirQuality.AirQualityEnum.VeryPoor;
  return AirQuality.AirQualityEnum.ExtremelyPoor;
}

/**
 * Work out the air quality of a machine's readings
 *
 * The air is as clean as its worst pollutant, as the MyDyson app shows it.
 *
 * Edge cases:
 *  - no index reported -> unknown
 *
 * @param {EnvironmentalCareSensors} sensors The readings of the machine.
 * @returns {AirQuality.AirQualityEnum} The air quality of the highest index.
 */
export function getAirQuality(sensors: EnvironmentalCareSensors): AirQuality.AirQualityEnum {
  const indices = pollutantIndices.map((key) => sensors[key]).filter((index): index is number => index !== null);
  return indices.length === 0 ? AirQuality.AirQualityEnum.Unknown : indexToAirQuality(Math.max(...indices));
}

/**
 * Convert a Dyson index to the level of a Matter concentration measurement that has no numeric value
 *
 * Edge cases:
 *  - no index -> unknown
 *  - under 4 low, under 7 medium, under 11 high, else critical
 *
 * @param {number | null} index The index, 0..15.
 * @returns {ConcentrationMeasurement.LevelValue} The level.
 */
export function indexToLevel(index: number | null): ConcentrationMeasurement.LevelValue {
  if (index === null) return ConcentrationMeasurement.LevelValue.Unknown;
  if (index < 4) return ConcentrationMeasurement.LevelValue.Low;
  if (index < 7) return ConcentrationMeasurement.LevelValue.Medium;
  if (index < 11) return ConcentrationMeasurement.LevelValue.High;
  return ConcentrationMeasurement.LevelValue.Critical;
}

/**
 * Compose the name of an extra endpoint of a device
 *
 * Edge cases:
 *  - a result longer than 32 characters, the longest Matter node label, has its base name cut short, never its suffix
 *
 * @param {string} baseName The device name.
 * @param {string} suffix What the endpoint is, such as `Night Mode`.
 * @returns {string} The base name, a space and the suffix.
 */
export function composeDeviceName(baseName: string, suffix: string): string {
  const room = maxDeviceNameLength - suffix.length - 1;
  return `${baseName.slice(0, Math.max(room, 1)).trimEnd()} ${suffix}`;
}
