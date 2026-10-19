/**
 * @file src/setup/setupApi.ts
 * @description This file contains the REST API of the guided setup page, which Matterbridge serves through onFetch.
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

import type { DysonMachine, EnvironmentalCareCapabilities } from 'dyson-control';
import { isValidObject, isValidString } from 'matterbridge/utils';

import { type DysonDeviceConfig, isValidSerialNumber, normalizeDeviceName, parseDeviceConfig } from '../config.js';
import type { AvailableControls, ReportedSensors } from '../controls.js';
import { getErrorMessage } from '../errors.js';
import type { MachineSupport, ProbeResult } from './probe.js';

/** A stored device as the setup page sees it, with how it is doing. */
export type SetupDevice = DysonDeviceConfig & {
  /** `online`, `connecting` until its first read ends and `offline` for a running device, `stopped` for one that could not be started yet. */
  status: 'online' | 'connecting' | 'offline' | 'stopped';
  error?: string;
  /** What the machine takes, while an account is signed in to read it with. */
  capabilities?: EnvironmentalCareCapabilities;
  /** The controls and the switches the device can have in Matter, while its capabilities are known. */
  controls?: AvailableControls;
  /** Every reading the machine is known to have given. */
  reportedSensors: ReportedSensors;
};

/** The account as the setup page sees it: never its token. */
export interface SetupAccount {
  email: string;
  country: string;
  /** The cloud no longer accepts the account, which has to be signed in again. */
  needsSignIn: boolean;
}

export interface SetupState {
  /** The account the machines are reached through, or undefined when none is signed in. */
  account?: SetupAccount;
  devices: SetupDevice[];
}

/** A machine of the account, as the setup page sees it. */
export type FoundMachine = DysonMachine & {
  /** The machine is that of a stored device. */
  isConfigured: boolean;
  /** Whether the plugin can control it, or why not. */
  support: MachineSupport;
};

/** What the sign in takes, besides the account's country. */
export interface SignInRequest {
  email: string;
  password: string;
  /** What the request for a login code answered. */
  challengeId: string;
  /** The code the cloud emailed. */
  otpCode: string;
  country: string;
}

/** What each request carries back when it worked, by its method and its path. The setup page reads its replies by it. */
export interface SetupReplies {
  'GET state': { state: SetupState };
  'GET countries': { countries: string[] };
  'POST login-code': { challengeId: string };
  'POST login': { state: SetupState };
  /** Nothing but that it worked. Matterbridge answers a DELETE with 204 and no body. */
  'DELETE account': object;
  'POST machines': { machines: FoundMachine[] };
  'POST probe': { result: ProbeResult };
  'POST device': { state: SetupState };
  'DELETE device': object;
}

/** Every reply says whether the request worked, so the page never has to read an HTTP status. */
export type SetupReply = ({ ok: true } & SetupReplies[keyof SetupReplies]) | { ok: false; error: string };

/** The part of the platform the setup page reaches. */
export interface SetupPlatform {
  getSetupState: () => Promise<SetupState>;
  getCountries: () => Promise<string[]>;
  requestLoginCode: (email: string, country: string) => Promise<string>;
  signIn: (request: SignInRequest) => Promise<void>;
  signOut: () => Promise<void>;
  listMachines: () => Promise<FoundMachine[]>;
  probe: (machine: DysonMachine) => Promise<ProbeResult>;
  saveDevice: (device: DysonDeviceConfig) => Promise<void>;
  removeDevice: (serialNumber: string) => Promise<boolean>;
}

const countryPattern = /^[A-Z]{2}$/;
const emailPattern = /^[^\s@]+@[^\s@]+$/;
const otpCodePattern = /^\S{4,16}$/;

/**
 * Build the reply of a request that could not be served
 *
 * @param {string} error What was wrong, in words the page can show.
 * @returns {SetupReply} The failed reply.
 */
function fail(error: string): SetupReply {
  return { ok: false, error };
}

/**
 * Read a request body as a record
 *
 * @param {unknown} body The parsed JSON body.
 * @returns {Record<string, unknown>} The body, or an empty record when it is not an object.
 */
function toRecord(body: unknown): Record<string, unknown> {
  return isValidObject(body) ? { ...body } : {};
}

/**
 * Read an email address
 *
 * @param {unknown} value The value from the request.
 * @returns {string | undefined} The trimmed address, or undefined when it is not one.
 */
function parseEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const email = value.trim();
  return email.length <= 254 && emailPattern.test(email) ? email : undefined;
}

/**
 * Read a country
 *
 * @param {unknown} value The value from the request.
 * @returns {string | undefined} The country as two capital letters, or undefined when it is not one.
 */
function parseCountry(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const country = value.trim().toUpperCase();
  return countryPattern.test(country) ? country : undefined;
}

/**
 * Read the machine a request is about
 *
 * @param {unknown} value The value from the request.
 * @returns {DysonMachine | undefined} The machine, or undefined when its serial number or its type is not valid.
 */
