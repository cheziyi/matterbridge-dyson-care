/**
 * @file src/accessory/matterState.ts
 * @description This file contains the reads and the writes of the state of one machine on its Matter endpoints.
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

import type { EnvironmentalCareSensors, EnvironmentalCareState } from 'dyson-control';
import type { MatterbridgeEndpoint } from 'matterbridge';
import { FanControl, ModeSelect, OnOff, RelativeHumidityMeasurement, TemperatureMeasurement, Thermostat } from 'matterbridge/matter/clusters';
import { isValidNumber } from 'matterbridge/utils';

import {
  clampHeatTarget,
  type FanPosition,
  fanStepToPercent,
  filterHoursToPercent,
  findAndFollowSelectChoices,
  getAirQuality,
  getFilterChangeIndication,
  getNearestHumidityTarget,
  getSweep,
  humiditySelectChoices,
  type HumiditySelectValue,
  indexToLevel,
  isOscillating,
  oscillationSelectChoices,
  type OscillationSelectValue,
  percentToFanStep,
  type SelectChoices,
  tiltSelectChoices,
  toFilterCondition,
  toMatterHumidity,
  toMatterTemperature,
  waterHardnessSelectChoices,
} from '../mapping.js';
import type { AccessoryLayout } from './layout.js';

/** The Matter endpoints that stand for one machine. */
export interface AccessoryEndpoints {
  /** The air purifier or the fan. */
  readonly endpoint: MatterbridgeEndpoint;
  readonly fanAutoSwitch: MatterbridgeEndpoint | undefined;
  readonly oscillationSwitch: MatterbridgeEndpoint | undefined;
  readonly oscillationSelect: MatterbridgeEndpoint | undefined;
  readonly tiltSelect: MatterbridgeEndpoint | undefined;
  readonly findAndFollowSwitch: MatterbridgeEndpoint | undefined;
  readonly findAndFollowSelect: MatterbridgeEndpoint | undefined;
  readonly waterHardnessSelect: MatterbridgeEndpoint | undefined;
  readonly nightModeSwitch: MatterbridgeEndpoint | undefined;
  readonly airflowDirectionSwitch: MatterbridgeEndpoint | undefined;
  readonly thermostat: MatterbridgeEndpoint | undefined;
  readonly heatSwitch: MatterbridgeEndpoint | undefined;
  readonly humidifySwitch: MatterbridgeEndpoint | undefined;
  readonly autoHumidifySwitch: MatterbridgeEndpoint | undefined;
  readonly humiditySelect: MatterbridgeEndpoint | undefined;
  readonly continuousMonitoringSwitch: MatterbridgeEndpoint | undefined;
  readonly airQualitySensor: MatterbridgeEndpoint | undefined;
  readonly temperatureSensor: MatterbridgeEndpoint | undefined;
  readonly humiditySensor: MatterbridgeEndpoint | undefined;
}

/** What a controller set on the fan control: off, or a place on its scale. */
export type FanRequest = 'off' | FanPosition;

/**
 * Read what a controller set on the fan control
 *
 * @param {MatterbridgeEndpoint} endpoint The main endpoint.
 * @param {readonly FanPosition[]} fanPositions The places on the scale of the fan control, from its first step.
 * @returns {FanRequest | undefined} Off, the auto mode or a fan speed, or undefined when the fan control holds none of them.
 */
export function readFanRequest(endpoint: MatterbridgeEndpoint, fanPositions: readonly FanPosition[]): FanRequest | undefined {
  const fanMode: unknown = endpoint.getAttribute(FanControl, 'fanMode');
  const percent: unknown = endpoint.getAttribute(FanControl, 'percentSetting');
  // Matter refuses the fan mode Auto on a fan control without it, so a machine that reaches here has an auto mode.
  if (fanMode === FanControl.FanMode.Auto) return 'auto';
  if (fanMode === FanControl.FanMode.Off || percent === 0) return 'off';
  if (!isValidNumber(percent, 1, 100)) return undefined;
  return fanPositions[percentToFanStep(fanPositions.length, percent) - 1];
}

