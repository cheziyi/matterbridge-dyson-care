/**
 * @file apps/frontend/src/screens/find.ts
 * @description The Find step: the machines of the Dyson account, and which of them to set up.
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

import { goHome, search, startQueue } from '../actions.js';
import type { ListedMachine } from '../api.js';
import { button, notice, steps } from '../components.js';
import { type Child, h } from '../dom.js';
import { draftsFromMachines } from '../exposure.js';
import { render } from '../render.js';
import { productLabel, view } from '../state.js';

function isSelectable(machine: ListedMachine): boolean {
  return !machine.isConfigured && machine.support === 'supported';
}

function notesOf(machine: ListedMachine): string[] {
  const notes: string[] = [];
  if (machine.isConfigured) notes.push('Already set up.');
  if (machine.support === 'otherCategory') notes.push('Not a purifier, fan, heater or humidifier: the plugin does not control it.');
  if (machine.support === 'unknownType') notes.push(`The plugin does not know machines of type ${machine.type} yet.`);
  if (machine.support === 'otherBroker') notes.push('It is reached through a Dyson cloud service the plugin cannot connect to yet.');
  return notes;
}

function machineRow(machine: ListedMachine): HTMLElement {
  const isAvailable = isSelectable(machine);
  const id = `machine-${machine.serialNumber}`;
  const checkbox = h('input', {
    type: 'checkbox',
    id,
    checked: isAvailable && view.selected.has(machine.serialNumber),
    disabled: !isAvailable,
    onchange: () => {
      if (checkbox.checked) view.selected.add(machine.serialNumber);
      else view.selected.delete(machine.serialNumber);
      render();
    },
  });
  return h(
    'li',
    { class: isAvailable ? 'found' : 'found unavailable' },
    h(
      'label',
      { for: id },
      checkbox,
      h(
        'span',
        {},
        h('strong', {}, machine.name ?? 'No room name'),
        h('span', { class: 'meta' }, ` ${productLabel(machine)}, ${machine.serialNumber}`),
        ...notesOf(machine).map((note) => h('span', { class: 'meta note' }, note)),
      ),
    ),
  );
}

export function findScreen(): Child[] {
  const chosen = view.machines.filter((machine) => view.selected.has(machine.serialNumber) && isSelectable(machine));
  const continueLabel = chosen.length === 1 ? 'Set up 1 machine' : `Set up ${chosen.length} machines`;
  return [
    steps(),
    h('header', {}, h('h1', {}, 'Your Dyson machines')),
    notice(),
    view.machines.length > 0 ? h('ul', { class: 'found-list' }, ...view.machines.map(machineRow)) : null,
    !view.isBusy && view.machines.length === 0 && view.error === ''
      ? h('p', { class: 'empty' }, 'Your Dyson account has no machine yet. Add your machines in the MyDyson app, then read the list again.')
      : null,
    h(
      'div',
      { class: 'footer' },
      button('Read the list again', () => void search()),
      button('Cancel', goHome),
      button(continueLabel, () => startQueue(draftsFromMachines(chosen)), 'primary', chosen.length === 0),
    ),
  ];
}
