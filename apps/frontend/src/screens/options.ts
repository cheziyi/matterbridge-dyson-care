/**
 * @file apps/frontend/src/screens/options.ts
 * @description The Options step: how the fan, its auto mode, oscillation and night mode, the heating, the humidifying and the readings of a machine appear in Matter, one section each, and whether as one device.
 * @author Calvin Che
 * @license Apache-2.0
 */

import { goHome, saveDraft } from '../actions.js';
import type { AvailableControls, Exposure, OscillationAngleChoice, ReportedSensors } from '../api.js';
import { button, notice, steps, unitHeader, unitStrip } from '../components.js';
import { type Child, h } from '../dom.js';
import { noControls, noReportedSensors } from '../exposure.js';
import { matchesPreset, presetExposure, type PresetName, presets } from '../presets.js';
import { render } from '../render.js';
import { currentDraft, type Draft, productLabel } from '../state.js';

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

function update(draft: Draft, change: Partial<Draft>): void {
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

// Written to the draft as it is typed, without a redraw: leaving the field for the Save button would otherwise redraw
// the page under the click, which then reaches no button. The other mentions of the name follow at the next redraw.
function nameSection(draft: Draft): HTMLElement {
  const input = h('input', { type: 'text', id: 'device-name', value: draft.name, maxLength: 32, autocomplete: 'off', spellcheck: false });
  input.addEventListener('input', () => {
    draft.name = input.value.trim();
  });
  const room = draft.machine.name;
  const roomText = room === undefined ? 'It has no room name in the Dyson app.' : `Its room name in the Dyson app is "${room}", which other machines in that room share.`;
  return h(
    'section',
    {},
    h('h2', {}, h('label', { for: 'device-name' }, 'Name in Matter')),
    h('p', { class: 'help' }, `${roomText} The name here is what your Matter apps show, up to 32 characters, and no two machines of this plugin share one. A new room name in the Dyson app does not change it.`),
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

function deviceTypeSection(draft: Draft): HTMLElement {
  const pick = (deviceType: Exposure['deviceType']): void => update(draft, { deviceType });
  return h(
    'section',
    {},
    h('h2', {}, 'Appears as'),
    h(
      'div',
      { class: 'choices' },
      choice('device-type', 'airPurifier', draft.deviceType, 'An air purifier', 'The Matter device type of a purifier, with its fan speed. Apple Home, Google Home and Home Assistant show it.', glyphs.purifier, pick),
      choice('device-type', 'fan', draft.deviceType, 'A fan', 'The Matter device type every app shows, with the same fan speed. For apps that show no air purifier.', glyphs.fan, pick),
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

function oscillationSection(draft: Draft, controls: AvailableControls): Child {
  if (!controls.hasOscillation) return null;
  const pick = (oscillationControl: Exposure['oscillationControl']): void => update(draft, { oscillationControl });
  const hasSelect = controls.oscillationAngles.length > 0;
  const current = draft.oscillationControl === 'select' && !hasSelect ? 'switch' : draft.oscillationControl;
  return radioSection(
    'Oscillation',
    '',
    radio('oscillation', 'native', current, 'On the fan', `The left and right rocking of the fan control, as Matter has it. ${fanFeatureSupport}`, pick),
    radio('oscillation', 'switch', current, 'A switch', `${placement(draft, 'Oscillation', true)}. On sweeps the angle set in the Dyson app.`, pick),
    hasSelect ? radio('oscillation', 'select', current, 'A mode select', `${placement(draft, 'Oscillation', true)}, and picks off or one of ${listAngles(controls.oscillationAngles)}. ${selectSupport}`, pick) : null,
    radio('oscillation', 'hidden', current, 'Not shown in Matter', 'The oscillation stays as the Dyson app sets it.', pick),
  );
}

function nightModeSection(draft: Draft): HTMLElement {
  const pick = (nightModeControl: Exposure['nightModeControl']): void => update(draft, { nightModeControl });
  return radioSection(
    'Night mode',
    'In its night mode the machine runs quieter and dims its display.',
    radio('night-mode', 'native', draft.nightModeControl, 'On the fan', `The sleep wind of the fan control, as Matter has it. ${fanFeatureSupport}`, pick),
    radio('night-mode', 'switch', draft.nightModeControl, 'A switch', `${placement(draft, 'Night Mode', true)}.`, pick),
    radio('night-mode', 'hidden', draft.nightModeControl, 'Not shown in Matter', 'The night mode stays as the Dyson app sets it.', pick),
  );
}

function airflowSection(draft: Draft, controls: AvailableControls): Child {
  if (!controls.hasAirflowDirection) return null;
  const pick = (airflowDirectionControl: Exposure['airflowDirectionControl']): void => update(draft, { airflowDirectionControl });
  return radioSection(
    'Airflow direction',
    'The machine blows its air out of the front, or out of the back to circulate the air without cooling you.',
    radio('airflow', 'native', draft.airflowDirectionControl, 'On the fan', `The airflow direction of the fan control, as Matter has it: forward is the front. ${fanFeatureSupport}`, pick),
    radio('airflow', 'switch', draft.airflowDirectionControl, 'A switch', `${placement(draft, 'Front Airflow', true)}. On blows the air out of the front, off out of the back.`, pick),
    radio('airflow', 'hidden', draft.airflowDirectionControl, 'Not shown in Matter', 'The direction stays as the Dyson app sets it.', pick),
  );
}

function heatSection(draft: Draft, controls: AvailableControls): Child {
  if (!controls.hasHeat) return null;
  const pick = (heatControl: Exposure['heatControl']): void => update(draft, { heatControl });
  return radioSection(
    'Heating',
    'The machine heats only while it is on, so turning the heating on turns the machine on.',
    radio('heat', 'thermostat', draft.heatControl, 'A thermostat', `${placement(draft, 'Heater', false)}: it heats or is off, with a setpoint from 1 to 37 °C. Off leaves the fan running.`, pick),
    radio('heat', 'switch', draft.heatControl, 'A switch', `${placement(draft, 'Heat', true)}. It heats to the setpoint set in the Dyson app.`, pick),
    radio('heat', 'hidden', draft.heatControl, 'Not shown in Matter', 'The heating stays as the Dyson app sets it.', pick),
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
    radio('humidify', 'switches', draft.humidificationControl, 'Switches', `${placement(draft, 'Humidify', true)}, and humidifies to the target set in the Dyson app.${autoSwitch}`, pick),
    radio('humidify', 'select', draft.humidificationControl, 'A mode select', `${placement(draft, 'Target Humidity', true)}, and picks ${autoValue}. ${selectSupport}`, pick),
    radio('humidify', 'hidden', draft.humidificationControl, 'Not shown in Matter', 'The humidifying stays as the Dyson app sets it.', pick),
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
    unitHeader(draft, `Options for the ${productLabel(draft.machine)} ${draft.machine.serialNumber}. Power and fan speed always appear in Matter: choose how the rest appears.`),
    nameSection(draft),
    presetSection(draft, controls),
    deviceTypeSection(draft),
    fanSection(draft, controls),
    oscillationSection(draft, controls),
    nightModeSection(draft),
    airflowSection(draft, controls),
    heatSection(draft, controls),
    humidifySection(draft, controls),
    sensorSection(draft, controls),
    composedSection(draft),
    draft.isNew ? null : h('p', { class: 'help' }, 'Changing any of these rebuilds this machine in Matter. Your Matter app may take a moment to show the change.'),
    notice(),
    h('div', { class: 'footer' }, button('Cancel', goHome), button(draft.isNew ? `Add ${draft.name}` : 'Save options', () => void saveDraft(draft), 'primary')),
  ];
}
