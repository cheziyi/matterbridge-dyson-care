/**
 * @file apps/frontend/src/screens/options.ts
 * @description The Options step: how the fan, its auto mode, oscillation and night mode, the find and follow, the heating, the humidifying, the clean cycle and the readings of a machine appear in Matter, one section each, and whether as one device.
 * @author Calvin Che
 * @license Apache-2.0
 */

import { goHome, saveDraft } from '../actions.js';
import type { AvailableControls, Exposure, OscillationAngleChoice, ReportedSensors, SettingControlKey } from '../api.js';
import { button, notice, steps, unitHeader, unitStrip } from '../components.js';
import { type Child, h } from '../dom.js';
import { noControls, noReportedSensors } from '../exposure.js';
import { matchesPreset, presetExposure, type PresetName, presets } from '../presets.js';
import { render } from '../render.js';
import { currentDraft, type Draft, machineLabel } from '../state.js';

// Static drawings, so innerHTML is safe for them. Everything that comes from the network goes through text nodes.
const glyphs = {
  steps:
    '<svg viewBox="0 0 48 28" aria-hidden="true"><rect x="2" y="20" width="8" height="6"/><rect x="14" y="14" width="8" height="12"/><rect x="26" y="8" width="8" height="18"/><rect x="38" y="2" width="8" height="24"/></svg>',
  percent: '<svg viewBox="0 0 48 28" aria-hidden="true"><path d="M2 26 L46 2 L46 26 Z"/></svg>',
  purifier: '<svg viewBox="0 0 48 28" aria-hidden="true"><rect class="stroke" x="16" y="2" width="16" height="24" rx="3"/><path class="stroke" d="M20 8 H28 M20 13 H28 M20 18 H28"/></svg>',
  fan: '<svg viewBox="0 0 48 28" aria-hidden="true"><circle class="stroke" cx="24" cy="12" r="9"/><path class="stroke" d="M24 21 V26 M18 26 H30"/></svg>',
};

// Home Assistant is the one app known to show a mode select.
const selectSupport = 'Few apps show a mode select: Home Assistant does, Apple Home does not.';

// Matter has a place on the fan control for these, which not every app shows.
const fanFeatureSupport = 'Not every app shows it there: Apple Home and Google Home are not known to.';

// A part of the main device has no name of its own in Matter: a switch or a mode select is tagged with what it is.
function placement(draft: Draft, label: string, isTagged: boolean): string {
  if (!draft.isComposed) return `It appears as "${draft.name} ${label}"`;
  return isTagged ? `It appears as a part of "${draft.name}", tagged "${label}"` : `It appears as a part of "${draft.name}"`;
}

function update(draft: Draft, change: Partial<Exposure>): void {
  Object.assign(draft, change);
  render();
}

function choice<T extends string>(group: string, value: T, current: T, title: string, text: string, glyph: string, onpick: (value: T) => void): HTMLElement {
  const id = `${group}-${value}`;
  const input = h('input', { type: 'radio', name: group, id, checked: value === current, onchange: () => onpick(value) });
  return h('label', { class: 'choice pictured', for: id }, input, h('span', { class: 'glyph', html: glyph }), h('span', {}, h('strong', {}, title), h('span', { class: 'meta' }, text)));
}

function radio<T extends string>(group: string, value: T, current: T, title: string, text: string, onpick: (value: T) => void): HTMLElement {
  const id = `${group}-${value}`;
  const input = h('input', { type: 'radio', name: group, id, checked: value === current, onchange: () => onpick(value) });
  return h('label', { class: 'choice', for: id }, input, h('span', {}, h('strong', {}, title), h('span', { class: 'meta' }, text)));
}

