/**
 * @file src/config.ts
 * @description This file contains the plugin configuration model and its validation.
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

import type { DysonAccount, DysonMachine } from 'dyson-control';
import type { BasePlatformConfig } from 'matterbridge';
import { isValidBoolean, isValidNumber, isValidObject, isValidString } from 'matterbridge/utils';

/** What the machine is in Matter: an air purifier, or a fan. Both carry its fan control. */
export const DEVICE_TYPES = ['airPurifier', 'fan'] as const;

export type DeviceTypeOption = (typeof DEVICE_TYPES)[number];

/** How the fan speed is exposed to Matter: as steps, or as a percentage alone. */
export const FAN_CONTROLS = ['steps', 'percent'] as const;

export type FanControlOption = (typeof FAN_CONTROLS)[number];

/**
 * How the auto mode is exposed to Matter: natively, as the fan mode Auto of the fan control, as an on/off switch beside
 * that fan mode, or as a step of the fan control below the slowest speed or above the fastest, in place of the fan
 * mode. Each but the native fan mode alone is for apps that show no fan mode Auto.
 */
export const FAN_AUTO_CONTROLS = ['native', 'switch', 'firstStep', 'lastStep'] as const;

export type FanAutoControlOption = (typeof FAN_AUTO_CONTROLS)[number];

/**
 * How the oscillation is exposed to Matter: natively, as the left and right rocking of the fan control, as an on/off
 * switch, as a mode select of the angles the machine sweeps, or not at all.
 */
export const OSCILLATION_CONTROLS = ['native', 'switch', 'select', 'hidden'] as const;

export type OscillationControlOption = (typeof OSCILLATION_CONTROLS)[number];

/** How the night mode is exposed to Matter: natively, as the sleep wind of the fan control, as an on/off switch, or not at all. */
export const NIGHT_MODE_CONTROLS = ['native', 'switch', 'hidden'] as const;

export type NightModeControlOption = (typeof NIGHT_MODE_CONTROLS)[number];

/** How the direction the machine blows its air is exposed to Matter: natively, as the airflow direction of the fan control, as an on/off switch, or not at all. */
export const AIRFLOW_DIRECTION_CONTROLS = ['native', 'switch', 'hidden'] as const;

export type AirflowDirectionControlOption = (typeof AIRFLOW_DIRECTION_CONTROLS)[number];

/** How the heating of a heater is exposed to Matter: as a thermostat that heats, as an on/off switch, or not at all. */
export const HEAT_CONTROLS = ['thermostat', 'switch', 'hidden'] as const;

export type HeatControlOption = (typeof HEAT_CONTROLS)[number];

/**
 * How the humidifying of a humidifier is exposed to Matter: as on/off switches for the humidifying and for its auto
 * mode, as one mode select of off, auto and the target humidities, or not at all.
 */
export const HUMIDIFICATION_CONTROLS = ['switches', 'select', 'hidden'] as const;

export type HumidificationControlOption = (typeof HUMIDIFICATION_CONTROLS)[number];

export const defaultPollIntervalInSeconds = 30;
export const minPollIntervalInSeconds = 10;
export const maxPollIntervalInSeconds = 3600;

/** The longest device name accepted, which is also the longest Matter node label. */
export const maxDeviceNameLength = 32;

/** How a device appears in Matter: what it is, its controls, its switches and its sensors. */
export interface DysonDeviceExposure {
  deviceType: DeviceTypeOption;
  fanControl: FanControlOption;
  /** How the auto mode is exposed: see `FAN_AUTO_CONTROLS`. */
  fanAutoControl: FanAutoControlOption;
  oscillationControl: OscillationControlOption;
  nightModeControl: NightModeControlOption;
  airflowDirectionControl: AirflowDirectionControlOption;
  heatControl: HeatControlOption;
  humidificationControl: HumidificationControlOption;
  /** Whether the continuous monitoring, the measuring of the air while the machine is off, gets an on/off switch. */
  hasContinuousMonitoringSwitch: boolean;
  /** Whether Matter gets an air quality sensor, with each pollutant the machine gives a reading of. */
  hasAirQualitySensor: boolean;
  /** Whether Matter gets a temperature sensor, once the machine gives the room temperature. */
  hasTemperatureSensor: boolean;
  /** Whether Matter gets a humidity sensor, once the machine gives the room humidity. */
  hasHumiditySensor: boolean;
  /**
   * Whether the thermostat, the switches, the mode selects and the sensors are parts of the main device in Matter,
   * instead of devices of their own: what Matter calls a composed device.
   */
  isComposed: boolean;
}

