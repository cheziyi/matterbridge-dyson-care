/**
 * @file src/controls.ts
 * @description This file contains what the capabilities of a machine let its device have in Matter: its controls, its switches and its sensors.
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

import type { EnvironmentalCareCapabilities, EnvironmentalCareSensors, TiltAngle } from 'dyson-control';

import type { DysonDeviceConfig } from './config.js';
import { getSweeps, type OscillationSelectValue } from './mapping.js';

/** The angles an oscillation select offers besides off. */
export type OscillationAngleChoice = Exclude<OscillationSelectValue, 'off'>;

/** The controls and the switches a device can have in Matter, given what its machine takes: what the setup page offers. */
export interface AvailableControls {
  /** Whether the machine picks the fan speed itself in its auto mode. */
  hasAutoMode: boolean;
  /** Whether apps can turn the oscillation on and off: for a machine that tilts, its breeze. */
  hasOscillation: boolean;
  /** The angles an oscillation select can offer, narrowest first: the preset angles of the machine, or the sweeps of one that takes two angles. Empty when it can have no oscillation select, as a machine that tilts. */
  oscillationAngles: OscillationAngleChoice[];
  /** The angles the select of a machine that tilts offers, with its breeze, or none for a machine that does not tilt. */
  tiltAngles: TiltAngle[];
  /** Whether the machine turns to follow the people it finds. */
  hasFindAndFollow: boolean;
  /** Whether apps can turn the air the machine blows to the front or the back. */
  hasAirflowDirection: boolean;
  /** Whether the machine heats, with a setpoint. */
  hasHeat: boolean;
  /** Whether the machine humidifies, with a target humidity. */
  hasHumidification: boolean;
  /** Whether the machine picks the target humidity itself in an auto mode. */
  hasAutoHumidification: boolean;
  /** Whether the machine runs a clean cycle, which it asks for as often as the hardness of its water says. */
  hasWaterHardness: boolean;
  /** Whether the machine reports the life left in its filters. */
  hasFilterLife: boolean;
  /** Whether the machine can keep measuring the air while it is off. */
  hasContinuousMonitoring: boolean;
  /** Whether the machine measures the air, and so reports pollutants. */
  hasAirQualitySensor: boolean;
}

/**
 * List the angles an oscillation select can offer a machine
 *
 * @param {EnvironmentalCareCapabilities} capabilities What the machine takes.
 * @returns {OscillationAngleChoice[]} Its preset angles and a breeze, or the sweeps of one that takes two angles, or none.
 */
export function getOscillationAngles(capabilities: EnvironmentalCareCapabilities): OscillationAngleChoice[] {
  if (capabilities.oscillationAngles !== null) return getSweeps(capabilities.oscillationAngleWidthsInDegrees);
  return capabilities.oscillationPresetAnglesInDegrees.filter((angle): angle is OscillationAngleChoice => angle !== 'custom');
}

/**
 * List the controls and the switches a device can have in Matter
 *
 * The setup page offers what is listed here, so that it never offers what `fitToCapabilities` drops.
 *
 * @param {EnvironmentalCareCapabilities} capabilities What the machine takes.
 * @returns {AvailableControls} What the device can have.
 */
export function getAvailableControls(capabilities: EnvironmentalCareCapabilities): AvailableControls {
  const isTilt = capabilities.oscillation === 'tilt';
  const hasOscillation = isTilt ? capabilities.tiltAnglesInDegrees.includes('breeze') : capabilities.oscillation !== 'none';
  return {
    hasAutoMode: capabilities.autoMode,
    hasOscillation,
    oscillationAngles: hasOscillation && !isTilt ? getOscillationAngles(capabilities) : [],
    tiltAngles: [...capabilities.tiltAnglesInDegrees],
    hasFindAndFollow: capabilities.findAndFollowModes.includes('on'),
    hasAirflowDirection: capabilities.fanAirDirections.length > 1,
    hasHeat: capabilities.heatModes.includes('heat'),
    hasHumidification: capabilities.humidificationModes.includes('humidify'),
    hasAutoHumidification: capabilities.humidificationModes.includes('humidify') && capabilities.autoHumidification,
    hasWaterHardness: capabilities.waterHardnesses.length > 0,
    hasFilterLife: capabilities.filters.length > 0,
    hasContinuousMonitoring: capabilities.continuousMonitoring,
    hasAirQualitySensor: capabilities.hasAirQualitySensor,
  };
}

/**
 * Drop the settings a machine has no use for
 *
 * @param {DysonDeviceConfig} device The device.
 * @param {EnvironmentalCareCapabilities} capabilities What its machine takes.
 * @returns {DysonDeviceConfig} The device, with the controls of what the machine lacks hidden, an auto mode it lacks back to the native fan mode, and an oscillation select without angles to choose a switch.
 */