export function parseDysonMachine(value: unknown): DysonMachine | undefined {
  const raw = toRecord(value);
  if (!isValidSerialNumber(raw.serialNumber) || !isValidString(raw.type, 1, 16)) return undefined;
  const machine: DysonMachine = { serialNumber: raw.serialNumber, type: raw.type, category: 'environmentalCare' };
  const name = normalizeDeviceName(raw.name);
  if (name !== undefined) machine.name = name;
  for (const key of ['variant', 'mqttRootTopicLevel', 'model', 'productName', 'firmwareVersion'] as const) {
    const text = raw[key];
    if (isValidString(text, 1, 128)) machine[key] = text;
  }
  if (Array.isArray(raw.firmwareCapabilities)) machine.firmwareCapabilities = raw.firmwareCapabilities.filter((capability) => isValidString(capability, 1, 128));
  return machine;
}

/**
 * Read a sign in request
 *
 * @param {Record<string, unknown>} body The request body.
 * @returns {SignInRequest | string} The request, or what is wrong with it.
 */
function parseSignIn(body: Record<string, unknown>): SignInRequest | string {
  const email = parseEmail(body.email);
  const country = parseCountry(body.country);
  if (email === undefined) return 'Enter the email address of your Dyson account';
  if (country === undefined) return 'Pick the country of your Dyson account';
  if (!isValidString(body.password, 1, 256)) return 'Enter the password of your Dyson account';
  if (!isValidString(body.challengeId, 1, 256)) return 'Ask for a new code: this sign in has no code to check';
  const otpCode = typeof body.otpCode === 'string' ? body.otpCode.trim() : '';
  if (!otpCodePattern.test(otpCode)) return 'Enter the code Dyson emailed you';
  return { email, password: body.password, challengeId: body.challengeId, otpCode, country };
}

/**
 * Serve one POST request of the setup page
 *
 * @param {SetupPlatform} platform The platform.
 * @param {string} path The path after `api/`.
 * @param {Record<string, unknown>} body The request body.
 * @returns {Promise<SetupReply | undefined>} The reply, or undefined for a path that is not served.
 */
async function handlePost(platform: SetupPlatform, path: string, body: Record<string, unknown>): Promise<SetupReply | undefined> {
  if (path === 'login-code') {
    const email = parseEmail(body.email);
    const country = parseCountry(body.country);
    if (email === undefined) return fail('Enter the email address of your Dyson account');
    if (country === undefined) return fail('Pick the country of your Dyson account');
    return { ok: true, challengeId: await platform.requestLoginCode(email, country) };
  }
  if (path === 'login') {
    const request = parseSignIn(body);
    if (typeof request === 'string') return fail(request);
    await platform.signIn(request);
    return { ok: true, state: await platform.getSetupState() };
  }
  if (path === 'machines') return { ok: true, machines: await platform.listMachines() };
  if (path === 'probe') {
    const machine = parseDysonMachine(body.machine);
    if (machine === undefined) return fail('The machine has no valid serial number or type');
    return { ok: true, result: await platform.probe(machine) };
  }
  if (path === 'device') {
    const device = parseDeviceConfig(body.device);
    if (device === undefined) return fail('The device needs a name of at most 32 characters, the serial number of its machine and its type');
    await platform.saveDevice(device);
    return { ok: true, state: await platform.getSetupState() };
  }
  return undefined;
}

/**
 * Serve one request of the setup page
 *
 * Paths: `GET state`, `GET countries`, `POST login-code`, `POST login`, `DELETE account`, `POST machines`, `POST probe`,
 * `POST device` and `DELETE device?serialNumber=`. A password is accepted, used once and never stored or returned, and
 * the token of the account is never returned.
 *
 * Edge cases:
 *  - a path that is not served -> undefined, which Matterbridge answers with 404
 *  - a request that fails -> `{ ok: false, error }`, never a thrown error
 *
 * @param {SetupPlatform} platform The platform.
 * @param {string} method The HTTP method.
 * @param {string} [path] The path after `api/`.
 * @param {Record<string, unknown>} [query] The query string parameters.
 * @param {unknown} [body] The parsed JSON body.
 * @returns {Promise<SetupReply | undefined>} The reply.
 */
export async function handleSetupRequest(platform: SetupPlatform, method: string, path?: string, query?: Record<string, unknown>, body?: unknown): Promise<SetupReply | undefined> {
  try {
    if (method === 'GET' && path === 'state') return { ok: true, state: await platform.getSetupState() };
    if (method === 'GET' && path === 'countries') return { ok: true, countries: await platform.getCountries() };
    if (method === 'POST' && path !== undefined) return await handlePost(platform, path, toRecord(body));
    if (method === 'DELETE' && path === 'account') {
      await platform.signOut();
      return { ok: true };
    }
    if (method === 'DELETE' && path === 'device') {
      const serialNumber = query?.serialNumber;
      if (!isValidSerialNumber(serialNumber)) return fail('Give the serial number of the machine of the device to remove');
      return (await platform.removeDevice(serialNumber)) ? { ok: true } : fail(`No device has the machine ${serialNumber}`);
    }
    return undefined;
  } catch (error) {
    return fail(getErrorMessage(error));
  }
}