/**
 * The stored configuration of one machine.
 *
 * The device is identified by the serial number of its machine, which neither a new name nor a new firmware changes.
 * The other fields are those the cloud reports for the machine, which the client of the machine is built from.
 */
export interface DysonDeviceConfig extends DysonDeviceExposure {
  /**
   * The name of the device in Matter, given in the setup page: no two stored devices share one. It starts as the room
   * name of the Dyson app, which several machines can share, and a new room name there does not change it.
   */
  name: string;
  /** Such as `NK6-EU-MHA0000A`. It is also the serial number of the device in Matter. */
  serialNumber: string;
  /** The cloud's code for the kind of machine, such as `438`. */
  type: string;
  variant?: string;
  mqttRootTopicLevel?: string;
  model?: string;
  productName?: string;
  firmwareVersion?: string;
  firmwareCapabilities?: string[];
}

/** The account the machines are reached through, as `login` resolved with it, and the address it was logged in with. */
export interface DysonAccountConfig extends DysonAccount {
  email: string;
}

export type DysonPlatformConfig = BasePlatformConfig & {
  /** A `DysonAccountConfig`, or what another version or an edit by hand left there: see `parseAccountConfig`. */
  account?: object | string | number | boolean | null;
  /** Each a `DysonDeviceConfig`, or what another version or an edit by hand left there: see `parseDeviceConfigs`. */
  devices?: unknown[];
  pollIntervalInSeconds?: number;
  /** Counts the times the plugin itself stored the account or the devices: see `DysonPlatform.onConfigChanged`. */
  setupRevision?: number;
};

/** Every setting of `DysonDeviceExposure`. */
export const EXPOSURE_SETTINGS = [
  'deviceType',
  'fanControl',
  'fanAutoControl',
  'oscillationControl',
  'nightModeControl',
  'airflowDirectionControl',
  'heatControl',
  'humidificationControl',
  'hasContinuousMonitoringSwitch',
  'hasAirQualitySensor',
  'hasTemperatureSensor',
  'hasHumiditySensor',
  'isComposed',
] as const satisfies readonly (keyof DysonDeviceExposure)[];

/** What a stored device without a setting falls back to. A new device starts with a preset of the setup page instead. */
export const defaultExposure: Readonly<DysonDeviceExposure> = {
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

const serialNumberPattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;
const countryPattern = /^[A-Z]{2}$/;
const maxFieldLength = 128;

/**
 * Check whether a value is one of the members of a literal list
 *
 * @param {readonly T[]} members The accepted values.
 * @param {unknown} value The value to check.
 * @returns {boolean} True when the value is a member.
 */
export function isMember<T extends string>(members: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (members as readonly string[]).includes(value);
}

/**
 * Check whether a value is a serial number of a machine
 *
 * It is also the serial number in Matter, which takes 32 characters at most.
 *
 * @param {unknown} value The value to check.
 * @returns {boolean} True when the value is letters, digits and dashes, 32 at most.
 */
export function isValidSerialNumber(value: unknown): value is string {
  return typeof value === 'string' && serialNumberPattern.test(value);
}

/**
 * Normalize a device name
 *
 * @param {unknown} value The value to normalize.
 * @returns {string | undefined} The trimmed name, or undefined when it is empty or longer than 32 characters.
 */
export function normalizeDeviceName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.trim();
  return name.length > 0 && name.length <= maxDeviceNameLength ? name : undefined;
}

/**
 * Normalize the poll interval
 *
 * Edge cases:
 *  - not a finite number -> the default of 30 seconds
 *  - clamps to 10..3600 seconds
 *
 * @param {unknown} value The configured interval in seconds.
 * @returns {number} The interval in seconds.
 */
export function normalizePollInterval(value: unknown): number {
  if (!isValidNumber(value)) return defaultPollIntervalInSeconds;
  return Math.min(Math.max(Math.round(value), minPollIntervalInSeconds), maxPollIntervalInSeconds);
}

/**
 * Read an optional text field of a machine
 *
 * @param {unknown} value The stored value.
 * @returns {string | undefined} The text, or undefined when it is not a string of 1 to 128 characters.
 */
function parseOptionalText(value: unknown): string | undefined {
  return isValidString(value, 1, maxFieldLength) ? value : undefined;
}

/**
 * Parse the stored account
 *
 * Edge cases:
 *  - a field that is missing or not valid -> undefined: the account has to be signed in again
 *
 * @param {unknown} value The stored value.
 * @returns {DysonAccountConfig | undefined} The account, or undefined when there is none or it cannot be read.
 */