export function fitToCapabilities(device: DysonDeviceConfig, capabilities: EnvironmentalCareCapabilities): DysonDeviceConfig {
  const controls = getAvailableControls(capabilities);
  let { oscillationControl } = device;
  if (!controls.hasOscillation) oscillationControl = 'hidden';
  else if (oscillationControl === 'select' && controls.oscillationAngles.length === 0 && controls.tiltAngles.length === 0) oscillationControl = 'switch';
  return {
    ...device,
    fanAutoControl: controls.hasAutoMode ? device.fanAutoControl : 'native',
    oscillationControl,
    airflowDirectionControl: controls.hasAirflowDirection ? device.airflowDirectionControl : 'hidden',
    heatControl: controls.hasHeat ? device.heatControl : 'hidden',
    humidificationControl: controls.hasHumidification ? device.humidificationControl : 'hidden',
    findAndFollowControl: controls.hasFindAndFollow ? device.findAndFollowControl : 'hidden',
    hasWaterHardnessSelect: controls.hasWaterHardness && device.hasWaterHardnessSelect,
    hasContinuousMonitoringSwitch: controls.hasContinuousMonitoring && device.hasContinuousMonitoringSwitch,
    hasAirQualitySensor: controls.hasAirQualitySensor && device.hasAirQualitySensor,
  };
}

/**
 * Tell whether two readings of what a machine takes lead to the same Matter endpoints and the same commands
 *
 * Every field counts: the same angles on an oscillation select are sent as two angles to a machine that takes any
 * two, and as a preset to one that does not.
 *
 * @param {EnvironmentalCareCapabilities} left One reading.
 * @param {EnvironmentalCareCapabilities} right The other reading.
 * @returns {boolean} True when the two readings are the same.
 */
export function hasSameControls(left: EnvironmentalCareCapabilities, right: EnvironmentalCareCapabilities): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * The readings a machine has given at least once
 *
 * A machine does not say which readings it has, beyond whether it measures the air at all, so one counts from the
 * first time it is given. It then has its place in Matter for good, and shows no value while the machine gives none.
 */
export interface ReportedSensors {
  temperature: boolean;
  humidity: boolean;
  /** Whether the machine has given the index of a pollutant, which the air quality is worked out from. */
  airQuality: boolean;
  /** A concentration, in μg/m³. */
  pm25: boolean;
  /** A concentration, in μg/m³. */
  pm10: boolean;
  /** An index alone, which Matter shows as a level. */
  volatileOrganicCompounds: boolean;
  /** An index alone, which Matter shows as a level. */
  nitrogenDioxide: boolean;
  /** A concentration, in μg/m³. */
  formaldehyde: boolean;
  /** A concentration, in parts per million. */
  carbonDioxide: boolean;
}

/** Every reading of `ReportedSensors`. */
export const REPORTED_SENSORS = [
  'temperature',
  'humidity',
  'airQuality',
  'pm25',
  'pm10',
  'volatileOrganicCompounds',
  'nitrogenDioxide',
  'formaldehyde',
  'carbonDioxide',
] as const satisfies readonly (keyof ReportedSensors)[];

export const noReportedSensors: Readonly<ReportedSensors> = {
  temperature: false,
  humidity: false,
  airQuality: false,
  pm25: false,
  pm10: false,
  volatileOrganicCompounds: false,
  nitrogenDioxide: false,
  formaldehyde: false,
  carbonDioxide: false,
};

/**
 * Tell which readings a set of sensors gives
 *
 * @param {EnvironmentalCareSensors} sensors What the machine reads now.
 * @returns {ReportedSensors} Each reading that has a value.
 */
function getGivenSensors(sensors: EnvironmentalCareSensors): ReportedSensors {
  const indices = [
    sensors.pm25Index,
    sensors.pm10Index,
    sensors.volatileOrganicCompoundsIndex,
    sensors.nitrogenDioxideIndex,
    sensors.formaldehydeIndex,
    sensors.carbonDioxideIndex,
  ];
  return {
    temperature: sensors.temperatureInC !== null,
    humidity: sensors.humidityInPercent !== null,
    airQuality: indices.some((index) => index !== null),
    pm25: sensors.pm25InUgPerM3 !== null,
    pm10: sensors.pm10InUgPerM3 !== null,
    volatileOrganicCompounds: sensors.volatileOrganicCompoundsIndex !== null,
    nitrogenDioxide: sensors.nitrogenDioxideIndex !== null,
    formaldehyde: sensors.formaldehydeInUgPerM3 !== null,
    carbonDioxide: sensors.carbonDioxideInPpm !== null,
  };
}

/**
 * Add the readings a machine just gave to the ones it is known to give
 *
 * @param {ReportedSensors} known The readings the machine gave before.
 * @param {EnvironmentalCareSensors} sensors What the machine reads now.
 * @returns {ReportedSensors} `known` itself when the machine gave nothing new, so that a caller can tell by comparing the two.
 */
export function addReportedSensors(known: ReportedSensors, sensors: EnvironmentalCareSensors): ReportedSensors {
  const given = getGivenSensors(sensors);
  if (REPORTED_SENSORS.every((key) => known[key] || !given[key])) return known;
  const merged: ReportedSensors = { ...known };
  for (const key of REPORTED_SENSORS) merged[key] = known[key] || given[key];
  return merged;
}
