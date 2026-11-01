/**
 * @file apps/frontend/src/actions.ts
 * @description What the setup page does: each action calls the plugin, changes the state of the page and redraws it.
 * @author Calvin Che
 * @created 2026-10-19
 * @version 1.2.0
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

import { api, type SetupState, type StoredDevice } from './api.js';
import { pickExposure } from './exposure.js';
import { presetExposure } from './presets.js';
import { render } from './render.js';
import { currentDraft, type Draft, draftLabel, view } from './state.js';

/**
 * Run a call while the page shows that it is working
 *
 * @param {string} text What the page says meanwhile.
 * @param {() => Promise<T>} task The call.
 * @returns {Promise<T>} What the call returned.
 */
async function busy<T>(text: string, task: () => Promise<T>): Promise<T> {
  view.isBusy = true;
  view.busyText = text;
  view.error = '';
  view.info = '';
  render();
  try {
    return await task();
  } finally {
    view.isBusy = false;
    render();
  }
}

/**
 * Load the page: read the state, and go to the screen it calls for
 *
 * @returns {Promise<void>} Resolves when the first screen is drawn.
 */
export async function loadState(): Promise<void> {
  const reply = await api('GET state');
  if (!reply.ok) {
    view.error = reply.error;
    view.screen = 'home';
    render();
    return;
  }
  setSetup(reply.state);
  // With no account yet, the page goes straight to signing in, and with no machine yet to finding them.
  if (reply.state.account === undefined) {
    await startSignIn();
    return;
  }
  if (reply.state.devices.length === 0 && !reply.state.account.needsSignIn) {
    await search();
    return;
  }
  view.screen = 'home';
  render();
  void syncState();
}

/**
 * Read the machine list of the account again behind the page as it opens, so that what changed in the MyDyson app since
 * the last read, such as a room name, shows without waiting for the next one
 *
 * The page is redrawn only when the state changed: a redraw for nothing could land between a press and its click, and
 * lose the click.
 *
 * @returns {Promise<void>} Resolves when the list is read.
 */
async function syncState(): Promise<void> {
  const reply = await api('POST sync');
  if (!reply.ok || JSON.stringify(reply.state) === JSON.stringify(view.setup)) return;
  setSetup(reply.state);
  render();
}

// The state is read again this long after it showed a machine connecting.
const connectingRefreshInMs = 2000;
let connectingRefresh: number | undefined;

/**
 * Take the state the plugin sent, and read it again in a moment while a machine connects, so that its status settles without a reload
 *
 * @param {SetupState} state The state.
 * @returns {void}
 */
function setSetup(state: SetupState): void {
  view.setup = state;
  if (connectingRefresh !== undefined || !state.devices.some((device) => device.status === 'connecting')) return;
  connectingRefresh = window.setTimeout(() => {
    connectingRefresh = undefined;
    void followConnecting();
  }, connectingRefreshInMs);
}

/**
 * Read the state again while a machine connects, and redraw the home screen when it changed
 *
 * The home screen alone shows the machines. Another screen is left as it is, and a state that did not change redraws
 * nothing: a redraw for nothing could land between a press and its click, and lose the click.
 *
 * @returns {Promise<void>} Resolves when the state is read.
 */
async function followConnecting(): Promise<void> {
  const reply = await api('GET state');
  if (!reply.ok) return;
  const hasChanged = JSON.stringify(reply.state) !== JSON.stringify(view.setup);
  setSetup(reply.state);
  if (hasChanged && view.screen === 'home') render();
}

/**
 * Read the state again, without redrawing
 *
 * @returns {Promise<void>} Resolves when the state is read.
 */
async function refreshState(): Promise<void> {
  const reply = await api('GET state');
  if (reply.ok) setSetup(reply.state);
}

/**
 * Go to the home screen, leaving a run of the setup, and read the state again behind it
 *
 * @returns {void}
 */
export function goHome(): void {
  view.queue = [];
  view.saved = [];
  view.handled = [];
  view.error = '';
  view.info = '';
  view.screen = 'home';
  void refreshState().then(render);
  render();
}

/**
 * Go to the sign in, with the address and the country of the account signed in filled in
 *
 * @returns {Promise<void>} Resolves when the countries are listed, or the list is given up.
 */
