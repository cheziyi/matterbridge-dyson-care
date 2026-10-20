/**
 * @file apps/frontend/src/screens/home.ts
 * @description The home screen: the Dyson account, the machines that are set up, and the way to add more.
 * @author Calvin Che
 * @license Apache-2.0
 */

import { loadState, removeDevice, search, signOut, startQueue, startSignIn } from '../actions.js';
import type { MachineReport, SettingControlKey, StoredDevice } from '../api.js';
import { button, notice } from '../components.js';
import { type Child, h } from '../dom.js';
import { draftFromStored, settingControlKeys } from '../exposure.js';
import { render } from '../render.js';
import { view } from '../state.js';

// The setting controls, as the summary of a device names them.
const settingNames: Readonly<Record<SettingControlKey, string>> = {
  hasChildLockSwitch: 'child lock',
  hasUvLightSwitch: 'UV light',
  hasIoniserSwitch: 'ioniser',
  hasJetFocusSwitch: 'jet focus',
  hasIndirectAirflowSwitch: 'indirect airflow',
  hasAirQualityTargetSelect: 'air quality target',
  hasWickDryingSwitch: 'wick drying',
  hasWickDryingSpeedSelect: 'wick drying speed',
  hasWaterHardnessSelect: 'water hardness',
};

const placeNames = { native: 'on the fan', switch: 'as a switch', select: 'as a mode select', hidden: '' } as const;

