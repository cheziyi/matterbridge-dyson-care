/**
 * @file src/platform/machineSync.ts
 * @description This file contains what the machine list of the account changes about the stored devices.
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

import type { DysonMachine } from 'dyson-control';
import type { AnsiLogger } from 'matterbridge/logger';

import { type DysonDeviceConfig, hasSameMachine } from '../config.js';

/**
 * Work out what the machine list of the account changes about a stored device
 *
 * A device is matched by the serial number of its machine, and takes the variant, the firmware, the room name and the
 * password of its broker on the LAN the cloud reports for it now. It keeps its own name: the room name is that of the
 * MyDyson app, which several machines can share. It keeps its host too, which the setup page gives.
 *
 * Edge cases:
 *  - a machine of another type than the stored one -> undefined, with a warning: its state is held another way
 *  - a machine moved to the broker no client connects to -> undefined, with a warning
 *
 * @param {DysonDeviceConfig} stored The stored device.
 * @param {readonly DysonMachine[]} machines The machines of the account.
 * @param {AnsiLogger} log The logger.
 * @returns {DysonDeviceConfig | undefined} The updated device, or undefined when the account does not list its machine or nothing changed.
 */
export function getMachineUpdate(stored: DysonDeviceConfig, machines: readonly DysonMachine[], log: AnsiLogger): DysonDeviceConfig | undefined {
  const match = machines.find((machine) => machine.serialNumber === stored.serialNumber);
  if (match === undefined) return undefined;
  if (match.type !== stored.type) {
    log.warn(`The cloud now reports "${stored.name}" as a machine of type ${match.type} instead of ${stored.type}: remove the device and add it again`);
    return undefined;
  }
  if (match.remoteBrokerType === 'rabbitMq') {
    log.warn(`"${stored.name}" moved to a cloud broker the plugin cannot connect to`);
    return undefined;
  }
  // A field the cloud no longer reports is left out, as it is from a machine stored without it.
  const updated: DysonDeviceConfig = {
    ...stored,
    roomName: match.name,
    variant: match.variant,
    mqttRootTopicLevel: match.mqttRootTopicLevel,
    model: match.model,
    productName: match.productName,
    firmwareVersion: match.firmwareVersion,
    firmwareCapabilities: match.firmwareCapabilities === undefined ? undefined : [...match.firmwareCapabilities],
    apPasswordHash: match.apPasswordHash,
  };
  return hasSameMachine(stored, updated) && stored.roomName === updated.roomName ? undefined : updated;
}