function toggle(id: string, isOn: boolean, title: string, text: string, onpick: (isOn: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', id, checked: isOn, onchange: () => onpick(input.checked) });
  return h('label', { class: 'choice', for: id }, input, h('span', {}, h('strong', {}, title), h('span', { class: 'meta' }, text)));
}

/** A section of radio choices, with a heading and a line of help. */
function radioSection(title: string, help: string, ...choices: Child[]): HTMLElement {
  const id = `${title.toLowerCase().replaceAll(' ', '-')}-title`;
  return h('section', {}, h('h2', { id }, title), help === '' ? null : h('p', { class: 'help' }, help), h('div', { 'class': 'choices', 'role': 'radiogroup', 'aria-labelledby': id }, ...choices));
}

// Redrawn as it is typed, so that the texts that name the device follow. A redraw when the field is left instead would
// replace the button the click leaving it is on, and lose that click.
function nameSection(draft: Draft): HTMLElement {
  const input = h('input', { type: 'text', id: 'device-name', value: draft.name, maxLength: 32, autocomplete: 'off', spellcheck: false });
  input.addEventListener('input', (event) => {
    draft.name = input.value.trim();
    // A redraw in the middle of a composition, such as of Japanese text, would end it.
    if (!(event as InputEvent).isComposing) render();
  });
  const room = draft.machine.name;
  const roomText = room === undefined ? 'It has no room name in the MyDyson app.' : `Its room name in the MyDyson app is "${room}", which other machines in that room share.`;
  return h(
    'section',
    {},
    h('h2', {}, h('label', { for: 'device-name' }, 'Name in Matter')),
    h('p', { class: 'help' }, `${roomText} The name here is what your Matter apps show, up to 32 characters, and no two machines of this plugin share one. A new room name in the MyDyson app does not change it.`),
    h('div', { class: 'inline-form' }, input),
  );
}

function presetSection(draft: Draft, controls: AvailableControls): HTMLElement {
  return h(
    'section',
    { class: 'presets' },
    h('h2', {}, 'Start from a preset'),
    h(
      'div',
      { class: 'preset-list' },
      ...(Object.keys(presets) as PresetName[]).map((name) =>
        h(
          'button',
          { 'type': 'button', 'class': 'preset', 'aria-pressed': String(matchesPreset(draft, name, controls)), 'onclick': () => update(draft, presetExposure(name, controls)) },
          h('strong', {}, presets[name].title),
          h('span', { class: 'meta' }, presets[name].text),
        ),
      ),
    ),
    h('p', { class: 'help' }, 'A preset fills in the choices below for what this machine can do. Change any of them afterwards.'),
  );
}

// An air purifier shows the life left in the filters of a machine that reports it: Matter has filters on an air purifier alone.
function deviceTypeSection(draft: Draft, controls: AvailableControls): HTMLElement {
  const pick = (deviceType: Exposure['deviceType']): void => update(draft, { deviceType });
  const filters = controls.hasFilterLife ? ' and the life left in its filters, which a Matter app can reset after a new one is fitted' : '';
  return h(
    'section',
    {},
    h('h2', {}, 'Appears as'),
    h(
      'div',
      { class: 'choices' },
      choice('device-type', 'airPurifier', draft.deviceType, 'An air purifier', `The Matter device type of a purifier, with its fan speed${filters}. Apple Home, Google Home and Home Assistant show it.`, glyphs.purifier, pick),
      choice('device-type', 'fan', draft.deviceType, 'A fan', `The Matter device type every app shows, with the same fan speed${controls.hasFilterLife ? ', but no filters' : ''}. For apps that show no air purifier.`, glyphs.fan, pick),
    ),
  );
}

function fanSection(draft: Draft, controls: AvailableControls): HTMLElement {
  const pickFan = (fanControl: Exposure['fanControl']): void => update(draft, { fanControl });
  const pickAuto = (fanAutoControl: Exposure['fanAutoControl']): void => update(draft, { fanAutoControl });
  const current = controls.hasAutoMode ? draft.fanAutoControl : 'native';
  const isAutoStep = current === 'firstStep' || current === 'lastStep';
  const speedCount = isAutoStep ? 'Eleven steps: the ten speeds and auto.' : 'Ten steps, one for each speed.';
  return h(
    'section',
    {},
    h('h2', {}, 'Fan speed'),
    h(
      'div',
      { class: 'choices' },
      choice('fan', 'steps', draft.fanControl, 'Steps', `${speedCount} A slider shows them as a percentage too.`, glyphs.steps, pickFan),
      choice('fan', 'percent', draft.fanControl, 'Percentage', 'A slider from 0 to 100, which the plugin rounds to the nearest speed: 10 % is speed 1 and 100 % speed 10.', glyphs.percent, pickFan),
    ),
    controls.hasAutoMode
      ? h(
          'div',
          { class: 'field' },
          h('h3', { id: 'fan-auto-title' }, 'Auto mode'),
          h('p', { class: 'help' }, 'In its auto mode the machine picks the fan speed from the air it measures. Matter has it as the fan mode Auto, which not every app shows.'),
          h(
            'div',
            { 'class': 'choices', 'role': 'radiogroup', 'aria-labelledby': 'fan-auto-title' },
            radio('fan-auto', 'native', current, 'Native fan mode only', 'Auto is a mode of the fan speed, beside its speeds, as Matter has it.', pickAuto),
            radio('fan-auto', 'switch', current, 'A switch', `${placement(draft, 'Auto Mode', true)}. On turns the auto mode on, off goes back to the speed the fan last ran at. Auto stays a fan mode as well.`, pickAuto),
            radio('fan-auto', 'firstStep', current, 'The first step', 'Auto comes below speed 1: step 1, or the bottom of the slider.', pickAuto),
            radio('fan-auto', 'lastStep', current, 'The last step', 'Auto comes above speed 10: the top step, or 100 %.', pickAuto),
          ),
        )
      : null,
  );
}

// Such as "45°, 90° and breeze".
function listAngles(angles: readonly OscillationAngleChoice[]): string {
  const labels = angles.map((angle) => (angle === 'breeze' ? 'breeze' : `${angle}°`));
  return labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

// A machine that tilts breezes up and down in place of oscillating, and tilts to an angle in place of sweeping one.
function tiltSection(draft: Draft): HTMLElement {
  const pick = (oscillationControl: Exposure['oscillationControl']): void => update(draft, { oscillationControl });
  return radioSection(
    'Tilt',
    'The machine tilts to 0°, 25° or 50°, or breezes: it tilts up and down. Tilting turns a machine that is off on, as in the MyDyson app.',
    radio('oscillation', 'native', draft.oscillationControl, 'Native rocking', `The up and down rocking of the fan control, as Matter has it: on breezes, off goes back to the angle it was tilted to. ${fanFeatureSupport}`, pick),
    radio('oscillation', 'switch', draft.oscillationControl, 'A switch', `${placement(draft, 'Oscillation', true)}. On breezes, off goes back to the angle it was tilted to. It takes the place of the rocking of the fan control, which Apple Home mishandles.`, pick),
    radio('oscillation', 'select', draft.oscillationControl, 'A mode select', `${placement(draft, 'Tilt', true)}, and picks 0°, 25°, 50° or breeze. It takes the place of the rocking of the fan control, which Apple Home mishandles. ${selectSupport}`, pick),
  );
}

function oscillationSection(draft: Draft, controls: AvailableControls): Child {
  if (!controls.hasOscillation) return null;
  if (controls.tiltAngles.length > 0) return tiltSection(draft);
  const pick = (oscillationControl: Exposure['oscillationControl']): void => update(draft, { oscillationControl });
  const hasSelect = controls.oscillationAngles.length > 0;
  const current = draft.oscillationControl === 'select' && !hasSelect ? 'switch' : draft.oscillationControl;
  return radioSection(
    'Oscillation',
    '',
    radio('oscillation', 'native', current, 'Native rocking', `The left and right rocking of the fan control, as Matter has it. ${fanFeatureSupport}`, pick),
    radio('oscillation', 'switch', current, 'A switch', `${placement(draft, 'Oscillation', true)}. On sweeps the angle set in the MyDyson app. It takes the place of the rocking of the fan control, which Apple Home mishandles.`, pick),
    hasSelect ? radio('oscillation', 'select', current, 'A mode select', `${placement(draft, 'Oscillation', true)}, and picks off or one of ${listAngles(controls.oscillationAngles)}. It takes the place of the rocking of the fan control, which Apple Home mishandles. ${selectSupport}`, pick) : null,
  );
}

function nightModeSection(draft: Draft): HTMLElement {
  const pick = (nightModeControl: Exposure['nightModeControl']): void => update(draft, { nightModeControl });
  return radioSection(
    'Night mode',
    'In its night mode the machine runs quieter and dims its display.',
    radio('night-mode', 'native', draft.nightModeControl, 'Native sleep wind only', `The sleep wind of the fan control, as Matter has it. ${fanFeatureSupport}`, pick),
    radio('night-mode', 'switch', draft.nightModeControl, 'A switch', `${placement(draft, 'Night Mode', true)}. The night mode stays the sleep wind of the fan control as well.`, pick),
  );
}

function airflowSection(draft: Draft, controls: AvailableControls): Child {
  if (!controls.hasAirflowDirection) return null;
  const pick = (airflowDirectionControl: Exposure['airflowDirectionControl']): void => update(draft, { airflowDirectionControl });
  return radioSection(
    'Airflow direction',
    'The machine blows its air out of the front, or out of the back to circulate the air without cooling you.',
    radio('airflow', 'native', draft.airflowDirectionControl, 'Native airflow direction only', `The airflow direction of the fan control, as Matter has it: forward is the front. ${fanFeatureSupport}`, pick),
    radio('airflow', 'switch', draft.airflowDirectionControl, 'A switch', `${placement(draft, 'Front Airflow', true)}. On blows the air out of the front, off out of the back. The airflow direction of the fan control stays as well.`, pick),
  );
}

function findAndFollowSection(draft: Draft, controls: AvailableControls): Child {
  if (!controls.hasFindAndFollow) return null;
  const pick = (findAndFollowControl: Exposure['findAndFollowControl']): void => update(draft, { findAndFollowControl });
  return radioSection(
    'Find and follow',
    'The machine finds the people in the room and turns to follow them. It runs only while the machine is on, so turning it on turns the machine on.',
    radio('find-and-follow', 'switch', draft.findAndFollowControl, 'A switch', `${placement(draft, 'Find and Follow', true)}. On follows the people the machine finds.`, pick),
    radio('find-and-follow', 'select', draft.findAndFollowControl, 'A mode select', `${placement(draft, 'Find and Follow', true)}, and picks off, follow, or scan to look for people. ${selectSupport}`, pick),
    radio('find-and-follow', 'hidden', draft.findAndFollowControl, 'Not shown in Matter', 'Find and follow stays as the MyDyson app sets it.', pick),
  );
}

function heatSection(draft: Draft, controls: AvailableControls): Child {
  if (!controls.hasHeat) return null;
  const pick = (heatControl: Exposure['heatControl']): void => update(draft, { heatControl });
  return radioSection(
    'Heating',
    'The machine heats only while it is on, so turning the heating on turns the machine on.',
    radio('heat', 'thermostat', draft.heatControl, 'A thermostat', `${placement(draft, 'Heater', false)}: it heats or is off, with a setpoint from 1 to 37 °C. Off leaves the fan running.`, pick),
    radio('heat', 'switch', draft.heatControl, 'A switch', `${placement(draft, 'Heat', true)}. It heats to the setpoint set in the MyDyson app.`, pick),
    radio('heat', 'hidden', draft.heatControl, 'Not shown in Matter', 'The heating stays as the MyDyson app sets it.', pick),
  );
}

function humidifySection(draft: Draft, controls: AvailableControls): Child {
  if (!controls.hasHumidification) return null;
  const pick = (humidificationControl: Exposure['humidificationControl']): void => update(draft, { humidificationControl });
  const autoSwitch = controls.hasAutoHumidification ? ` With a second switch, "Auto Humidify", for the machine to pick the target itself.` : '';
  const autoValue = controls.hasAutoHumidification ? 'off, auto, or a target from 30 to 70 %' : 'off, or a target from 30 to 70 %';
  return radioSection(
    'Humidifying',
    'Matter has no humidifier, so the humidifying takes a switch or a mode select. It runs only while the machine is on, so turning it on turns the machine on.',
    radio('humidify', 'switches', draft.humidificationControl, 'Switches', `${placement(draft, 'Humidify', true)}, and humidifies to the target set in the MyDyson app.${autoSwitch}`, pick),
    radio('humidify', 'select', draft.humidificationControl, 'A mode select', `${placement(draft, 'Target Humidity', true)}, and picks ${autoValue}. ${selectSupport}`, pick),
    radio('humidify', 'hidden', draft.humidificationControl, 'Not shown in Matter', 'The humidifying stays as the MyDyson app sets it.', pick),
  );
}

// Each setting control but the water hardness, which the clean cycle has: its label in Matter, and what it does.
const moreControls: Readonly<Record<Exclude<SettingControlKey, 'hasWaterHardnessSelect'>, { label: string; text: string; isSelect: boolean }>> = {
  hasChildLockSwitch: { label: 'Child Lock', text: 'On locks the buttons of the machine.', isSelect: false },
  hasUvLightSwitch: { label: 'UV Light', text: 'On turns the UV light of the machine on.', isSelect: false },
  hasIoniserSwitch: { label: 'Ioniser', text: 'On turns the ioniser of the machine on.', isSelect: false },
  hasJetFocusSwitch: { label: 'Jet Focus', text: 'On focuses the air into one stream, and off diffuses it.', isSelect: false },
  hasIndirectAirflowSwitch: { label: 'Indirect Airflow', text: 'On tilts the nozzle to 45°, and off points it straight.', isSelect: false },
  hasAirQualityTargetSelect: { label: 'Air Quality Target', text: 'picks the air quality the auto mode aims for: good, sensitive or very sensitive.', isSelect: true },
  hasWickDryingSwitch: { label: 'Wick Drying', text: 'On dries the wick of the humidifier.', isSelect: false },
  hasWickDryingSpeedSelect: { label: 'Wick Drying Speed', text: 'picks how fast the wick dries: slow, normal or fast, in 60, 45 or 30 minutes.', isSelect: true },
};

// The controls of the machine that Matter has no place for beside it, each a switch or a mode select if asked for.
function moreControlsSection(draft: Draft, controls: AvailableControls): Child {
  const keys = (Object.keys(moreControls) as (keyof typeof moreControls)[]).filter((key) => controls.settingControls.includes(key));
  if (keys.length === 0) return null;
  return h(
    'section',
    {},
    h('h2', {}, 'More controls'),
    h('p', { class: 'help' }, 'Controls of this machine that Matter has no place for. As in the MyDyson app, most of them turn a machine that is off on: the air quality target and the wick drying do not.'),
    h(
      'div',
      { class: 'choices' },
      ...keys.map((key) => {
        const { label, text, isSelect } = moreControls[key];
        const title = `Add a ${isSelect ? 'mode select' : 'switch'} for the ${label.toLowerCase().replace('uv', 'UV')}`;
        const meta = isSelect ? `${placement(draft, label, true)}, and ${text} ${selectSupport}` : `${placement(draft, label, true)}. ${text}`;
        return toggle(key, draft[key], title, meta, (isOn) => update(draft, { [key]: isOn }));
      }),
    ),
  );
}

function cleanCycleSection(draft: Draft, controls: AvailableControls): Child {
  if (!controls.settingControls.includes('hasWaterHardnessSelect')) return null;
  return h(
    'section',
    {},
    h('h2', {}, 'Clean cycle'),
    h('p', { class: 'help' }, 'The machine asks for a clean cycle as often as the hardness of its water says: the harder the water, the sooner. The setup page shows when the next one is due.'),
    h(
      'div',
      { class: 'choices' },
      toggle(
        'water-hardness',
        draft.hasWaterHardnessSelect,
        'Add a mode select for the water hardness',
        `${placement(draft, 'Water Hardness', true)}, and picks soft, medium or hard. ${selectSupport}`,
        (hasWaterHardnessSelect) => update(draft, { hasWaterHardnessSelect }),
      ),
    ),
  );
}

// The pollutants of an air quality sensor, as the page names them.
const pollutantNames: readonly (readonly [keyof ReportedSensors, string])[] = [
  ['pm25', 'PM2.5'],
  ['pm10', 'PM10'],
  ['volatileOrganicCompounds', 'VOC'],
  ['nitrogenDioxide', 'NO₂'],
  ['formaldehyde', 'formaldehyde'],
  ['carbonDioxide', 'CO₂'],
];

// Such as "PM2.5, PM10 and VOC", or "temperature or humidity" with another last word.
function listNames(names: readonly string[], last = 'and'): string {
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} ${last} ${names[names.length - 1]}`;
}

// A sensor for the temperature or the humidity is offered once the machine has given that reading: many have neither.
function sensorSection(draft: Draft, controls: AvailableControls): HTMLElement {
  const reported = draft.reportedSensors ?? noReportedSensors;
  const pollutants = pollutantNames.filter(([key]) => reported[key]).map(([, name]) => name);
  const measured = pollutants.length === 0 ? 'each pollutant the machine measures, once it gives it' : `the ${listNames(pollutants)} the machine measures`;
  const missing = [reported.temperature ? '' : 'room temperature', reported.humidity ? '' : 'humidity'].filter((name) => name !== '');
  const help =
    missing.length === 0
      ? 'Each sensor shows what the machine measures.'
      : `This machine has given no ${listNames(missing, 'or')} reading, so there is no sensor for ${missing.length === 1 ? 'it' : 'them'}. If it gives one later, open its options again.`;
  return h(
    'section',
    {},
    h('h2', {}, 'Readings'),
    h('p', { class: 'help' }, help),
    h(
      'div',
      { class: 'choices' },
      controls.hasAirQualitySensor
        ? toggle(
            'air-quality',
            draft.hasAirQualitySensor,
            'Add an air quality sensor',
            `${placement(draft, 'Air Quality', false)}, with the air quality of its worst pollutant and ${measured}.`,
            (hasAirQualitySensor) => update(draft, { hasAirQualitySensor }),
          )
        : null,
      reported.temperature
        ? toggle('temperature', draft.hasTemperatureSensor, 'Add a temperature sensor', `${placement(draft, 'Temperature', false)}, with the room temperature the machine measures.`, (hasTemperatureSensor) =>
            update(draft, { hasTemperatureSensor }),
          )
        : null,
      reported.humidity
        ? toggle('humidity', draft.hasHumiditySensor, 'Add a humidity sensor', `${placement(draft, 'Humidity', false)}, with the room humidity the machine measures.`, (hasHumiditySensor) =>
            update(draft, { hasHumiditySensor }),
          )
        : null,
      controls.hasContinuousMonitoring
        ? toggle(
            'continuous-monitoring',
            draft.hasContinuousMonitoringSwitch,
            'Add a switch for the continuous monitoring',
            `${placement(draft, 'Continuous Monitoring', true)}. On keeps the machine measuring the air while it is off, so that the readings stay fresh.`,
            (hasContinuousMonitoringSwitch) => update(draft, { hasContinuousMonitoringSwitch }),
          )
        : null,
    ),
  );
}

// What the search of the Connect step found, while it ran.
function searchNote(draft: Draft): string {
  const isFound = draft.probe?.isFoundOnLan;
  if (isFound === undefined) return '';
  return isFound ? ' It answered on your network just now.' : ' It was not found on your network just now.';
}

// The host is read as it is typed, with no redraw: no other text on the page names it.
function hostField(draft: Draft): HTMLElement {
  const input = h('input', { type: 'text', id: 'device-host', value: draft.host, placeholder: 'Found on your network', maxLength: 253, autocomplete: 'off', spellcheck: false });
  input.addEventListener('input', () => {
    draft.host = input.value.trim();
  });
  return h(
    'div',
    { class: 'field' },
    h('label', { for: 'device-host' }, 'Host'),
    h(
      'p',
      { class: 'help' },
      'Where the search does not reach the machine, such as in a Docker container without host networking, enter its IP address, ideally one your router keeps for it. Leave it empty to search.',
    ),
    h('div', { class: 'inline-form' }, input),
  );
}

function connectionSection(draft: Draft): HTMLElement {
  const pick = (value: 'lan' | 'cloud'): void => {
    draft.isCloudOnly = value === 'cloud';
    render();
  };
  const current = draft.isCloudOnly ? 'cloud' : 'lan';
  return h(
    'section',
    {},
    h('h2', { id: 'connection-title' }, 'Connection'),
    h('p', { class: 'help' }, `How the plugin reaches the machine.${searchNote(draft)}`),
    h(
      'div',
      { 'class': 'choices', 'role': 'radiogroup', 'aria-labelledby': 'connection-title' },
      radio(
        'connection',
        'lan',
        current,
        'Your network, then the Dyson cloud',
        'The plugin finds the machine on your network by the service it announces there, and reaches it through the Dyson cloud when it does not answer. It searches again on each connection, so it follows the machine to a new IP address.',
        pick,
      ),
      radio('connection', 'cloud', current, 'The Dyson cloud only', 'For a machine that is not on the network of Matterbridge: each connection skips the search of up to 3 seconds.', pick),
    ),
    draft.isCloudOnly ? null : hostField(draft),
  );
}

function composedSection(draft: Draft): HTMLElement {
  const main = draft.deviceType === 'airPurifier' ? 'the air purifier' : 'the fan';
  return h(
    'section',
    {},
    h('h2', {}, 'One device or several'),
    h('p', { class: 'help' }, `The thermostat, the switches, the mode selects and the sensors can be parts of ${main} in Matter, or devices of their own beside it.`),
    h(
      'div',
      { class: 'choices' },
      toggle(
        'composed',
        draft.isComposed,
        `Make them parts of ${main}`,
        `Your Matter app has one device, "${draft.name}", and they move between rooms with it. A part has no name of its own in Matter, so an app may show the switches as numbered outlets, and an app that shows no parts shows ${main} alone. Turned off, each is a device of its own with its own name, which your app puts in a room by itself.`,
        (isComposed) => update(draft, { isComposed }),
      ),
    ),
  );
}

export function optionsScreen(): Child[] {
  const draft = currentDraft();
  if (draft === undefined) return [notice()];
  const controls = draft.controls ?? noControls;
  return [
    steps(),
    unitStrip(),
    unitHeader(draft, `Options for the ${machineLabel(draft.machine)}. Power and fan speed always appear in Matter: choose how the rest appears.`),
    nameSection(draft),
    presetSection(draft, controls),
    deviceTypeSection(draft, controls),
    fanSection(draft, controls),
    oscillationSection(draft, controls),
    nightModeSection(draft),
    airflowSection(draft, controls),
    findAndFollowSection(draft, controls),
    heatSection(draft, controls),
    humidifySection(draft, controls),
    cleanCycleSection(draft, controls),
    moreControlsSection(draft, controls),
    sensorSection(draft, controls),
    composedSection(draft),
    connectionSection(draft),
    draft.isNew ? null : h('p', { class: 'help' }, 'Changing any of these but the connection rebuilds this machine in Matter. Your Matter app may take a moment to show the change.'),
    notice(),
    h('div', { class: 'footer' }, button('Cancel', goHome), button(draft.isNew ? `Add ${draft.name}` : 'Save options', () => void saveDraft(draft), 'primary')),
  ];
}