export function parseAccountConfig(value: unknown): DysonAccountConfig | undefined {
  if (!isValidObject(value)) return undefined;
  const raw: Record<string, unknown> = { ...value };
  const { email, accountId, token, tokenType, country, culture } = raw;
  if (!isValidString(email, 3, 254) || !isValidString(accountId, 1, maxFieldLength) || !isValidString(token, 1, 4096) || !isValidString(tokenType, 1, 32)) return undefined;
  if (typeof country !== 'string' || !countryPattern.test(country) || !isValidString(culture, 2, 16)) return undefined;
  return { email, accountId, token, tokenType, country, culture };
}

/**
 * Parse one stored device
 *
 * The setup page stores every device in full, but a device stored by an older version lacks the settings added since.
 * A device needs a name, a serial number and a type, and every other field falls back to its default.
 *
 * A setting added later follows three rules:
 *  - it is never required: a fourth required field would drop every device stored before it
 *  - its default here is what the plugin did before the setting existed, so that a stored device comes back as it was.
 *    What a new device starts with is a preset of the setup page, and may differ
 *  - renaming a value or changing what it means is not an addition: it needs a version number in the configuration,
 *    where no number stands for the shape of today
 *
 * Edge cases:
 *  - a setting that is stored but not valid falls back like one that is missing, and is reported
 *  - a firmware capability that is not a string is dropped
 *
 * @param {unknown} value The stored value.
 * @param {(message: string) => void} [report] Called once for each setting that is stored but not valid.
 * @returns {DysonDeviceConfig | undefined} The device, or undefined when one of those three is missing or not valid.
 */
export function parseDeviceConfig(value: unknown, report?: (message: string) => void): DysonDeviceConfig | undefined {
  if (!isValidObject(value)) return undefined;
  const raw: Record<string, unknown> = { ...value };
  const name = normalizeDeviceName(raw.name);
  if (name === undefined || !isValidSerialNumber(raw.serialNumber) || !isValidString(raw.type, 1, 16)) return undefined;
  const useDefault = <T>(key: keyof DysonDeviceExposure, fallback: T): T => {
    if (raw[key] !== undefined) report?.(`"${name}" has the ${key} ${JSON.stringify(raw[key])}, which is not valid: ${JSON.stringify(fallback)} is used instead`);
    return fallback;
  };
  const pick = <T extends string>(key: keyof DysonDeviceExposure, members: readonly T[], fallback: T): T => {
    const stored = raw[key];
    return isMember(members, stored) ? stored : useDefault(key, fallback);
  };
  const flag = (key: keyof DysonDeviceExposure, fallback: boolean): boolean => {
    const stored = raw[key];
    return isValidBoolean(stored) ? stored : useDefault(key, fallback);
  };
  const fallback = defaultExposure;
  const device: DysonDeviceConfig = {
    name,
    serialNumber: raw.serialNumber,
    type: raw.type,
    deviceType: pick('deviceType', DEVICE_TYPES, fallback.deviceType),
    fanControl: pick('fanControl', FAN_CONTROLS, fallback.fanControl),
    fanAutoControl: pick('fanAutoControl', FAN_AUTO_CONTROLS, fallback.fanAutoControl),
    oscillationControl: pick('oscillationControl', OSCILLATION_CONTROLS, fallback.oscillationControl),
    nightModeControl: pick('nightModeControl', NIGHT_MODE_CONTROLS, fallback.nightModeControl),
    airflowDirectionControl: pick('airflowDirectionControl', AIRFLOW_DIRECTION_CONTROLS, fallback.airflowDirectionControl),
    heatControl: pick('heatControl', HEAT_CONTROLS, fallback.heatControl),
    humidificationControl: pick('humidificationControl', HUMIDIFICATION_CONTROLS, fallback.humidificationControl),
    hasContinuousMonitoringSwitch: flag('hasContinuousMonitoringSwitch', fallback.hasContinuousMonitoringSwitch),
    hasAirQualitySensor: flag('hasAirQualitySensor', fallback.hasAirQualitySensor),
    hasTemperatureSensor: flag('hasTemperatureSensor', fallback.hasTemperatureSensor),
    hasHumiditySensor: flag('hasHumiditySensor', fallback.hasHumiditySensor),
    isComposed: flag('isComposed', fallback.isComposed),
  };
  for (const key of ['variant', 'mqttRootTopicLevel', 'model', 'productName', 'firmwareVersion'] as const) {
    const text = parseOptionalText(raw[key]);
    if (text !== undefined) device[key] = text;
  }
  if (Array.isArray(raw.firmwareCapabilities)) device.firmwareCapabilities = raw.firmwareCapabilities.filter((capability) => isValidString(capability, 1, maxFieldLength));
  return device;
}