export async function startSignIn(): Promise<void> {
  const account = view.setup?.account;
  view.signIn = { email: account?.email ?? '', country: account?.country ?? '' };
  view.error = '';
  view.info = '';
  view.screen = 'signIn';
  render();
  if (view.countries.length > 0) return;
  // The page falls back to typing the country when the cloud does not list them.
  const reply = await api('GET countries');
  if (reply.ok) view.countries = reply.countries;
  render();
}

/**
 * Ask Dyson how an account signs in: with a code it emails, or with its password alone
 *
 * @param {string} email The email address of the account.
 * @param {string} country The country of the account, as two capital letters.
 * @returns {Promise<void>} Resolves when the page shows the next step, or the refusal.
 */
export async function requestCode(email: string, country: string): Promise<void> {
  view.signIn = { email, country };
  const reply = await busy(`Asking Dyson how ${email} signs in…`, async () => api('POST login-code', { email, country }));
  if (!reply.ok) {
    view.error = reply.error;
    render();
    return;
  }
  view.signIn = { email, country, challengeId: reply.challengeId };
  render();
}

/**
 * Sign in to the Dyson account, and go on to its machines
 *
 * @param {string} password The password of the account.
 * @param {string} [otpCode] The code Dyson emailed, for an account that signs in with one.
 * @returns {Promise<void>} Resolves when the page went on, or shows the refusal.
 */
export async function signIn(password: string, otpCode?: string): Promise<void> {
  const { email, country, challengeId } = view.signIn;
  // An account that signs in with its password alone sends no code.
  const code = typeof challengeId === 'string' ? { challengeId, otpCode } : {};
  const reply = await busy('Signing in…', async () => api('POST login', { email, country, password, ...code }));
  if (!reply.ok) {
    view.error = reply.error;
    render();
    return;
  }
  setSetup(reply.state);
  view.signIn = { email, country };
  // The machines are what comes after an account, unless they are set up already.
  if (reply.state.devices.length === 0) await search();
  else goHome();
}

/**
 * Sign out of the account: the machines stay in Matter, unreachable until the next sign in
 *
 * @returns {Promise<void>} Resolves when the page shows the outcome.
 */
export async function signOut(): Promise<void> {
  const reply = await busy('Signing out…', async () => api('POST sign-out'));
  view.confirmingSignOut = false;
  if (!reply.ok) view.error = reply.error;
  await refreshState();
  render();
}

/**
 * Go to the Find step, and list the machines of the account, with the ones the plugin can add picked
 *
 * @returns {Promise<void>} Resolves when the machines are shown, or the failure.
 */
export async function search(): Promise<void> {
  view.screen = 'find';
  const reply = await busy('Reading the machines of your Dyson account…', async () => api('POST machines'));
  if (!reply.ok) {
    view.error = `The machines could not be read: ${reply.error}`;
    render();
    return;
  }
  await refreshState();
  view.machines = reply.machines;
  for (const machine of reply.machines) {
    if (!machine.isConfigured && machine.support === 'supported') view.selected.add(machine.serialNumber);
  }
  render();
}

/**
 * Start a run of the setup through the Connect and Options steps, one machine after the other
 *
 * @param {Draft[]} drafts The machines to set up, in order.
 * @returns {void}
 */
export function startQueue(drafts: Draft[]): void {
  view.queue = drafts;
  view.saved = [];
  view.handled = [];
  void enterConnect();
}

/**
 * Go to the Connect step of the next machine of the run, or to the end of the run
 *
 * @returns {Promise<void>} Resolves when the machine is checked, or the end is shown.
 */
async function enterConnect(): Promise<void> {
  const draft = currentDraft();
  if (draft === undefined) {
    view.screen = view.saved.length > 0 ? 'done' : 'home';
    await refreshState();
    render();
    return;
  }
  view.screen = 'connect';
  view.error = '';
  view.info = '';
  draft.probe = undefined;
  render();
  await check(draft);
}

/**
 * Check a machine through the plugin, and go to its options once it answers
 *
 * @param {Draft} draft The machine.
 * @returns {Promise<void>} Resolves when the page shows the outcome.
 */