/**
 * Write the power, the auto mode and the fan speed of a machine to its fan control
 *
 * Edge cases:
 *  - a machine that is on without a speed, and not in its auto mode, has nothing written
 *
 * @param {MatterbridgeEndpoint} endpoint The main endpoint.
 * @param {AccessoryLayout} layout How the controls of the device are laid out.
 * @param {EnvironmentalCareState} state The state of the machine.
 * @returns {Promise<void>} Resolves when the fan control is written.
 */
async function applyFan(endpoint: MatterbridgeEndpoint, layout: AccessoryLayout, state: EnvironmentalCareState): Promise<void> {
  const isAuto = state.autoMode === true;
  if (state.fanPower && isAuto && layout.hasFanAuto) {
    await endpoint.updateAttribute(FanControl, 'fanMode', FanControl.FanMode.Auto);
    return;
  }
  let percent = 0;
  let step = 0;
  if (state.fanPower) {
    const position: FanPosition | null = isAuto && layout.hasFanAutoStep ? 'auto' : state.fanSpeed;
    step = position === null ? 0 : layout.fanPositions.indexOf(position) + 1;
    if (step === 0) return;
    percent = fanStepToPercent(layout.fanPositions.length, step);
  }
  // Writing the percent makes the fan control server derive the fan mode and the speed setting.
  await endpoint.updateAttribute(FanControl, 'percentSetting', percent);
  await endpoint.updateAttribute(FanControl, 'percentCurrent', percent);
  if (layout.hasFanSteps) await endpoint.updateAttribute(FanControl, 'speedCurrent', step);
}

/**
 * Tell whether a machine oscillates: for a machine that tilts, whether it breezes
 *
 * @param {AccessoryLayout} layout How the controls of the device are laid out.
 * @param {EnvironmentalCareState} state The state of the machine.
 * @returns {boolean} True while it oscillates.
 */
function isMachineOscillating(layout: AccessoryLayout, state: EnvironmentalCareState): boolean {
  return layout.isTilt ? state.tiltAngleInDegrees === 'breeze' : isOscillating(state.oscillationMode);
}

/**
 * Write the controls of a machine that are features of its fan control
 *
 * @param {MatterbridgeEndpoint} endpoint The main endpoint.
 * @param {AccessoryLayout} layout How the controls of the device are laid out.
 * @param {EnvironmentalCareState} state The state of the machine.
 * @returns {Promise<void>} Resolves when the features are written.
 */
async function applyFanFeatures(endpoint: MatterbridgeEndpoint, layout: AccessoryLayout, state: EnvironmentalCareState): Promise<void> {
  if (layout.hasRocking) {
    const isOn = isMachineOscillating(layout, state);
    await endpoint.updateAttribute('FanControl', 'rockSetting', { rockLeftRight: isOn && !layout.isTilt, rockUpDown: isOn && layout.isTilt, rockRound: false });
  }
  if (layout.hasSleepWind) await endpoint.updateAttribute('FanControl', 'windSetting', { sleepWind: state.nightMode === true, naturalWind: false });
  if (layout.hasAirflowDirection && state.fanAirDirection !== null) {
    const direction = state.fanAirDirection === 'forward' ? FanControl.AirflowDirection.Forward : FanControl.AirflowDirection.Reverse;
    await endpoint.updateAttribute('FanControl', 'airflowDirection', direction);
  }
}

/**
 * Write the life left in one filter to its filter monitoring
 *
 * Edge cases:
 *  - a life the machine does not report leaves the condition as it was
 *  - a filter type of `none` is a filter that is not fitted
 *
 * @param {MatterbridgeEndpoint} endpoint The main endpoint.
 * @param {string} cluster The filter monitoring of the filter.
 * @param {number | null} percent The life left in the filter, in percent.
 * @param {string | null} type The type of the filter the machine reports.
 * @returns {Promise<void>} Resolves when the filter monitoring is written.
 */
