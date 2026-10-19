/**
 * @file src/accessory/layout.ts
 * @description This file contains how the controls of one machine are laid out in Matter.
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

import type { EnvironmentalCareCapabilities, FindAndFollowMode, TiltAngle, WaterHardness } from 'dyson-control';

import type { DeviceTypeOption, DysonDeviceConfig } from '../config.js';
import { getAvailableControls, type ReportedSensors } from '../controls.js';
import { type FanPosition, fanSteps, type HumiditySelectValue, humidityTargets, type OscillationSelectValue } from '../mapping.js';

/** The pollutants an air quality sensor shows, each once the machine has given it. */
export interface PollutantLayout {
  pm25: boolean;
  pm10: boolean;
  volatileOrganicCompounds: boolean;
  nitrogenDioxide: boolean;
  formaldehyde: boolean;
  carbonDioxide: boolean;
}

/** How the controls of a device are laid out in Matter, worked out once from what its machine takes and how it is configured. */
export interface AccessoryLayout {
  deviceType: DeviceTypeOption;
  /** The places on the scale of the fan control, from its first step: the ten speeds, with `auto` below or above them when it is a step. */
  fanPositions: FanPosition[];
  /** Whether the fan control offers its speeds as steps, besides the percent. */
  hasFanSteps: boolean;
  /** Whether the fan control has the Matter fan mode Auto: the machine has an auto mode, and it is no step. */
  hasFanAuto: boolean;
  /** Whether the auto mode is a step of the fan control. */
  hasFanAutoStep: boolean;
  hasFanAutoSwitch: boolean;
  /** Whether the oscillation is the rocking of the fan control: left and right, or up and down for a machine that tilts. */
  hasRocking: boolean;
  /** Whether the machine tilts, so that its oscillation is its breeze, which tilts it up and down. */
  isTilt: boolean;
  hasOscillationSwitch: boolean;
  /** Off and the angles the oscillation select picks from, or none when the device has no oscillation select. */
  oscillationSelectValues: readonly OscillationSelectValue[];
  /** Whether the angles of the oscillation select are sweeps written as two angles, for a machine that takes two angles. */
  isSweepSelect: boolean;
  /** The angles and the breeze the tilt select picks from, or none when the device has no tilt select. */
  tiltSelectValues: readonly TiltAngle[];
  hasFindAndFollowSwitch: boolean;
  /** Off, follow and scan on the find and follow select, or none when the device has no find and follow select. */
  findAndFollowSelectValues: readonly FindAndFollowMode[];
  /** The hardnesses the water hardness select picks from, or none when the device has no water hardness select. */
  waterHardnessSelectValues: readonly WaterHardness[];
  /** Whether the air purifier shows the life left in its HEPA filter: the outer filter, or the one filter of a machine of the first generation. */
  hasHepaFilter: boolean;
  /** Whether the air purifier shows the life left in its activated carbon filter: the inner filter. */
  hasCarbonFilter: boolean;
  /** Whether the night mode is the sleep wind of the fan control. */
  hasSleepWind: boolean;
  hasNightModeSwitch: boolean;
  /** Whether the direction of the air is the airflow direction of the fan control. */
  hasAirflowDirection: boolean;
  hasAirflowDirectionSwitch: boolean;
  hasThermostat: boolean;
  hasHeatSwitch: boolean;
  hasHumidifySwitch: boolean;
  hasAutoHumidifySwitch: boolean;
  /** Off, auto and the targets the humidity select picks from, or none when the device has no humidity select. */
  humiditySelectValues: readonly HumiditySelectValue[];
  hasContinuousMonitoringSwitch: boolean;
  /** Whether the device has an air quality sensor: the machine measures the air, has given an index, and one is asked for. */
  hasAirQualitySensor: boolean;
  /** The pollutants on the air quality sensor. */
  pollutants: PollutantLayout;
  hasTemperatureSensor: boolean;
  hasHumiditySensor: boolean;
  /** Whether the other endpoints of the device are parts of the main one, instead of devices of their own. */
  isComposed: boolean;
}

/**
 * Work out how the controls of a device are laid out in Matter
 *
 * @param {DysonDeviceConfig} config The device.
 * @param {EnvironmentalCareCapabilities} capabilities What its machine takes.
 * @param {ReportedSensors} reportedSensors The readings its machine has given.
 * @returns {AccessoryLayout} The layout.
 */