export async function check(draft: Draft): Promise<void> {
  const reply = await busy(`Connecting to ${draftLabel(draft)} through the Dyson cloud, and looking for it on your network…`, async () =>
    api('POST probe', { machine: draft.machine }),
  );
  if (!reply.ok) {
    view.error = reply.error;
    render();
    return;
  }
  draft.probe = reply.result;
  if (reply.result.status === 'signInRequired') await refreshState();
  if (reply.result.status === 'ready') {
    const isFirstReading = draft.controls === undefined;
    draft.capabilities = reply.result.capabilities;
    draft.controls = reply.result.controls;
    draft.reportedSensors = reply.result.reportedSensors;
    // A new machine starts with the Apple Home preset, once what it can do is known.
    if (draft.isNew && isFirstReading && draft.controls !== undefined) Object.assign(draft, presetExposure('apple', draft.controls));
    // A new machine the search did not find starts on the cloud alone, so that each connection skips the search.
    if (draft.isNew && isFirstReading && reply.result.isFoundOnLan === false) draft.isCloudOnly = true;
    view.screen = 'options';
  }
  render();
}

/**
 * Leave the machine the run is on out, and go on to the next
 *
 * @returns {void}
 */
export function skipDraft(): void {
  const skipped = view.queue.shift();
  if (skipped !== undefined) view.handled.push({ label: draftLabel(skipped), isSaved: false });
  void enterConnect();
}

/**
 * Store a machine with the options chosen, and go on to the next
 *
 * @param {Draft} draft The machine, with its options.
 * @returns {Promise<void>} Resolves when the machine is stored and the page went on, or shows what is wrong.
 */
export async function saveDraft(draft: Draft): Promise<void> {
  const name = draft.name.trim();
  const problem = checkName(draft, name);
  if (problem !== '') {
    view.error = problem;
    render();
    return;
  }
  const { machine } = draft;
  // An empty host is left out: the plugin searches the LAN for the machine. A machine on the cloud alone needs none.
  const host = draft.isCloudOnly || draft.host === '' ? undefined : draft.host;
  const device = { ...machine, name, roomName: machine.name, host, isCloudOnly: draft.isCloudOnly || undefined, ...pickExposure(draft) };
  const reply = await busy(`Saving ${name}…`, async () => api('POST device', { device }));
  if (!reply.ok) {
    view.error = reply.error;
    render();
    return;
  }
  setSetup(reply.state);
  view.saved.push(name);
  view.handled.push({ label: name, isSaved: true });
  view.queue.shift();
  await enterConnect();
}

/**
 * Tell what is wrong with the name of a draft: the plugin refuses a name another device has
 *
 * @param {Draft} draft The machine.
 * @param {string} name Its name, trimmed.
 * @returns {string} What is wrong, or an empty text.
 */
function checkName(draft: Draft, name: string): string {
  if (name === '') return 'Give the machine a name: it is the name it gets in Matter.';
  const isTaken = (view.setup?.devices ?? []).some((device) => device.name === name && device.serialNumber !== draft.machine.serialNumber);
  return isTaken ? `"${name}" is already the name of another machine. Pick a different one.` : '';
}

// Matterbridge does not tell its own page when a plugin adds or removes a device, so its device list waits for a reload.
export const reloadNote = "Matterbridge's own list of devices shows the change once you reload its page.";

/** A change of how a machine appears in Matter waits for a restart, which the plugin asks Matterbridge for as well. */
export const restartNote = 'Restart Matterbridge to apply the new options in Matter: until then the machine keeps its current controls.';

/**
 * Remove a stored device from the plugin and from Matter
 *
 * @param {StoredDevice} device The device.
 * @returns {Promise<void>} Resolves when the page shows the outcome.
 */
export async function removeDevice(device: StoredDevice): Promise<void> {
  const reply = await busy(`Removing ${device.name}…`, async () => api('POST remove-device', { serialNumber: device.serialNumber }));
  view.confirmingRemoval = '';
  if (reply.ok) view.info = `${device.name} is removed. ${reloadNote}`;
  else view.error = reply.error;
  await refreshState();
  render();
}
