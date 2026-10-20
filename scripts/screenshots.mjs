/**
 * screenshots.mjs
 * Version: 1.0.0
 *
 * Takes the screenshots of the guided setup in the README, without a Dyson account. It serves the built setup page
 * as Matterbridge does, answers its API with the plugin's own handler in front of a fake account of simulated
 * machines, and drives the page in Chromium.
 *
 * Usage:
 *   npm run build && npm run build:frontend
 *   npm run screenshots
 *
 * Chromium is that of Playwright when it is installed (npx playwright install chromium), and Google Chrome otherwise.
 */

/* oxlint-disable no-console */

import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EnvironmentalCareClient } from 'dyson-control';
import { chromium } from 'playwright-core';

import { parseDeviceConfig } from '../dist/config.js';
import { addReportedSensors, getAvailableControls, noReportedSensors } from '../dist/controls.js';
import { getMachineSupport } from '../dist/setup/probe.js';
import { handleSetupRequest } from '../dist/setup/setupApi.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = path.join(root, 'apps/frontend/build');
const out = path.join(root, 'screenshots');
const base = '/plugins/matterbridge-dyson-care/';

const account = { email: 'someone@example.com', accountId: 'account-1', token: 'token-1', tokenType: 'Bearer', country: 'GB', culture: 'en-GB' };
const machines = [
  { serialNumber: 'NK6-EU-MHA0001A', type: '438', name: 'Living Room', productName: 'Purifier Cool', firmwareCapabilities: ['AdvanceOscillationDay1'] },
  { serialNumber: 'NK6-EU-MHA0002A', type: '527', name: 'Bedroom', productName: 'Purifier Hot+Cool', firmwareCapabilities: ['AdvanceOscillationDay0'] },
  { serialNumber: 'NK6-EU-MHA0003A', type: '358', name: 'Nursery', productName: 'Purifier Humidify+Cool' },
  { serialNumber: 'NK6-EU-MHA0004A', type: '739', name: 'Study', productName: 'Cool Tower' },
  { serialNumber: 'NK6-EU-MHA0005A', type: '664', name: 'Hall', productName: 'Big+Quiet' },
  { serialNumber: 'NK6-EU-MHA0006A', type: '438', variant: 'N', name: 'Office', productName: 'Purifier Cool Gen1', firmwareCapabilities: ['AdvanceOscillationDay1'] },
  { serialNumber: 'NK6-EU-MHA0008A', type: '997', name: 'Kitchen', productName: 'Purifier Big+Quiet', remoteBrokerType: 'rabbitMq' },
  { serialNumber: 'RB3-EU-MHA0009A', type: '277', category: 'robot', name: 'Downstairs', productName: '360 Vis Nav' },
].map((machine) => ({ category: 'environmentalCare', remoteBrokerType: 'awsIot', ...machine }));

const sensors = {
  temperatureInC: 21.5,
  humidityInPercent: 46,
  pm25InUgPerM3: 6,
  pm25Index: 2,
  pm10InUgPerM3: 8,
  pm10Index: 2,
  volatileOrganicCompoundsIndex: 3,
  nitrogenDioxideIndex: 1,
  formaldehydeInUgPerM3: null,
  formaldehydeIndex: null,
  carbonDioxideInPpm: null,
  carbonDioxideIndex: null,
};
const roomSensors = { ...Object.fromEntries(Object.keys(sensors).map((key) => [key, null])), temperatureInC: 22, humidityInPercent: 50 };

// The Apple Home preset, as the setup page stores it.
const appleHome = {
  fanControl: 'percent',
  oscillationControl: 'switch',
  nightModeControl: 'switch',
  humidificationControl: 'switches',
  findAndFollowControl: 'switch',
  hasUvLightSwitch: true,
  hasIoniserSwitch: true,
  hasJetFocusSwitch: true,
  hasIndirectAirflowSwitch: true,
  isComposed: false,
};

/**
 * Find a simulated machine
 *
 * @param {string} serialNumber Its serial number.
 * @returns {object} The machine.
 */
function machineOf(serialNumber) {
  return machines.find((machine) => machine.serialNumber === serialNumber);
}

/**
 * Read what a simulated machine takes, as dyson-control decodes it
 *
 * @param {object} machine The machine.
 * @returns {object} Its capabilities.
 */
function capabilitiesOf(machine) {
  return new EnvironmentalCareClient(machine, { account }).capabilities;
}