export function getAccessoryLayout(config: DysonDeviceConfig, capabilities: EnvironmentalCareCapabilities, reportedSensors: ReportedSensors): AccessoryLayout {
  const controls = getAvailableControls(capabilities);
  const hasAutoStep = controls.hasAutoMode && (config.fanAutoControl === 'firstStep' || config.fanAutoControl === 'lastStep');
  let fanPositions: FanPosition[] = [...fanSteps];
  if (hasAutoStep) fanPositions = config.fanAutoControl === 'firstStep' ? ['auto', ...fanSteps] : [...fanSteps, 'auto'];
  const oscillation = controls.hasOscillation ? config.oscillationControl : 'hidden';
  const isTilt = controls.tiltAngles.length > 0;
  const hasOscillationSelect = oscillation === 'select' && controls.oscillationAngles.length > 0;
  const hasTiltSelect = oscillation === 'select' && isTilt;
  const findAndFollow = controls.hasFindAndFollow ? config.findAndFollowControl : 'hidden';
  // Matter has filters on an air purifier alone, where an app that does not show them leaves them out: they need no choice.
  const hasFilters = controls.hasFilterLife && config.deviceType === 'airPurifier';
  const airflow = controls.hasAirflowDirection ? config.airflowDirectionControl : 'hidden';
  const heat = controls.hasHeat ? config.heatControl : 'hidden';
  const humidification = controls.hasHumidification ? config.humidificationControl : 'hidden';
  const hasAirQualitySensor = controls.hasAirQualitySensor && config.hasAirQualitySensor && reportedSensors.airQuality;
  return {
    deviceType: config.deviceType,
    fanPositions,
    hasFanSteps: config.fanControl === 'steps',
    // A step takes the place of the fan mode Auto, which holds no percent: the two cannot show at once. A switch is an endpoint of its own beside it.
    hasFanAuto: controls.hasAutoMode && !hasAutoStep,
    hasFanAutoStep: hasAutoStep,
    hasFanAutoSwitch: controls.hasAutoMode && config.fanAutoControl === 'switch',
    hasRocking: oscillation === 'native',
    isTilt,
    // An oscillation select without angles to pick from would be a switch, so it is one.
    hasOscillationSwitch: oscillation === 'switch' || (oscillation === 'select' && !hasOscillationSelect && !hasTiltSelect),
    oscillationSelectValues: hasOscillationSelect ? ['off', ...controls.oscillationAngles] : [],
    isSweepSelect: hasOscillationSelect && capabilities.oscillationAngles !== null,
    tiltSelectValues: hasTiltSelect ? controls.tiltAngles : [],
    hasFindAndFollowSwitch: findAndFollow === 'switch',
    findAndFollowSelectValues: findAndFollow === 'select' ? capabilities.findAndFollowModes : [],
    waterHardnessSelectValues: controls.hasWaterHardness && config.hasWaterHardnessSelect ? capabilities.waterHardnesses : [],
    hasHepaFilter: hasFilters && (capabilities.filters.includes('outerFilter') || capabilities.filters.includes('filter')),
    hasCarbonFilter: hasFilters && capabilities.filters.includes('innerFilter'),
    hasSleepWind: config.nightModeControl === 'native',
    hasNightModeSwitch: config.nightModeControl === 'switch',
    hasAirflowDirection: airflow === 'native',
    hasAirflowDirectionSwitch: airflow === 'switch',
    hasThermostat: heat === 'thermostat',
    hasHeatSwitch: heat === 'switch',
    hasHumidifySwitch: humidification === 'switches',
    hasAutoHumidifySwitch: humidification === 'switches' && controls.hasAutoHumidification,
    humiditySelectValues: humidification === 'select' ? ['off', ...(controls.hasAutoHumidification ? (['auto'] as const) : []), ...humidityTargets] : [],
    hasContinuousMonitoringSwitch: controls.hasContinuousMonitoring && config.hasContinuousMonitoringSwitch,
    hasAirQualitySensor,
    pollutants: {
      pm25: hasAirQualitySensor && reportedSensors.pm25,
      pm10: hasAirQualitySensor && reportedSensors.pm10,
      volatileOrganicCompounds: hasAirQualitySensor && reportedSensors.volatileOrganicCompounds,
      nitrogenDioxide: hasAirQualitySensor && reportedSensors.nitrogenDioxide,
      formaldehyde: hasAirQualitySensor && reportedSensors.formaldehyde,
      carbonDioxide: hasAirQualitySensor && reportedSensors.carbonDioxide,
    },
    hasTemperatureSensor: config.hasTemperatureSensor && reportedSensors.temperature,
    hasHumiditySensor: config.hasHumiditySensor && reportedSensors.humidity,
    isComposed: config.isComposed,
  };
}
