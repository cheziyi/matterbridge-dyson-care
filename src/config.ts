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
 * How the oscillation is exposed to Matter: natively, as the left and right rocking of the fan control, or as an on/off
 * switch or a mode select of the angles the machine sweeps in place of the rocking. Unlike the other places on the fan
 * control, the rocking does not stay beside a switch: Apple Home mishandles it. The oscillation of a machine that tilts
 * is its breeze, which rocks it up and down, and its select picks the angle it tilts to.
 */
export const OSCILLATION_CONTROLS = ['native', 'switch', 'select'] as const;

export type OscillationControlOption = (typeof OSCILLATION_CONTROLS)[number];

/** How the night mode is exposed to Matter: natively, as the sleep wind of the fan control, alone or with an on/off switch beside it for apps that show no sleep wind. */
export const NIGHT_MODE_CONTROLS = ['native', 'switch'] as const;

export type NightModeControlOption = (typeof NIGHT_MODE_CONTROLS)[number];

/** How the direction the machine blows its air is exposed to Matter: natively, as the airflow direction of the fan control, alone or with an on/off switch beside it for apps that show no airflow direction. */
export const AIRFLOW_DIRECTION_CONTROLS = ['native', 'switch'] as const;

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

/**
 * The settings that each add one switch or one mode select for a control of the machine that has no place in Matter
 * beside it: see `settingControls.ts`. A machine without the control has none, whatever is stored.
 */
export const SETTING_CONTROLS = [
  'hasChildLockSwitch',
  'hasUvLightSwitch',
  'hasIoniserSwitch',
  'hasJetFocusSwitch',
  'hasIndirectAirflowSwitch',
  'hasAirQualityTargetSelect',
  'hasWickDryingSwitch',
  'hasWickDryingSpeedSelect',
  'hasWaterHardnessSelect',
] as const;

export type SettingControlKey = (typeof SETTING_CONTROLS)[number];

/** How the find and follow of a machine that turns to the people it finds is exposed to Matter: as an on/off switch, as a mode select of off, follow and scan, or not at all. */
export const FIND_AND_FOLLOW_CONTROLS = ['switch', 'select', 'hidden'] as const;

export type FindAndFollowControlOption = (typeof FIND_AND_FOLLOW_CONTROLS)[number];

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
  findAndFollowControl: FindAndFollowControlOption;
  /** Whether the buttons of the machine get a switch that locks them. */
  hasChildLockSwitch: boolean;
  /** Whether the UV light that cleans the air gets a switch. */
  hasUvLightSwitch: boolean;
  hasIoniserSwitch: boolean;
  /** Whether the jet focus of a machine that focuses its air or diffuses it gets a switch: on focuses it. */
  hasJetFocusSwitch: boolean;
  /** Whether the nozzle of a machine that tilts it to 45° gets a switch: on blows the air indirectly. */
  hasIndirectAirflowSwitch: boolean;
  /** Whether the air quality the auto mode of a machine of the first generation aims for gets a mode select. */
  hasAirQualityTargetSelect: boolean;
  /** Whether the drying of the wick of a humidifier gets a switch. */
  hasWickDryingSwitch: boolean;
  /** Whether the speed the wick dries at gets a mode select. */
  hasWickDryingSpeedSelect: boolean;
  /** Whether the water hardness of a humidifier that runs a clean cycle gets a mode select, which sets how often it asks for one. */
  hasWaterHardnessSelect: boolean;
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
   * name of the MyDyson app, which several machines can share, and a new room name there does not change it.
   */
  name: string;
  /**
   * The room name of the machine in the MyDyson app, as the machine list of the account reports it now. The setup page
   * shows it to tell the machine apart, and Matter never sees it.
   */
  roomName?: string;
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
  /**
   * The host name or IPv4 address the machine is reached at on the LAN, given in the setup page for a network where its
   * own name does not resolve. Left out, it is `<serialNumber>.local`: see `getLanHost`.
   */
  host?: string;
  /** The password of the machine's own broker on the LAN, as the machine list of the account reports it. The setup page never sees it. */
  apPasswordHash?: string;
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
  'findAndFollowControl',
  ...SETTING_CONTROLS,
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

const serialNumberPattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;
const countryPattern = /^[A-Z]{2}$/;
// Dot-separated labels of letters, digits and inner dashes, which an IPv4 address is too.
const hostPattern = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const maxFieldLength = 128;
const maxPasswordLength = 256;

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
 * Normalize the host a machine is reached at on the LAN
 *
 * @param {unknown} value The value to normalize.
 * @returns {string | undefined} The trimmed host name or IPv4 address, or undefined when it is empty or not one.
 */
