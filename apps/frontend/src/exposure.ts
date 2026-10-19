/**
 * @file apps/frontend/src/exposure.ts
 * @description How a device appears in Matter: the choices a draft starts with, and those a machine has a use for.
 * @author Calvin Che
 * @license Apache-2.0
 */

import type { AvailableControls, Exposure, Machine, ReportedSensors, StoredDevice } from './api.js';
import { type Draft, view } from './state.js';

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
    hasContinuousMonitoringSwitch,
    hasAirQualitySensor,
    hasTemperatureSensor,
    hasHumiditySensor,
    isComposed,
  };
}

/**
 * Drop the choices a machine has no use for, as `fitToCapabilities` in the plugin does: the controls of what it lacks
 * are not shown, and an oscillation select without angles to pick from is a switch.
 */
export function fitExposure(exposure: Exposure, controls: AvailableControls): Exposure {
  const fitted = pickExposure(exposure);
  if (!controls.hasAutoMode) fitted.fanAutoControl = 'native';
  if (!controls.hasOscillation) fitted.oscillationControl = 'hidden';
  else if (fitted.oscillationControl === 'select' && controls.oscillationAngles.length === 0) fitted.oscillationControl = 'switch';
  if (!controls.hasAirflowDirection) fitted.airflowDirectionControl = 'hidden';
  if (!controls.hasHeat) fitted.heatControl = 'hidden';
  if (!controls.hasHumidification) fitted.humidificationControl = 'hidden';
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
 * The drafts of machines picked in the Find step, each named after its room in the Dyson app. Machines in one room
 * share its name, so each draft gets one no stored device and no draft before it has.
 */
export function draftsFromMachines(machines: readonly Machine[]): Draft[] {
  const taken = new Set((view.setup?.devices ?? []).map((device) => device.name));
  return machines.map((machine) => {
    const name = uniqueName(machine.name ?? '', taken);
    taken.add(name);
    return { machine, name, isNew: true, ...pickExposure(defaultExposure) };
  });
}

export function draftFromStored(device: StoredDevice): Draft {
  const { capabilities, controls, reportedSensors, name, serialNumber, type, variant, mqttRootTopicLevel, model, productName, firmwareVersion, firmwareCapabilities } = device;
  const machine: Machine = { serialNumber, type, category: 'environmentalCare', name, variant, mqttRootTopicLevel, model, productName, firmwareVersion, firmwareCapabilities };
  return { machine, name, isNew: false, capabilities, controls, reportedSensors, ...pickExposure(device) };
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
  hasAirflowDirection: false,
  hasHeat: false,
  hasHumidification: false,
  hasAutoHumidification: false,
  hasContinuousMonitoring: false,
  hasAirQualitySensor: false,
};
