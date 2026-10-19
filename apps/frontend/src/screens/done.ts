/**
 * @file apps/frontend/src/screens/done.ts
 * @description The screen a run ends on: what it set up.
 * @author Calvin Che
 * @license Apache-2.0
 */

import { goHome, reloadNote } from '../actions.js';
import { button } from '../components.js';
import { type Child, h } from '../dom.js';
import { view } from '../state.js';

export function doneScreen(): Child[] {
  const names = view.saved;
  return [
    h('header', {}, h('h1', {}, names.length === 1 ? `${names[0]} is set up` : `${names.length} machines are set up`)),
    h('p', { class: 'lead' }, 'They now appear in the Matter apps paired with Matterbridge. If Matterbridge is not paired yet, pair it from its home page.'),
    h('p', { class: 'help' }, reloadNote),
    h('div', { class: 'footer' }, button('Done', goHome, 'primary')),
  ];
}