export function normalizeHost(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const host = value.trim();
  return hostPattern.test(host) ? host : undefined;
}

/**
 * Tell where a stored machine is reached on the LAN
 *
 * Its own broker there takes the password the machine list of the account reports, so a machine stored without it is
 * reached through the cloud alone until the list is read again.
 *
 * @param {DysonDeviceConfig} device The stored device.
 * @returns {string | undefined} The host given in the setup page, else `<serialNumber>.local`, the name the machine gives itself over mDNS. Undefined without the password.
 */
export function getLanHost(device: DysonDeviceConfig): string | undefined {
  if (device.apPasswordHash === undefined) return undefined;
  return device.host ?? `${device.serialNumber}.local`;
}

/**
 * Copy a machine or a device without the password of its broker on the LAN, which the setup page never sees
 *
 * @param {T} value The machine or the device.
 * @returns {Omit<T, 'apPasswordHash'>} A copy without `apPasswordHash`.
 */
export function withoutLanPassword<T extends { apPasswordHash?: string }>(value: T): Omit<T, 'apPasswordHash'> {
  const copy = { ...value };
  delete copy.apPasswordHash;
  return copy;
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
 *  - a host that is stored but not valid is dropped and reported: the machine is reached at its own name
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
    findAndFollowControl: pick('findAndFollowControl', FIND_AND_FOLLOW_CONTROLS, fallback.findAndFollowControl),
    hasChildLockSwitch: flag('hasChildLockSwitch', fallback.hasChildLockSwitch),
    hasUvLightSwitch: flag('hasUvLightSwitch', fallback.hasUvLightSwitch),
    hasIoniserSwitch: flag('hasIoniserSwitch', fallback.hasIoniserSwitch),
    hasJetFocusSwitch: flag('hasJetFocusSwitch', fallback.hasJetFocusSwitch),
    hasIndirectAirflowSwitch: flag('hasIndirectAirflowSwitch', fallback.hasIndirectAirflowSwitch),
    hasAirQualityTargetSelect: flag('hasAirQualityTargetSelect', fallback.hasAirQualityTargetSelect),
    hasWickDryingSwitch: flag('hasWickDryingSwitch', fallback.hasWickDryingSwitch),
    hasWickDryingSpeedSelect: flag('hasWickDryingSpeedSelect', fallback.hasWickDryingSpeedSelect),
    hasWaterHardnessSelect: flag('hasWaterHardnessSelect', fallback.hasWaterHardnessSelect),
    hasContinuousMonitoringSwitch: flag('hasContinuousMonitoringSwitch', fallback.hasContinuousMonitoringSwitch),
    hasAirQualitySensor: flag('hasAirQualitySensor', fallback.hasAirQualitySensor),
    hasTemperatureSensor: flag('hasTemperatureSensor', fallback.hasTemperatureSensor),
    hasHumiditySensor: flag('hasHumiditySensor', fallback.hasHumiditySensor),
    isComposed: flag('isComposed', fallback.isComposed),
  };
  for (const key of ['roomName', 'variant', 'mqttRootTopicLevel', 'model', 'productName', 'firmwareVersion'] as const) {
    const text = parseOptionalText(raw[key]);
    if (text !== undefined) device[key] = text;
  }
  if (Array.isArray(raw.firmwareCapabilities)) device.firmwareCapabilities = raw.firmwareCapabilities.filter((capability) => isValidString(capability, 1, maxFieldLength));
  const host = normalizeHost(raw.host);
  if (host !== undefined) device.host = host;
  else if (raw.host !== undefined) report?.(`"${name}" has the host ${JSON.stringify(raw.host)}, which is not valid: it is reached at ${raw.serialNumber}.local instead`);
  if (isValidString(raw.apPasswordHash, 1, maxPasswordLength)) device.apPasswordHash = raw.apPasswordHash;
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
  if (config.apPasswordHash !== undefined) machine.apPasswordHash = config.apPasswordHash;
  return machine;
}

/**
 * Tell whether two stored devices are the same machine as the cloud reports it
 *
 * @param {DysonDeviceConfig} left One device.
 * @param {DysonDeviceConfig} right The other device.
 * @returns {boolean} True when every field the client is built from is the same, the names aside.
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
    (left.firmwareCapabilities ?? []).join() === (right.firmwareCapabilities ?? []).join() &&
    left.host === right.host &&
    left.apPasswordHash === right.apPasswordHash
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