/**
 * Read what a simulated machine measures
 *
 * @param {object} machine The machine.
 * @returns {object} Its sensors: every pollutant for a purifier, the room alone otherwise.
 */
function sensorsOf(machine) {
  return capabilitiesOf(machine).hasAirQualitySensor ? sensors : roomSensors;
}

/**
 * Build a stored device of a simulated machine
 *
 * @param {string} serialNumber The serial number of the machine.
 * @param {object} overrides The fields to replace.
 * @returns {object} The device, with the Apple Home preset.
 */
function storedOf(serialNumber, overrides = {}) {
  const machine = machineOf(serialNumber);
  const deviceType = capabilitiesOf(machine).hasAirQualitySensor ? 'airPurifier' : 'fan';
  return parseDeviceConfig({ ...machine, roomName: machine.name, deviceType, ...appleHome, ...overrides });
}

/**
 * Start the account afresh
 *
 * @param {boolean} isSignedIn Whether the account is signed in, with four machines set up.
 * @returns {object} The account, the stored devices and how each runs.
 */
function createWorld(isSignedIn) {
  if (!isSignedIn) return { account: undefined, devices: [], runs: new Map() };
  const filters = (outer, inner) => [
    { filter: 'outerFilter', lifeInPercent: outer },
    { filter: 'innerFilter', lifeInPercent: inner },
  ];
  return {
    account,
    devices: [storedOf('NK6-EU-MHA0001A'), storedOf('NK6-EU-MHA0002A', { name: 'Main Bedroom' }), storedOf('NK6-EU-MHA0003A'), storedOf('NK6-EU-MHA0004A')],
    runs: new Map([
      ['NK6-EU-MHA0001A', { status: 'online', hostType: 'local', report: { filters: filters(62, 48), faults: [] } }],
      ['NK6-EU-MHA0002A', { status: 'online', hostType: 'local', report: { filters: filters(4, 9), faults: ['filterReplacement'] } }],
      [
        'NK6-EU-MHA0003A',
        { status: 'online', hostType: 'remote', report: { filters: filters(81, 77), cleanCycle: { state: null, remainingTimeToNextInHours: 72, remainingTimeOfActiveInMinutes: null }, faults: ['tankEmpty'] } },
      ],
      ['NK6-EU-MHA0004A', { status: 'offline', error: 'The machine did not answer within 10 seconds' }],
    ]),
  };
}

let world = createWorld(true);

const platform = {
  getSetupState: async () => ({
    account: world.account && { email: world.account.email, country: world.account.country, needsSignIn: false },
    devices: world.devices.map((device) => {
      const machine = machineOf(device.serialNumber);
      const capabilities = capabilitiesOf(machine);
      const run = world.runs.get(device.serialNumber) ?? { status: 'connecting' };
      // Each is tried on the LAN first, found by a search.
      return { ...device, ...run, isTriedOnLan: true, capabilities, controls: getAvailableControls(capabilities), reportedSensors: addReportedSensors(noReportedSensors, sensorsOf(machine)) };
    }),
  }),
  getCountries: async () => ['AU', 'CA', 'CN', 'DE', 'FR', 'GB', 'IE', 'IT', 'JP', 'NL', 'SG', 'US'],
  requestLoginCode: async () => 'challenge-1',
  signIn: async () => {
    world.account = account;
  },
  signOut: async () => {
    world.account = undefined;
  },
  listMachines: async () =>
    machines.map((machine) => ({ ...machine, isConfigured: world.devices.some((device) => device.serialNumber === machine.serialNumber), support: getMachineSupport(machine, account) })),
  syncMachines: async () => {},
  probe: async (requested) => {
    // Long enough for the Connect step to show.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const machine = machineOf(requested.serialNumber);
    const capabilities = capabilitiesOf(machine);
    const given = sensorsOf(machine);
    return { status: 'ready', machine, capabilities, sensors: given, controls: getAvailableControls(capabilities), reportedSensors: addReportedSensors(noReportedSensors, given) };
  },
  saveDevice: async (device) => {
    world.devices = [...world.devices.filter((stored) => stored.serialNumber !== device.serialNumber), device];
    world.runs.set(device.serialNumber, { status: 'connecting' });
  },
  removeDevice: async (serialNumber) => {
    world.devices = world.devices.filter((stored) => stored.serialNumber !== serialNumber);
    return true;
  },
};

const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };

/**
 * Answer a request as Matterbridge does: the page under its path, and its API through the plugin's handler
 *
 * @param {http.IncomingMessage} request The request.
 * @param {http.ServerResponse} response The response.
 * @returns {Promise<void>} Resolves once answered.
 */
async function serve(request, response) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith(base)) {
    response.writeHead(404).end();
    return;
  }
  const rest = url.pathname.slice(base.length);
  if (rest.startsWith('api/')) {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const reply = await handleSetupRequest(platform, request.method ?? 'GET', rest.slice('api/'.length), Object.fromEntries(url.searchParams), raw === '' ? undefined : JSON.parse(raw));
    if (reply === undefined) response.writeHead(404).end();
    else if (request.method === 'DELETE') response.writeHead(204).end();
    else response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(reply));
    return;
  }
  const file = path.join(build, rest === '' ? 'index.html' : rest);
  const content = await readFile(file).catch(async () => readFile(path.join(build, 'index.html')));
  response.writeHead(200, { 'content-type': contentTypes[path.extname(file)] ?? 'text/html' }).end(content);
}

/**
 * Start Chromium: that of Playwright, or Google Chrome when it is not installed
 *
 * @returns {Promise<import('playwright-core').Browser>} The browser.
 */
async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: 'chrome' });
  }
}

const server = http.createServer((request, response) => void serve(request, response));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const page$ = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}${base}`;

const browser = await launch();
// A short viewport, so that a page shorter than it is taken at its own height.
const page = await browser.newPage({ viewport: { width: 1440, height: 400 }, colorScheme: 'dark' });
const click = async (name) => page.getByRole('button', { name, exact: true }).click();
const settle = async () => {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
};

/**
 * Save the whole page
 *
 * @param {string} name The file name, without its extension.
 * @returns {Promise<void>} Resolves once saved.
 */
async function shot(name) {
  await settle();
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  console.log(`Saved screenshots/${name}.png`);
}

/**
 * Save the Options step from the section of one heading to that of another, across the whole width
 *
 * @param {string} name The file name, without its extension.
 * @param {string | null} first The heading of the first section, or null from the top of the page.
 * @param {string} last The heading of the last section.
 * @returns {Promise<void>} Resolves once saved.
 */
async function shotSections(name, first, last) {
  await settle();
  const section = (title) =>
    page
      .locator('main section')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .first();
  const scroll = await page.evaluate(() => window.scrollY);
  const top = first === null ? 0 : (await section(first).boundingBox()).y + scroll - 16;
  const bottom = await section(last).boundingBox();
  const clip = { x: 0, y: top, width: 1440, height: bottom.y + scroll + bottom.height + 16 - top };
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true, clip });
  console.log(`Saved screenshots/${name}.png`);
}

const optionsOf = async (name) => page.locator('li.device').filter({ hasText: name }).getByRole('button', { name: 'Options' }).click();
const options = async () => page.getByRole('heading', { name: 'Start from a preset' }).waitFor({ timeout: 15_000 });

try {
  // The sign in, at its code.
  world = createWorld(false);
  await page.goto(page$);
  await page.getByLabel('Email address').fill('someone@example.com');
  await page.getByLabel('Country of the account').selectOption('GB');
  await click('Email me a code');
  await page.getByLabel('Code from the email').fill('482913');
  await page.getByLabel('Password of the account').fill('correct horse battery');
  await page.evaluate(() => document.activeElement?.blur());
  await shot('sign-in');

  // Four machines set up, and two more to add.
  world = createWorld(true);
  await page.goto(page$);
  await page.getByRole('button', { name: 'Add machines' }).waitFor();
  await shot('home');
  await click('Add machines');
  await page.getByRole('heading', { name: 'Your Dyson machines' }).waitFor();
  await shot('find');
  await click('Set up 2 machines');
  await options();
  await shotSections('options-presets-fan', null, 'Fan speed');
  await click('Add Hall');
  await page.getByRole('heading', { name: 'Find and follow' }).waitFor({ timeout: 15_000 });
  await page.getByRole('radio', { name: /^A mode select/ }).first().check();
  await shotSections('options-oscillation', 'Oscillation', 'Find and follow');

  // A humidifier already set up.
  world = createWorld(true);
  await page.goto(page$);
  await optionsOf('Nursery');
  await options();
  await shotSections('options-humidifier', 'Humidifying', 'Clean cycle');
} finally {
  await browser.close();
  server.close();
}
