/**
 * @file apps/frontend/src/screens/connect.ts
 * @description The Connect step: the page checks that a machine answers through the Dyson cloud.
 * @author Calvin Che
 * @license Apache-2.0
 */

import { check, goHome, skipDraft, startSignIn } from '../actions.js';
import { button, notice, steps, unitHeader, unitStrip } from '../components.js';
import { type Child, h } from '../dom.js';
import { currentDraft, type Draft, machineLabel, view } from '../state.js';

/** What stands in the way of the machine, or what the page needs before it can go on: nothing while the check has no answer. */
function statusPanel(draft: Draft): Child {
  const status = draft.probe?.status;
  const label = draft.name === '' ? 'The machine' : draft.name;
  if (status === 'signInRequired') {
    return h(
      'div',
      { class: 'field' },
      h('p', { class: 'notice problem', role: 'alert' }, 'The Dyson cloud no longer accepts the sign-in of this plugin.'),
      button('Sign in again', () => void startSignIn(), 'primary'),
    );
  }
  if (status === 'unreachable') {
    return h('p', { class: 'notice problem', role: 'alert' }, `${label} did not answer. Check that it is plugged in and shows as online in the Dyson app, then try again.`);
  }
  if (status === 'unsupported') return h('p', { class: 'notice problem', role: 'alert' }, `The plugin cannot control ${label}: ${draft.probe?.message ?? 'unknown'}`);
  if (status === 'failed') return h('p', { class: 'notice problem', role: 'alert' }, `${label} answered with an error: ${draft.probe?.message ?? 'unknown'}`);
  return null;
}

export function connectScreen(): Child[] {
  const draft = currentDraft();
  if (draft === undefined) return [notice()];
  const canRetry = draft.probe?.status === 'unreachable' || draft.probe?.status === 'failed' || view.error !== '';
  const isOneOfMany = draft.isNew && view.queue.length > 1;
  return [
    steps(),
    unitStrip(),
    unitHeader(draft, `Connecting to the ${machineLabel(draft.machine)} through the Dyson cloud.`),
    notice(),
    view.isBusy ? null : statusPanel(draft),
    h('div', { class: 'footer' }, canRetry ? button('Try again', () => void check(draft)) : null, button(isOneOfMany ? 'Skip this one' : 'Cancel', isOneOfMany ? skipDraft : goHome)),
  ];
}
