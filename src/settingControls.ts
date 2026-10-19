/**
 * @file src/settingControls.ts
 * @description This file contains the switches and the mode selects for the controls of a machine that have no place in Matter beside them, such as its child lock or its UV light.
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
  AIR_QUALITY_TARGETS,
  type AirQualityTarget,
  type EnvironmentalCareCapabilities,
  type EnvironmentalCareControl,
  type EnvironmentalCareState,
  WICK_DRYING_SPEEDS,
  type WickDryingSpeed,
} from 'dyson-control';
import type { ModeSelect } from 'matterbridge/matter/clusters';

import type { SettingControlKey } from './config.js';
import { type SelectChoices, toModeOptions, waterHardnessSelectChoices } from './mapping.js';

/** What tells the endpoint of a setting control apart, and what it is called. */
interface SettingControlName {
  /** What tells it apart in the endpoint id, such as `child-lock`. */
  key: string;
  /** What tells it apart in the serial number, after a dash: one letter. */
  code: string;
  /** What it is, such as `Child Lock`. */
  label: string;
}

/** A setting control that is an on/off switch. */
export interface SettingSwitch extends SettingControlName {
  kind: 'switch';
  isAvailable: (capabilities: EnvironmentalCareCapabilities) => boolean;
  /** Whether the switch is on, or null when the machine does not say. */
  read: (state: EnvironmentalCareState) => boolean | null;
  write: (isOn: boolean) => EnvironmentalCareControl;
}

/** A setting control that is a mode select, each mode the place of its value among the choices. */
export interface SettingSelect extends SettingControlName {
  kind: 'select';
  isAvailable: (capabilities: EnvironmentalCareCapabilities) => boolean;
  /** One mode for each value the machine takes. */
  modeOptions: (capabilities: EnvironmentalCareCapabilities) => ModeSelect.ModeOption[];
  /** The mode of the value the machine holds, or undefined when it holds none it takes. */
  readMode: (state: EnvironmentalCareState, capabilities: EnvironmentalCareCapabilities) => number | undefined;
  /** The fields to send for a mode of the select: Matter refuses any other. */
  writeMode: (mode: number) => EnvironmentalCareControl;
}

export type SettingControl = SettingSwitch | SettingSelect;

/**
 * Define a setting control that is a mode select
 *
 * @param {SettingControlName} name What tells the select apart, and what it is called.
 * @param {SelectChoices<T>} choices Every value the select can pick from.
 * @param {(capabilities: EnvironmentalCareCapabilities) => readonly T[]} values The values a machine takes.
 * @param {(state: EnvironmentalCareState) => T | null} read The value the machine holds.
 * @param {(value: T) => EnvironmentalCareControl} write The fields to send for a value.
 * @returns {SettingSelect} The select.
 */
function defineSelect<T extends string>(
  name: SettingControlName,
  choices: SelectChoices<T>,
  values: (capabilities: EnvironmentalCareCapabilities) => readonly T[],
  read: (state: EnvironmentalCareState) => T | null,
  write: (value: T) => EnvironmentalCareControl,
): SettingSelect {
  return {
    ...name,
    kind: 'select',
    isAvailable: (capabilities) => values(capabilities).length > 0,
    modeOptions: (capabilities) => toModeOptions(choices, values(capabilities)),
    readMode: (state, capabilities) => {
      const value = read(state);
      return value !== null && values(capabilities).includes(value) ? choices.values.indexOf(value) : undefined;
    },
    writeMode: (mode) => write(choices.values[mode]),
  };
}

const airQualityTargetChoices: SelectChoices<AirQualityTarget> = {
  values: AIR_QUALITY_TARGETS,
  labels: { good: 'Good', sensitive: 'Sensitive', verySensitive: 'Very Sensitive' },
};

const wickDryingSpeedChoices: SelectChoices<WickDryingSpeed> = {
  values: WICK_DRYING_SPEEDS,
  labels: { slow: 'Slow', normal: 'Normal', fast: 'Fast' },
};

/**
 * Each setting control, by the setting that adds it
 *
 * The code of each is a letter no other endpoint of a device has.
 */
export const settingControls: Readonly<Record<SettingControlKey, SettingControl>> = {
  hasChildLockSwitch: {
    kind: 'switch',
    key: 'child-lock',
    code: 'K',
    label: 'Child Lock',
    isAvailable: (capabilities) => capabilities.childLockMode,
    read: (state) => state.childLockMode,
    write: (isOn) => ({ childLockMode: isOn }),
  },
  hasUvLightSwitch: {
    kind: 'switch',
    key: 'uv-light',
    code: 'V',
    label: 'UV Light',
    isAvailable: (capabilities) => capabilities.uvMode,
    read: (state) => state.uvMode,
    write: (isOn) => ({ uvMode: isOn }),
  },
  hasIoniserSwitch: {
    kind: 'switch',
    key: 'ioniser',
    code: 'I',
    label: 'Ioniser',
    isAvailable: (capabilities) => capabilities.ionisationMode,
    read: (state) => state.ionisationMode,
    write: (isOn) => ({ ionisationMode: isOn }),
  },
  hasJetFocusSwitch: {
    kind: 'switch',
    key: 'jet-focus',
    code: 'J',
    label: 'Jet Focus',
    isAvailable: (capabilities) => capabilities.focusDiffuses.length > 1,
    read: (state) => (state.focusDiffuse === null ? null : state.focusDiffuse === 'focus'),
    write: (isOn) => ({ focusDiffuse: isOn ? 'focus' : 'diffuse' }),
  },
  hasIndirectAirflowSwitch: {
    kind: 'switch',
    key: 'indirect-airflow',
    code: 'Z',
    label: 'Indirect Airflow',
    isAvailable: (capabilities) => capabilities.nozzleAngles.length > 1,
    read: (state) => (state.nozzleAngle === null ? null : state.nozzleAngle === 'indirect'),
    write: (isOn) => ({ nozzleAngle: isOn ? 'indirect' : 'direct' }),
  },
  hasAirQualityTargetSelect: defineSelect(
    { key: 'air-quality-target', code: 'Y', label: 'Air Quality Target' },
    airQualityTargetChoices,
    (capabilities) => capabilities.airQualityTargets,
    (state) => state.airQualityTarget,
    (airQualityTarget) => ({ airQualityTarget }),
  ),
  hasWickDryingSwitch: {
    kind: 'switch',
    key: 'wick-drying',
    code: 'B',
    label: 'Wick Drying',
    isAvailable: (capabilities) => capabilities.wickDryingMode,
    read: (state) => state.wickDryingMode,
    write: (isOn) => ({ wickDryingMode: isOn }),
  },
  hasWickDryingSpeedSelect: defineSelect(
    { key: 'wick-drying-speed', code: 'M', label: 'Wick Drying Speed' },
    wickDryingSpeedChoices,
    (capabilities) => capabilities.wickDryingSpeeds,
    (state) => state.wickDryingSpeed,
    (wickDryingSpeed) => ({ wickDryingSpeed }),
  ),
  hasWaterHardnessSelect: defineSelect(
    { key: 'water-hardness-select', code: 'D', label: 'Water Hardness' },
    waterHardnessSelectChoices,
    (capabilities) => capabilities.waterHardnesses,
    (state) => state.waterHardness,
    (waterHardness) => ({ waterHardness }),
  ),
};