async function applyFilter(
  endpoint: MatterbridgeEndpoint,
  cluster: 'HepaFilterMonitoring' | 'ActivatedCarbonFilterMonitoring',
  percent: number | null,
  type: string | null,
): Promise<void> {
  if (percent !== null) {
    const condition = toFilterCondition(percent);
    await endpoint.updateAttribute(cluster, 'condition', condition);
    await endpoint.updateAttribute(cluster, 'changeIndication', getFilterChangeIndication(condition));
  }
  if (type !== null) await endpoint.updateAttribute(cluster, 'inPlaceIndicator', type !== 'none');
}

/**
 * Write the life left in the filters of a machine to the filter monitoring of its air purifier
 *
 * The HEPA filter is the outer filter, or the one filter of a machine of the first generation, and the activated carbon
 * filter the inner one.
 *
 * @param {MatterbridgeEndpoint} endpoint The main endpoint.
 * @param {AccessoryLayout} layout How the controls of the device are laid out.
 * @param {EnvironmentalCareState} state The state of the machine.
 * @returns {Promise<void>} Resolves when the filters are written.
 */
async function applyFilters(endpoint: MatterbridgeEndpoint, layout: AccessoryLayout, state: EnvironmentalCareState): Promise<void> {
  if (layout.hasHepaFilter) {
    const hours = state.filterLifeInHours;
    await applyFilter(endpoint, 'HepaFilterMonitoring', state.outerFilterLifeInPercent ?? (hours === null ? null : filterHoursToPercent(hours)), state.outerFilterType);
  }
  if (layout.hasCarbonFilter) await applyFilter(endpoint, 'ActivatedCarbonFilterMonitoring', state.innerFilterLifeInPercent, state.innerFilterType);
}

/**
 * Write the heating of a heater to its thermostat
 *
 * The thermostat heats while the machine is on with its heating on, and is off otherwise.
 *
 * @param {MatterbridgeEndpoint} endpoint The thermostat.
 * @param {EnvironmentalCareState} state The state of the machine.
 * @param {number | null} roomTemperatureInC The room temperature, when the machine gives it.
 * @returns {Promise<void>} Resolves when the thermostat is written.
 */
async function applyThermostat(endpoint: MatterbridgeEndpoint, state: EnvironmentalCareState, roomTemperatureInC: number | null): Promise<void> {
  const isHeating = state.fanPower && state.heatMode === 'heat';
  await endpoint.updateAttribute(Thermostat, 'systemMode', isHeating ? Thermostat.SystemMode.Heat : Thermostat.SystemMode.Off);
  const target = state.targetTemperatureInC === null ? null : clampHeatTarget(state.targetTemperatureInC);
  if (target !== null) await endpoint.updateAttribute(Thermostat, 'occupiedHeatingSetpoint', toMatterTemperature(target));
  // The machine does not say whether its heater runs, so it counts as running while the room is below the setpoint.
  const isBelowTarget = roomTemperatureInC === null || target === null || roomTemperatureInC < target;
  await endpoint.updateAttribute(Thermostat, 'thermostatRunningState', {
    heat: isHeating && isBelowTarget,
    cool: false,
    fan: false,
    heatStage2: false,
    coolStage2: false,
    fanStage2: false,
    fanStage3: false,
  });
}

/**
 * Write a value of the machine to one of its mode selects
 *
 * Edge cases:
 *  - a value the select does not list, or none, is not written: Matter refuses it
 *
 * @param {MatterbridgeEndpoint | undefined} endpoint The mode select, or undefined when the device has none.
 * @param {SelectChoices<T>} choices The values the select picks from.
 * @param {readonly T[]} supported The values the select lists.
 * @param {T | undefined} value The value of the machine.
 * @returns {Promise<void>} Resolves when the mode select is written.
 */
