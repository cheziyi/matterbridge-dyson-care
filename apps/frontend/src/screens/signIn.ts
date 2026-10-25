/**
 * @file apps/frontend/src/screens/signIn.ts
 * @description The Sign in step: the address and the country of the Dyson account, then the code Dyson emails and the password, or the password alone.
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

import { goHome, requestCode, signIn } from '../actions.js';
import { button, notice } from '../components.js';
import { type Child, h } from '../dom.js';
import { render } from '../render.js';
import { view } from '../state.js';

// Mainland China has a cloud of its own: every other country is on the global one.
const chinaNote = 'An account in mainland China is on a Dyson cloud of its own: pick China for it.';

function countryField(): HTMLElement {
  const current = view.signIn.country === '' ? 'US' : view.signIn.country;
  // A text field when the cloud did not list its countries: two letters, such as GB.
  const field =
    view.countries.length === 0
      ? h('input', { type: 'text', id: 'country', value: current, maxLength: 2, autocomplete: 'country', spellcheck: false })
      : h('select', { id: 'country' }, ...view.countries.map((code) => h('option', { value: code, selected: code === current }, countryName(code))));
  return h('div', { class: 'field' }, h('label', { for: 'country' }, 'Country of the account'), h('p', { class: 'help' }, chinaNote), field);
}

/** The name of a country in the language of the browser, such as United Kingdom for GB, or its code when there is none. */
function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function addressForm(): Child[] {
  const email = h('input', { type: 'email', id: 'email', value: view.signIn.email, autocomplete: 'username', spellcheck: false });
  const submit = (): void => {
    const country = document.getElementById('country');
    const code = country instanceof HTMLInputElement || country instanceof HTMLSelectElement ? country.value.trim().toUpperCase() : '';
    if (email.value.trim() === '' || code === '') return;
    void requestCode(email.value.trim(), code);
  };
  return [
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'email' }, 'Email address'),
      h('p', { class: 'help' }, 'The address you sign in to the MyDyson app with. Dyson emails it a code, unless the account signs in with its password alone.'),
      email,
    ),
    countryField(),
    h('div', { class: 'footer' }, button('Cancel', goHome), button('Continue', submit, 'primary')),
  ];
}

function passwordField(password: HTMLInputElement): HTMLElement {
  return h(
    'div',
    { class: 'field' },
    h('label', { for: 'password' }, 'Password of the account'),
    h('p', { class: 'help' }, 'It is used once to sign in and is not stored.'),
    password,
  );
}

function anotherAddressButton(): HTMLButtonElement {
  return button('Use another address', () => {
    view.signIn = { email: view.signIn.email, country: view.signIn.country };
    view.error = '';
    render();
  });
}

function codeForm(): Child[] {
  const code = h('input', { type: 'text', id: 'otp-code', inputMode: 'numeric', autocomplete: 'one-time-code', spellcheck: false, maxLength: 16 });
  const password = h('input', { type: 'password', id: 'password', autocomplete: 'current-password', maxLength: 256 });
  const submit = (): void => {
    if (code.value.trim() === '' || password.value === '') return;
    void signIn(password.value, code.value.trim());
  };
  password.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
  });
  return [
    h('p', { class: 'lead' }, `Dyson emailed a code to ${view.signIn.email}. It can take a minute to arrive.`),
    h('div', { class: 'field' }, h('label', { for: 'otp-code' }, 'Code from the email'), code),
    passwordField(password),
    h(
      'div',
      { class: 'footer' },
      anotherAddressButton(),
      button('Send a new code', () => void requestCode(view.signIn.email, view.signIn.country)),
      button('Sign in', submit, 'primary'),
    ),
  ];
}

// An account that signs in with its password alone is emailed no code.
function passwordForm(): Child[] {
  const password = h('input', { type: 'password', id: 'password', autocomplete: 'current-password', maxLength: 256 });
  const submit = (): void => {
    if (password.value === '') return;
    void signIn(password.value);
  };
  password.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
  });
  return [
    h('p', { class: 'lead' }, `${view.signIn.email} signs in to Dyson with its password alone.`),
    passwordField(password),
    h('div', { class: 'footer' }, anotherAddressButton(), button('Sign in', submit, 'primary')),
  ];
}

export function signInScreen(): Child[] {
  const isAgain = view.setup?.account !== undefined;
  return [
    h('header', {}, h('h1', {}, isAgain ? 'Sign in to Dyson again' : 'Sign in to Dyson')),
    h(
      'p',
      { class: 'lead' },
      'Dyson machines are reached through the Dyson cloud, with your Dyson account. The plugin keeps the sign-in Dyson gives it in its configuration, and never your password.',
    ),
    notice(),
    ...(view.signIn.challengeId === undefined ? addressForm() : view.signIn.challengeId === null ? passwordForm() : codeForm()),
  ];
}
