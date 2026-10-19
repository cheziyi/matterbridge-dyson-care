/**
 * @file src/platform/sensorStore.ts
 * @description This file contains the readings each machine has given, kept between restarts.
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

import { isValidBoolean, isValidObject } from 'matterbridge/utils';
import type { NodeStorage } from 'node-persist-manager';

import type { DysonDeviceConfig } from '../config.js';
import { noReportedSensors, REPORTED_SENSORS, type ReportedSensors } from '../controls.js';

/** The device whose machine is described: only its serial number is read. */
type StoredMachine = Pick<DysonDeviceConfig, 'serialNumber'>;

/**
 * Read a stored value as the readings a machine has given
 *
 * Edge cases:
 *  - a reading that is missing, such as one a later version added, counts as not given
 *
 * @param {unknown} value The stored value.
 * @returns {ReportedSensors | undefined} The readings, or undefined when the value is not an object.
 */
function parseReportedSensors(value: unknown): ReportedSensors | undefined {
  if (!isValidObject(value)) return undefined;
  const stored: Record<string, unknown> = { ...value };
  const sensors: ReportedSensors = { ...noReportedSensors };
  for (const key of REPORTED_SENSORS) {
    const flag = stored[key];
    sensors[key] = isValidBoolean(flag) && flag;
  }
  return sensors;
}

/**
 * Get the key the readings a machine has given are stored under
 *
 * They are kept under the serial number, so that a new name keeps what is known about the machine.
 *
 * @param {StoredMachine} device The device.
 * @returns {string} The storage key.
 */
function getKey(device: StoredMachine): string {
  return `sensors:${device.serialNumber}`;
}

/** Which readings each machine has given, kept between restarts so that a device starts with a place for each of them. */
export class SensorStore {
  private readonly getStorage: () => NodeStorage | undefined;

  /**
   * Create the store
   *
   * @param {() => NodeStorage | undefined} getStorage Gets the platform storage, which is not there until the platform is ready.
   */
  constructor(getStorage: () => NodeStorage | undefined) {
    this.getStorage = getStorage;
  }

  /**
   * Read which readings a machine has given
   *
   * @param {StoredMachine} device The device.
   * @returns {Promise<ReportedSensors | undefined>} The stored readings, or undefined when none are stored or they cannot be read.
   */
  async read(device: StoredMachine): Promise<ReportedSensors | undefined> {
    return parseReportedSensors(await this.getStorage()?.get(getKey(device)));
  }

  /**
   * Store which readings a machine has given
   *
   * @param {StoredMachine} device The device.
   * @param {ReportedSensors} sensors The readings its machine has given.
   * @returns {Promise<void>} Resolves when the readings are stored.
   */
  async write(device: StoredMachine, sensors: ReportedSensors): Promise<void> {
    await this.getStorage()?.set(getKey(device), sensors);
  }

  /**
   * Forget what is known about a machine
   *
   * @param {StoredMachine} device The device.
   * @returns {Promise<void>} Resolves when its readings are removed.
   */
  async remove(device: StoredMachine): Promise<void> {
    await this.getStorage()?.remove(getKey(device));
  }
}