// Such as "a fan with speed steps, the oscillation and the night mode on the fan, a thermostat, and sensors, all as one device".
function describeExposure(device: StoredDevice): string {
  // What the machine cannot do is left out, whatever is stored for it. A machine the plugin cannot read now is described as stored.
  const controls = device.controls;
  const has = (
    key: 'hasAutoMode' | 'hasOscillation' | 'hasFindAndFollow' | 'hasAirflowDirection' | 'hasHeat' | 'hasHumidification' | 'hasFilterLife' | 'hasAirQualitySensor',
  ): boolean => controls === undefined || controls[key];
  const isTilt = controls !== undefined && controls.tiltAngles.length > 0;
  const kind = device.deviceType === 'airPurifier' ? 'an air purifier' : 'a fan';
  const autoStep = { native: '', switch: '', firstStep: ' with auto first', lastStep: ' with auto last' }[device.fanAutoControl];
  const parts: string[] = [`${kind} with speed ${device.fanControl === 'steps' ? 'steps' : 'as a percentage'}${has('hasAutoMode') ? autoStep : ''}`];
  const byPlace = new Map<string, string[]>();
  const add = (place: string, name: string): void => {
    if (place !== '') byPlace.set(place, [...(byPlace.get(place) ?? []), name]);
  };
  if (has('hasAutoMode') && device.fanAutoControl === 'switch') add(placeNames.switch, 'the auto mode');
  if (has('hasOscillation')) add(placeNames[device.oscillationControl], isTilt ? 'the tilt' : 'the oscillation');
  if (has('hasFindAndFollow')) add(placeNames[device.findAndFollowControl], 'the find and follow');
  add(placeNames[device.nightModeControl], 'the night mode');
  if (has('hasAirflowDirection')) add(placeNames[device.airflowDirectionControl], 'the airflow direction');
  for (const [place, names] of byPlace) parts.push(`${names.join(', ')} ${place}`);
  if (has('hasHeat') && device.heatControl !== 'hidden') parts.push(device.heatControl === 'thermostat' ? 'a thermostat' : 'a heat switch');
  if (has('hasHumidification') && device.humidificationControl !== 'hidden') parts.push(device.humidificationControl === 'select' ? 'a target humidity select' : 'humidify switches');
  const settings = settingControlKeys.filter((key) => device[key] && (controls === undefined || controls.settingControls.includes(key))).map((key) => settingNames[key]);
  if (settings.length > 0) parts.push(`a control for the ${settings.join(', ')}`);
  if (has('hasFilterLife') && device.deviceType === 'airPurifier') parts.push('the filter life');
  // A sensor shows only once the machine gives its reading.
  const { reportedSensors: reported } = device;
  const sensors = [
    has('hasAirQualitySensor') && device.hasAirQualitySensor && reported.airQuality ? 'air quality' : '',
    device.hasTemperatureSensor && reported.temperature ? 'temperature' : '',
    device.hasHumiditySensor && reported.humidity ? 'humidity' : '',
  ].filter(
    (name) => name !== '',
  );
  if (sensors.length > 0) parts.push(`a sensor for the ${sensors.join(', ')}`);
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${list}${device.isComposed ? ', all as one device' : ''}`;
}

const filterNames = { filter: 'Filter', outerFilter: 'HEPA filter', innerFilter: 'Carbon filter' } as const;

// Such as "Next clean cycle in 84 days", or nothing when the machine says nothing of its next one.
function describeCleanCycle(cycle: NonNullable<MachineReport['cleanCycle']>): string {
  const minutes = cycle.remainingTimeOfActiveInMinutes;
  if (cycle.state === 'active') return minutes === null ? 'Cleaning' : `Cleaning, ${minutes} min left`;
  if (cycle.state === 'paused') return 'Clean cycle paused';
  if (cycle.state === 'incomplete') return 'Clean cycle not finished';
  if (cycle.state === 'setup') return 'Clean cycle being set up';
  const hours = cycle.remainingTimeToNextInHours;
  if (hours === null) return '';
  if (hours <= 0) return 'Clean cycle due';
  return hours < 48 ? `Next clean cycle in ${hours} hours` : `Next clean cycle in ${Math.round(hours / 24)} days`;
}

// Such as "HEPA filter 85 %, Carbon filter 60 %. Next clean cycle in 84 days."
function describeReport(report: MachineReport): string {
  const filters = report.filters.map(({ filter, lifeInPercent }) => `${filterNames[filter]} ${lifeInPercent} %`).join(', ');
  const cleanCycle = report.cleanCycle === undefined ? '' : describeCleanCycle(report.cleanCycle);
  const minutes = report.wickDrying?.remainingTimeInMinutes;
  let wickDrying = '';
  if (report.wickDrying !== undefined) wickDrying = minutes === null || minutes === undefined ? 'Drying its wick' : `Drying its wick, ${minutes} min left`;
  return [filters, cleanCycle, wickDrying]
    .filter((text) => text !== '')
    .map((text) => `${text}.`)
    .join(' ');
}

// Dyson's name for a fault in words, such as "filter replacement". A code whose name is not known stays as the machine sends it.
function faultName(fault: string): string {
  return fault.replaceAll(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function reportLines(report: MachineReport | undefined): Child[] {
  if (report === undefined) return [];
  const text = describeReport(report);
  const faults = report.faults ?? [];
  return [
    text === '' ? null : h('p', { class: 'meta' }, text),
    faults.length === 0 ? null : h('p', { class: 'meta problem-text' }, `The machine reports: ${faults.map(faultName).join(', ')}.`),
  ];
}

// Where a machine that is online is reached.
const routeNames = { local: ' on your network', remote: ' through the Dyson cloud' } as const;

// A machine that answers through the cloud did not on the LAN, where the plugin tries it first.
function routeLine(device: StoredDevice): Child {
  if (device.status !== 'online' || device.hostType !== 'remote' || !device.isTriedOnLan) return null;
  if (device.host !== undefined)
    return h('p', { class: 'meta' }, `It did not answer on your network at ${device.host}, so the plugin reaches it through the Dyson cloud. Check the host in its options.`);
  return h(
    'p',
    { class: 'meta' },
    'It was not found on your network, so the plugin reaches it through the Dyson cloud. Where the search does not reach it, such as in a Docker container, enter its IP address in its options.',
  );
}

function deviceRow(device: StoredDevice): HTMLElement {
  const online = `Online${device.hostType === undefined ? '' : routeNames[device.hostType]}`;
  const statusText = { online, connecting: 'Connecting…', offline: 'Not answering', stopped: 'Not started' }[device.status];
  const isConfirming = view.confirmingRemoval === device.serialNumber;
  const product = device.productName ?? `type ${device.type}`;
  return h(
    'li',
    { class: 'device' },
    h(
      'div',
      { class: 'device-main' },
      h('h3', {}, device.name),
      h('p', { class: 'meta' }, h('span', { class: `status ${device.status}` }, statusText), ` ${product}, ${device.serialNumber}. In Matter: ${describeExposure(device)}.`),
      routeLine(device),
      ...reportLines(device.report),
      device.status !== 'online' && device.error ? h('p', { class: 'meta problem-text' }, device.error) : null,
    ),
    isConfirming
      ? h(
          'div',
          { class: 'actions' },
          h('span', { class: 'meta' }, 'Remove it from Matter too?'),
          button('Remove', () => void removeDevice(device), 'danger'),
          button('Keep', () => {
            view.confirmingRemoval = '';
            render();
          }),
        )
      : h(
          'div',
          { class: 'actions' },
          // Either way the machine is checked first, so the options offered are the ones it has today.
          button(device.status === 'online' ? 'Options' : 'Reconnect', () => startQueue([draftFromStored(device)]), 'quiet', view.setup?.account === undefined),
          button('Remove', () => {
            view.confirmingRemoval = device.serialNumber;
            render();
          }),
        ),
  );
}

function accountPanel(): Child {
  const account = view.setup?.account;
  if (view.setup === undefined) return null;
  if (account === undefined) {
    return h(
      'section',
      { class: 'account' },
      h('p', { class: 'notice problem', role: 'alert' }, 'No Dyson account is signed in, so the machines below are not connected. They stay in Matter until you sign in again.'),
      button('Sign in', () => void startSignIn(), 'primary'),
    );
  }
  const actions = view.confirmingSignOut
    ? [
        h('span', { class: 'meta' }, 'The machines stay in Matter, unreachable until you sign in again.'),
        button('Sign out', () => void signOut(), 'danger'),
        button('Stay signed in', () => {
          view.confirmingSignOut = false;
          render();
        }),
      ]
    : [
        button(account.needsSignIn ? 'Sign in again' : 'Switch account', () => void startSignIn(), account.needsSignIn ? 'primary' : 'quiet'),
        button('Sign out', () => {
          view.confirmingSignOut = true;
          render();
        }),
      ];
  return h(
    'section',
    { class: 'account' },
    h('p', { class: 'meta' }, `Signed in to Dyson as ${account.email}.`),
    account.needsSignIn ? h('p', { class: 'notice problem', role: 'alert' }, 'The Dyson cloud no longer accepts this sign-in. Sign in again to keep the machines connected.') : null,
    h('div', { class: 'actions' }, ...actions),
  );
}

export function homeScreen(): Child[] {
  const devices = view.setup?.devices ?? [];
  const canAdd = view.setup?.account !== undefined && !view.setup.account.needsSignIn;
  return [
    h('header', {}, h('h1', {}, 'Dyson machines'), canAdd ? button('Add machines', () => void search(), 'primary') : null),
    notice(),
    accountPanel(),
    devices.length === 0 && view.setup ? h('p', { class: 'empty' }, 'No machine is set up yet. Add one to control it from Matter.') : h('ul', { class: 'devices' }, ...devices.map(deviceRow)),
    view.setup ? null : button('Try again', () => void loadState(), 'primary'),
  ];
}