/**
 * Parse the stored device list
 *
 * Edge cases:
 *  - not an array -> an empty list
 *  - a device that is not complete or not valid is left out and reported: `getUnreadableDevices` lists those
 *  - a second device with a name or a serial number already taken is dropped and reported
 *
 * @param {unknown} value The stored value.
 * @param {(message: string) => void} [report] Called once for each device that is left out, and for each setting that is stored but not valid.
 * @returns {DysonDeviceConfig[]} The valid devices, in their stored order.
 */
export function parseDeviceConfigs(value: unknown, report?: (message: string) => void): DysonDeviceConfig[] {
  const devices: DysonDeviceConfig[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const device = parseDeviceConfig(entry, report);
    if (device === undefined) {
      report?.(
        'A stored device has no valid name, serial number or type and is ignored. It stays in the configuration as it is until a device with its name or its serial number is added in the setup page',
      );
    } else if (devices.some((other) => other.name === device.name)) {
      report?.(`A second stored device is named "${device.name}" and is ignored: no two devices share a name`);
    } else if (devices.some((other) => other.serialNumber === device.serialNumber)) {
      report?.(`"${device.name}" has the serial number of another stored device and is ignored`);
    } else {
      devices.push(device);
    }
  }
  return devices;
}

/**
 * List the stored devices this version cannot read
 *
 * The plugin stores them again as they are, so that a version that reads them, or a correction by hand, still finds
 * them.
 *
 * Edge cases:
 *  - not an array -> an empty list
 *  - an entry with the name or the serial number of one of `devices` is left out: that device took its place
 *
 * @param {unknown} value The stored device list, or the entries kept from it.
 * @param {readonly DysonDeviceConfig[]} devices The devices that are stored now.
 * @returns {unknown[]} The entries `parseDeviceConfig` refuses, as they were stored.
 */
export function getUnreadableDevices(value: unknown, devices: readonly DysonDeviceConfig[]): unknown[] {
  const entries: unknown[] = Array.isArray(value) ? value : [];
  return entries.filter((entry) => {
    if (parseDeviceConfig(entry) !== undefined) return false;
    const raw: Record<string, unknown> = isValidObject(entry) ? { ...entry } : {};
    const name = normalizeDeviceName(raw.name);
    return !devices.some((device) => device.name === name || device.serialNumber === raw.serialNumber);
  });
}

/**
 * Convert a stored device to the machine the Dyson client takes
 *
 * @param {DysonDeviceConfig} config The stored device.
 * @returns {DysonMachine} The machine for `EnvironmentalCareClient`, without the fields that are not stored.
 */
export function toDysonMachine(config: DysonDeviceConfig): DysonMachine {
  const machine: DysonMachine = { serialNumber: config.serialNumber, type: config.type, category: 'environmentalCare', name: config.name };
  if (config.variant !== undefined) machine.variant = config.variant;
  if (config.mqttRootTopicLevel !== undefined) machine.mqttRootTopicLevel = config.mqttRootTopicLevel;
  if (config.model !== undefined) machine.model = config.model;
  if (config.productName !== undefined) machine.productName = config.productName;
  if (config.firmwareVersion !== undefined) machine.firmwareVersion = config.firmwareVersion;
  if (config.firmwareCapabilities !== undefined) machine.firmwareCapabilities = [...config.firmwareCapabilities];
  return machine;
}

/**
 * Tell whether two stored devices are the same machine as the cloud reports it
 *
 * @param {DysonDeviceConfig} left One device.
 * @param {DysonDeviceConfig} right The other device.
 * @returns {boolean} True when every field the client is built from is the same, the name aside.
 */
export function hasSameMachine(left: DysonDeviceConfig, right: DysonDeviceConfig): boolean {
  return (
    left.serialNumber === right.serialNumber &&
    left.type === right.type &&
    left.variant === right.variant &&
    left.mqttRootTopicLevel === right.mqttRootTopicLevel &&
    left.model === right.model &&
    left.productName === right.productName &&
    left.firmwareVersion === right.firmwareVersion &&
    (left.firmwareCapabilities ?? []).join() === (right.firmwareCapabilities ?? []).join()
  );
}

/**
 * Tell whether two stored devices are exposed to Matter the same way
 *
 * @param {DysonDeviceConfig} left One device.
 * @param {DysonDeviceConfig} right The other device.
 * @returns {boolean} True when both have the same name in Matter, the same controls, switches and sensors, and the same endpoints for them.
 */
export function hasSameExposure(left: DysonDeviceConfig, right: DysonDeviceConfig): boolean {
  return left.name === right.name && EXPOSURE_SETTINGS.every((key) => left[key] === right[key]);
}
