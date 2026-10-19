/**
 * @file apps/frontend/src/app.ts
 * @description The guided setup page of the Matterbridge Dyson Care plugin. Matterbridge serves it at
 * /plugins/matterbridge-dyson-care/ and it talks to the plugin through api/<path> below that address.
 * This file starts the page: the rest is in the files next to it.
 * @author Calvin Che
 * @license Apache-2.0
 */

import { loadState } from './actions.js';
import { h } from './dom.js';
import { render, setScreens } from './render.js';
import { connectScreen } from './screens/connect.js';
import { doneScreen } from './screens/done.js';
import { findScreen } from './screens/find.js';
import { homeScreen } from './screens/home.js';
import { optionsScreen } from './screens/options.js';
import { signInScreen } from './screens/signIn.js';
import { adoptHostTheme } from './theme.js';

setScreens({
  loading: () => [h('p', { class: 'notice working', role: 'status' }, h('span', { class: 'spinner' }), 'Loading…')],
  home: homeScreen,
  signIn: signInScreen,
  find: findScreen,
  connect: connectScreen,
  options: optionsScreen,
  done: doneScreen,
});

adoptHostTheme();
render();
void loadState();
