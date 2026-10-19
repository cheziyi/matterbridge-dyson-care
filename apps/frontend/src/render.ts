/**
 * @file apps/frontend/src/render.ts
 * @description Draws the screen the setup page is on. The screens are handed in by app.ts, so that they and the
 * actions can call for a redraw without this file depending on them.
 * @author Calvin Che
 * @license Apache-2.0
 */

import type { Child } from './dom.js';
import { currentDraft, type ScreenName, view } from './state.js';

export type Screens = Record<ScreenName, () => Child[]>;

let screens: Screens | undefined;

/** Tell the page what each screen draws. */
export function setScreens(all: Screens): void {
  screens = all;
}

export function render(): void {
  const root = document.getElementById('app');
  if (root === null || screens === undefined) return;
  // Keep what the user is typing when the same form redraws around it, and never carry it over to another form.
  const form = `${view.screen}:${currentDraft()?.machine.serialNumber ?? ''}`;
  const isSameForm = root.dataset.form === form;
  const activeId = document.activeElement instanceof HTMLElement ? document.activeElement.id : '';
  const typed = new Map<string, string>();
  for (const input of root.querySelectorAll<HTMLInputElement>('input[type=text], input[type=email], input[type=password]')) {
    if (input.id !== '') typed.set(input.id, input.value);
  }
  root.replaceChildren(...screens[view.screen]().filter((child): child is Node | string => child !== false && child !== null && child !== undefined));
  root.dataset.form = form;
  if (!isSameForm) return;
  for (const [id, value] of typed) {
    const input = document.getElementById(id);
    if (input instanceof HTMLInputElement) input.value = value;
  }
  if (activeId !== '') document.getElementById(activeId)?.focus();
}