async function applySelect<T extends string | number>(
  endpoint: MatterbridgeEndpoint | undefined,
  choices: SelectChoices<T>,
  supported: readonly T[],
  value: T | undefined,
): Promise<void> {
  if (endpoint !== undefined && value !== undefined && supported.includes(value)) await endpoint.updateAttribute(ModeSelect, 'currentMode', choices.values.indexOf(value));
}

/**
 * Work out what the oscillation select shows
 *
 * @param {AccessoryLayout} layout How the controls of the device are laid out.
 * @param {EnvironmentalCareState} state The state of the machine.
 * @returns {OscillationSelectValue | undefined} Off, the angle the machine sweeps, or undefined when it sweeps angles the select does not list.
 */
function getOscillationSelectValue(layout: AccessoryLayout, state: EnvironmentalCareState): OscillationSelectValue | undefined {
  if (!isOscillating(state.oscillationMode)) return 'off';
  if (layout.isSweepSelect) return getSweep(state.oscillationAngles, layout.oscillationSelectValues);
  const angle = state.oscillationPresetAngleInDegrees;
  return angle === null || angle === 'custom' ? undefined : angle;
}

/**
 * Work out what the humidity select shows
 *
 * @param {EnvironmentalCareState} state The state of the machine.
 * @returns {HumiditySelectValue | undefined} Off, auto or the nearest target, or undefined when the machine holds no target.
 */
function getHumiditySelectValue(state: EnvironmentalCareState): HumiditySelectValue | undefined {
  if (!state.fanPower || state.humidificationMode !== 'humidify') return 'off';
  if (state.autoHumidification === true) return 'auto';
  const target = state.manualHumidificationTargetInPercent;
  return target === null ? undefined : getNearestHumidityTarget(target);
}

/**
 * Write a switch, when the device has it
 *
 * @param {MatterbridgeEndpoint | undefined} endpoint The switch, or undefined when the device has none.
 * @param {boolean} isOn Whether it is on.
 * @returns {Promise<void>} Resolves when the switch is written.
 */
async function applySwitch(endpoint: MatterbridgeEndpoint | undefined, isOn: boolean): Promise<void> {
  await endpoint?.updateAttribute(OnOff, 'onOff', isOn);
}

/**
 * Write the readings of a machine to the Matter endpoints of its device
 *
 * A reading the machine does not give is written as no value, never left at what it was.
 *
 * @param {AccessoryEndpoints} endpoints The endpoints of the device.
 * @param {AccessoryLayout} layout How the controls of the device are laid out.
 * @param {EnvironmentalCareSensors} sensors The readings of the machine.
 * @returns {Promise<void>} Resolves when every reading is written.
 */
export async function applySensors(endpoints: AccessoryEndpoints, layout: AccessoryLayout, sensors: EnvironmentalCareSensors): Promise<void> {
  const temperature = sensors.temperatureInC === null ? null : toMatterTemperature(sensors.temperatureInC);
  if (endpoints.thermostat !== undefined) {
    await endpoints.thermostat.updateAttribute('Thermostat', 'externalMeasuredIndoorTemperature', temperature);
    await endpoints.thermostat.updateAttribute(Thermostat, 'localTemperature', temperature);
  }
  await endpoints.temperatureSensor?.updateAttribute(TemperatureMeasurement, 'measuredValue', temperature);
  const humidity = sensors.humidityInPercent === null ? null : toMatterHumidity(sensors.humidityInPercent);
  await endpoints.humiditySensor?.updateAttribute(RelativeHumidityMeasurement, 'measuredValue', humidity);
  const sensor = endpoints.airQualitySensor;
  if (sensor === undefined) return;
  const { pollutants } = layout;
  await sensor.updateAttribute('AirQuality', 'airQuality', getAirQuality(sensors));
  if (pollutants.pm25) await sensor.updateAttribute('Pm25ConcentrationMeasurement', 'measuredValue', sensors.pm25InUgPerM3);
  if (pollutants.pm10) await sensor.updateAttribute('Pm10ConcentrationMeasurement', 'measuredValue', sensors.pm10InUgPerM3);
  if (pollutants.volatileOrganicCompounds) {
    await sensor.updateAttribute('TotalVolatileOrganicCompoundsConcentrationMeasurement', 'levelValue', indexToLevel(sensors.volatileOrganicCompoundsIndex));
  }
  if (pollutants.nitrogenDioxide) await sensor.updateAttribute('NitrogenDioxideConcentrationMeasurement', 'levelValue', indexToLevel(sensors.nitrogenDioxideIndex));
  if (pollutants.formaldehyde) await sensor.updateAttribute('FormaldehydeConcentrationMeasurement', 'measuredValue', sensors.formaldehydeInUgPerM3);
  if (pollutants.carbonDioxide) await sensor.updateAttribute('CarbonDioxideConcentrationMeasurement', 'measuredValue', sensors.carbonDioxideInPpm);
}

