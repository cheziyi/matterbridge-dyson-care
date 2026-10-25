/**
 * @file apps/frontend/src/state.ts
 * @description What the setup page knows at any moment, and what it reads from that.
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

import type { AvailableControls, Capabilities, Exposure, ListedMachine, Machine, ProbeResult, ReportedSensors, SetupState } from './api.js';

/** One machine on its way through Connect and Options. */
export interface Draft extends Exposure {
  machine: Machine;
  name: string;
  /** The host the machine is reached at on the LAN, or empty to search the LAN for it. */
  host: string;
  /** Whether the machine is reached through the Dyson cloud alone, never on the LAN. */
  isCloudOnly: boolean;
  isNew: boolean;
  capabilities?: Capabilities;
  /** What the plugin says the machine leaves to choose in Options. */
  controls?: AvailableControls;
  /** The readings the plugin knows the machine gives, which each have a sensor to offer. */
  reportedSensors?: ReportedSensors;
  probe?: ProbeResult;
}

export type ScreenName = 'loading' | 'home' | 'signIn' | 'find' | 'connect' | 'options' | 'done';

/** The sign in, which takes two steps: the address and the country, then the emailed code and the password, or the password alone. */
export interface SignIn {
  email: string;
  country: string;
  /** What the request for a code answered, once the code is on its way, or null for an account that signs in with its password alone. */
  challengeId?: string | null;
}

export const view = {
  screen: 'loading' as ScreenName,
  setup: undefined as SetupState | undefined,
  countries: [] as string[],
  signIn: { email: '', country: '' } as SignIn,
  machines: [] as ListedMachine[],
  selected: new Set<string>(),
  queue: [] as Draft[],
  saved: [] as string[],
  /** The machines this run is done with, in the order it went through them. */
  handled: [] as { label: string; isSaved: boolean }[],
  isBusy: false,
  busyText: '',
  error: '',
  /** A note for the user that is no problem, such as what to do after a change. */
  info: '',
  confirmingRemoval: '',
  confirmingSignOut: false,
};

export function currentDraft(): Draft | undefined {
  return view.queue[0];
}

/** What a machine is called on the page: its name, or its serial number until it has one. */
export function draftLabel(draft: Draft): string {
  return draft.name === '' ? draft.machine.serialNumber : draft.name;
}

/** What a machine is sold as, such as Purifier Cool, or its type when the cloud does not say. */
export function productLabel(machine: Machine): string {
  return machine.productName ?? `Dyson machine of type ${machine.type}`;
}

/** A machine as the MyDyson app knows it, to tell it apart: what it is sold as, its serial number, and its room name. */
export function machineLabel(machine: Machine): string {
  const label = `${productLabel(machine)} ${machine.serialNumber}`;
  return machine.name === undefined ? label : `${label}, named "${machine.name}" in the MyDyson app`;
}
