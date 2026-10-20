/**
 * @file src/setup/probe.ts
 * @description This file contains the checks the guided setup runs on a machine before it is stored.
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

import { type DysonAccount, type DysonMachine, EnvironmentalCareClient, type EnvironmentalCareCapabilities, type EnvironmentalCareSensors } from 'dyson-control';

import { type AvailableControls, getAvailableControls, type ReportedSensors } from '../controls.js';
import { getErrorMessage, getErrorStatus, signInRequiredStatus } from '../errors.js';

/** How long, in milliseconds, a setup check waits for each of the cloud, the broker and the machine. */
export const probeTimeoutInMs = 10_000;

/** What a check of a machine found. */
export const PROBE_STATUSES = ['ready', 'signInRequired', 'unsupported', 'unreachable', 'failed'] as const;

export type ProbeStatus = (typeof PROBE_STATUSES)[number];

/** Why a machine of the account cannot be added, or `supported`. */
export const MACHINE_SUPPORTS = ['supported', 'otherCategory', 'unknownType', 'otherBroker'] as const;

export type MachineSupport = (typeof MACHINE_SUPPORTS)[number];

export interface ProbeResult {
  status: ProbeStatus;
  machine: DysonMachine;
  /** What the machine takes, when the status is `ready`. */
  capabilities?: EnvironmentalCareCapabilities;
  /** What the sensors of the machine read, when the status is `ready`: a reading it gives gets its place in Matter. */
  sensors?: EnvironmentalCareSensors;
  /** The controls and the switches its device can have in Matter, when the status is `ready`. */
  controls?: AvailableControls;
  /** Every reading the machine is known to have given, this check's and those the plugin saw before, when the status is `ready`: the setup page offers a sensor for each. */
  reportedSensors?: ReportedSensors;
  /** The words of the cloud, the broker or the machine for a failure. */
  message?: string;
  /** Whether a search of the LAN found the machine and its broker there opened, when the status is `ready`: undefined when the cloud has not given the password of its broker. */
  isFoundOnLan?: boolean;
}

/**
 * Tell whether the plugin can control a machine of the account
 *
 * The client of a machine says so from the machine alone, before it connects.
 *
 * @param {DysonMachine} machine The machine, as the cloud lists it.
 * @param {DysonAccount} account The account it is registered to.
 * @returns {MachineSupport} `supported`, or why the plugin cannot control it.
 */
export function getMachineSupport(machine: DysonMachine, account: DysonAccount): MachineSupport {
  if (machine.category !== undefined && machine.category !== 'environmentalCare') return 'otherCategory';
  if (machine.remoteBrokerType === 'rabbitMq') return 'otherBroker';
  try {
    void new EnvironmentalCareClient(machine, { account });
    return 'supported';
  } catch {
    return 'unknownType';
  }
}

/**
 * Turn a failed call into what the user has to do next
 *
 * @param {unknown} error The error the call rejected with.
 * @param {DysonMachine} machine The machine that was called.
 * @returns {ProbeResult} The status, with the words of the failure.
 */
function classifyFailure(error: unknown, machine: DysonMachine): ProbeResult {
  const message = getErrorMessage(error);
  const status = getErrorStatus(error);
  if (status === signInRequiredStatus) return { status: 'signInRequired', machine, message };
  // The machine is on a broker no client connects to.
  if (status === 501) return { status: 'unsupported', machine, message };
  if (status === 503 || status === 504) return { status: 'unreachable', machine, message };
  return { status: 'failed', machine, message };
}

/**
 * Tell whether a machine answers on the LAN, found by a search for the service it announces over mDNS
 *
 * The client is given neither an account nor a host, so it searches the LAN and asks nothing of the cloud. A search
 * that finds nothing in 3 seconds, or a broker that does not open, answers false.
 *
 * @param {DysonMachine} machine The machine, with the password of its broker on the LAN.
 * @returns {Promise<boolean>} True when the broker of the machine on the LAN opened.
 */
export async function searchLan(machine: DysonMachine): Promise<boolean> {
  let client: EnvironmentalCareClient;
  try {
    client = new EnvironmentalCareClient(machine, { timeoutInMs: probeTimeoutInMs });
  } catch {
    return false;
  }
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    try {
      await client.disconnect();
    } catch {
      // The search already has its answer.
    }
  }
}

/**
 * Check whether a machine answers through the cloud, and read what it takes and what its sensors read when it does
 *
 * @param {DysonMachine} machine The machine to check.
 * @param {DysonAccount} account The account it is registered to.
 * @returns {Promise<ProbeResult>} `ready` with the capabilities and the readings, or what stands in the way.
 */
export async function probeMachine(machine: DysonMachine, account: DysonAccount): Promise<ProbeResult> {
  let client: EnvironmentalCareClient;
  try {
    client = new EnvironmentalCareClient(machine, { account, timeoutInMs: probeTimeoutInMs });
  } catch (error) {
    return { status: 'unsupported', machine, message: getErrorMessage(error) };
  }
  try {
    await client.connect();
    // Asked for, since connecting asks the machine nothing: a machine that is unplugged answers neither.
    await client.getState();
    const sensors = await client.getSensors();
    return { status: 'ready', machine, capabilities: client.capabilities, sensors, controls: getAvailableControls(client.capabilities) };
  } catch (error) {
    return classifyFailure(error, machine);
  } finally {
    try {
      await client.disconnect();
    } catch {
      // The check already has its answer.
    }
  }
}