/**
 * Write the state of a machine to the Matter endpoints of its device
 *
 * @param {AccessoryEndpoints} endpoints The endpoints of the device.
 * @param {AccessoryLayout} layout How the controls of the device are laid out.
 * @param {EnvironmentalCareState} state The state of the machine.
 * @param {number | null} roomTemperatureInC The room temperature of the last readings, for the thermostat to tell whether it heats.
 * @returns {Promise<void>} Resolves when every endpoint is written.
 */
export async function applyState(endpoints: AccessoryEndpoints, layout: AccessoryLayout, state: EnvironmentalCareState, roomTemperatureInC: number | null): Promise<void> {
  const { endpoint } = endpoints;
  await endpoint.updateAttribute(OnOff, 'onOff', state.fanPower);
  await applyFan(endpoint, layout, state);
  await applyFanFeatures(endpoint, layout, state);
  await applyFilters(endpoint, layout, state);
  await applySwitch(endpoints.fanAutoSwitch, state.autoMode === true);
  await applySwitch(endpoints.oscillationSwitch, isMachineOscillating(layout, state));
  await applySwitch(endpoints.findAndFollowSwitch, state.findAndFollowMode !== null && state.findAndFollowMode !== 'off');
  await applySwitch(endpoints.nightModeSwitch, state.nightMode === true);
  await applySwitch(endpoints.airflowDirectionSwitch, state.fanAirDirection === 'forward');
  // The heating and the humidifying run only while the machine is on.
  await applySwitch(endpoints.heatSwitch, state.fanPower && state.heatMode === 'heat');
  await applySwitch(endpoints.humidifySwitch, state.fanPower && state.humidificationMode === 'humidify');
  await applySwitch(endpoints.autoHumidifySwitch, state.autoHumidification === true);
  await applySwitch(endpoints.continuousMonitoringSwitch, state.continuousMonitoring === true);
  if (endpoints.thermostat !== undefined) await applyThermostat(endpoints.thermostat, state, roomTemperatureInC);
  await applySelect(endpoints.oscillationSelect, oscillationSelectChoices, layout.oscillationSelectValues, getOscillationSelectValue(layout, state));
  await applySelect(endpoints.humiditySelect, humiditySelectChoices, layout.humiditySelectValues, getHumiditySelectValue(state));
  await applySelect(endpoints.tiltSelect, tiltSelectChoices, layout.tiltSelectValues, state.tiltAngleInDegrees ?? undefined);
  await applySelect(endpoints.findAndFollowSelect, findAndFollowSelectChoices, layout.findAndFollowSelectValues, state.findAndFollowMode ?? undefined);
  await applySelect(endpoints.waterHardnessSelect, waterHardnessSelectChoices, layout.waterHardnessSelectValues, state.waterHardness ?? undefined);
}
