/**
 * @file apps/frontend/src/api.ts
 * @description What the plugin's API sends and takes, and the call to it: see src/setup/setupApi.ts in the plugin.
 * @author Calvin Che
 * @license Apache-2.0
 */

import type { DysonMachine, EnvironmentalCareCapabilities } from 'dyson-control';

import type { DysonDeviceExposure } from '../../../src/config.js';
import type { FoundMachine, SetupDevice, SetupReplies, SetupReply } from '../../../src/setup/setupApi.js';

// The types are the plugin's own, so the page and the plugin cannot drift apart. They are only types: nothing of the
// plugin is loaded in the browser. The page has its own words for some of them.
export type { AvailableControls, OscillationAngleChoice, ReportedSensors } from '../../../src/controls.js';
export type { ProbeResult } from '../../../src/setup/probe.js';
export type { SetupState } from '../../../src/setup/setupApi.js';

export type Capabilities = EnvironmentalCareCapabilities;
export type Machine = DysonMachine;
export type Exposure = DysonDeviceExposure;
export type StoredDevice = SetupDevice;
export type ListedMachine = FoundMachine;

/** A request the plugin serves, by its method and its path after `api/`. */
export type Route = keyof SetupReplies;

/** The reply to a request, with what the plugin sends back when the request worked. */
export type Reply<R extends Route> = ({ ok: true } & SetupReplies[R]) | Extract<SetupReply, { ok: false }>;

/**
 * Call the plugin.
 *
 * @param route The method and the path, such as `POST probe`.
 * @param body The JSON body.
 * @param query The query string, without its `?`.
 * @returns The reply, with `ok: false` and the reason when the call did not work.
 */
export async function api<R extends Route>(route: R, body?: unknown, query?: string): Promise<Reply<R>> {
  try {
    const [method, path] = route.split(' ');
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const response = await fetch(new URL(`api/${path}${query === undefined ? '' : `?${query}`}`, document.baseURI), init);
    if (response.status === 204) return { ok: true } as Reply<R>;
    if (response.status === 503) return { ok: false, error: 'The plugin is not running. Start it in Matterbridge, then reload this page.' };
    const reply = (await response.json()) as Reply<R> | { error?: string };
    if ('ok' in reply) return reply;
    return { ok: false, error: reply.error ?? `The plugin answered with status ${response.status}` };
  } catch {
    return { ok: false, error: 'Matterbridge did not answer. Check that it is running, then try again.' };
  }
}
