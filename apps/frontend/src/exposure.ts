/**
 * @file apps/frontend/src/exposure.ts
 * @description How a device appears in Matter: the choices a draft starts with, and those a machine has a use for.
 * @author Calvin Che
 * @license Apache-2.0
 */

import type { AvailableControls, Exposure, Machine, ReportedSensors, SettingControlKey, StoredDevice } from './api.js';
import { type Draft, view } from './state.js';

/** Each setting that adds a switch or a mode select for a control of the machine: `SETTING_CONTROLS` in the plugin. */
export const settingControlKeys: readonly SettingControlKey[] = [
  'hasChildLockSwitch',
  'hasUvLightSwitch',
  'hasIoniserSwitch',
  'hasJetFocusSwitch',
  'hasIndirectAirflowSwitch',
  'hasAirQualityTargetSelect',
  'hasWickDryingSwitch',
  'hasWickDryingSpeedSelect',
  'hasWaterHardnessSelect',
];

/** Copy the choices of how a device appears in Matter, and nothing else. */
export function pickExposure(source: Exposure): Exposure {
  const {
    deviceType,
    fanControl,
    fanAutoControl,
    oscillationControl,
    nightModeControl,
    airflowDirectionControl,
    heatControl,
    humidificationControl,
    findAndFollowControl,
    hasChildLockSwitch,
    hasUvLightSwitch,
    hasIoniserSwitch,
    hasJetFocusSwitch,
    hasIndirectAirflowSwitch,
    hasAirQualityTargetSelect,
    hasWickDryingSwitch,
    hasWickDryingSpeedSelect,
    hasWaterHardnessSelect,
    hasContinuousMonitoringSwitch,
    hasAirQualitySensor,
    hasTemperatureSensor,
    hasHumiditySensor,
    isComposed,
  } = source;
  return {
    deviceType,
    fanControl,
    fanAutoControl,
    oscillationControl,
    nightModeControl,
    airflowDirectionControl,
    heatControl,
    humidificationControl,
    findAndFollowControl,
    hasChildLockSwitch,
    hasUvLightSwitch,
    hasIoniserSwitch,
    hasJetFocusSwitch,
    hasIndirectAirflowSwitch,
    hasAirQualityTargetSelect,
    hasWickDryingSwitch,
    hasWickDryingSpeedSelect,
    hasWaterHardnessSelect,
    hasContinuousMonitoringSwitch,
    hasAirQualitySensor,
    hasTemperatureSensor,
    hasHumiditySensor,
    isComposed,
  };
}

/**
 * Drop the choices a machine has no use for, as `fitToCapabilities` in the plugin does: the controls of what it lacks
 * are not shown, and an oscillation select or fan without angles to pick from is a switch.
 */
export function fitExposure(exposure: Exposure, controls: AvailableControls): Exposure {
  const fitted = pickExposure(exposure);
  if (!controls.hasAutoMode) fitted.fanAutoControl = 'native';
  const hasNoAngle = controls.oscillationAngles.length === 0 && controls.tiltAngles.length === 0;
  if (controls.hasOscillation && fitted.oscillationControl === 'select' && hasNoAngle) fitted.oscillationControl = 'switch';
  if (controls.hasOscillation && fitted.oscillationControl === 'fan' && controls.oscillationFanAngles.length === 0) fitted.oscillationControl = 'switch';
  if (!controls.hasHeat) fitted.heatControl = 'hidden';
  if (!controls.hasHumidification) fitted.humidificationControl = 'hidden';
  if (!controls.hasFindAndFollow) fitted.findAndFollowControl = 'hidden';
  for (const key of settingControlKeys) fitted[key] &&= controls.settingControls.includes(key);
  fitted.hasContinuousMonitoringSwitch &&= controls.hasContinuousMonitoring;
  fitted.hasAirQualitySensor &&= controls.hasAirQualitySensor;
  return fitted;
}

// What a new device holds until the plugin says what its machine can do: it then takes the Apple Home preset. What a
// stored device without a setting gets is the default of `parseDeviceConfig` in the plugin, which stands for how the
// plugin behaved before that setting existed: the two may differ.
const defaultExposure: Exposure = {
  deviceType: 'airPurifier',
  fanControl: 'steps',
  fanAutoControl: 'native',
  oscillationControl: 'native',
  nightModeControl: 'native',
  airflowDirectionControl: 'native',
  heatControl: 'thermostat',
  humidificationControl: 'select',
  findAndFollowControl: 'hidden',
  hasChildLockSwitch: false,
  hasUvLightSwitch: false,
  hasIoniserSwitch: false,
  hasJetFocusSwitch: false,
  hasIndirectAirflowSwitch: false,
  hasAirQualityTargetSelect: false,
  hasWickDryingSwitch: false,
  hasWickDryingSpeedSelect: false,
  hasWaterHardnessSelect: false,
  hasContinuousMonitoringSwitch: false,
  hasAirQualitySensor: true,
  hasTemperatureSensor: true,
  hasHumiditySensor: true,
  isComposed: true,
};

/** The longest name Matter takes. */
const maxNameLength = 32;

/** A name no device has yet: the room name, or that name with a number after it, such as "Bedroom 2". */
function uniqueName(base: string, taken: ReadonlySet<string>): string {
  if (base === '' || !taken.has(base)) return base;
  for (let count = 2; ; count++) {
    const suffix = ` ${count}`;
    const name = `${base.slice(0, maxNameLength - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(name)) return name;
  }
}

/**
 * The drafts of machines picked in the Find step, each named after its room in the MyDyson app. Machines in one room
 * share its name, so each draft gets one no stored device and no draft before it has.
 */
export function draftsFromMachines(machines: readonly Machine[]): Draft[] {
  const taken = new Set((view.setup?.devices ?? []).map((device) => device.name));
  return machines.map((machine) => {
    const name = uniqueName(machine.name ?? '', taken);
    taken.add(name);
    return { machine, name, host: '', isCloudOnly: false, isNew: true, ...pickExposure(defaultExposure) };
  });
}

export function draftFromStored(device: StoredDevice): Draft {
  const {
    capabilities,
    controls,
    reportedSensors,
    name,
    roomName,
    host,
    isCloudOnly,
    serialNumber,
    type,
    variant,
    mqttRootTopicLevel,
    model,
    productName,
    firmwareVersion,
    firmwareCapabilities,
  } = device;
  // The machine is named as the MyDyson app names it, and the draft as Matter does.
  const machine: Machine = {
    serialNumber,
    type,
    category: 'environmentalCare',
    name: roomName,
    variant,
    mqttRootTopicLevel,
    model,
    productName,
    firmwareVersion,
    firmwareCapabilities,
  };
  return { machine, name, host: host ?? '', isCloudOnly: isCloudOnly ?? false, isNew: false, capabilities, controls, reportedSensors, ...pickExposure(device) };
}

// What a machine the plugin told nothing about has given: no reading.
export const noReportedSensors: ReportedSensors = {
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

// What a machine the plugin told nothing about can have: no control and no switch.
export const noControls: AvailableControls = {
  hasAutoMode: false,
  hasOscillation: false,
  oscillationAngles: [],
  tiltAngles: [],
  oscillationFanAngles: [],
  hasFindAndFollow: false,
  hasAirflowDirection: false,
  hasHeat: false,
  hasHumidification: false,
  hasAutoHumidification: false,
  settingControls: [],
  hasFilterLife: false,
  hasContinuousMonitoring: false,
  hasAirQualitySensor: false,
};
