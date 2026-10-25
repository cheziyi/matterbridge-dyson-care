/**
 * @file src/errors.ts
 * @description This file contains the helpers that describe errors.
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

import { DysonError } from 'dyson-control';

/** The status of a call the cloud refused the account's credentials for: the account has to be signed in again. */
export const signInRequiredStatus = 401;

/**
 * Describe an error in one line
 *
 * @param {unknown} error The error.
 * @returns {string} Its message, or its string form when it is not an Error.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Get the status of a failed call to the Dyson cloud, its broker or a machine
 *
 * @param {unknown} error The error.
 * @returns {number | undefined} The `httpStatusCode` of a `DysonError`, such as 401 or 504, or undefined for any other error.
 */
export function getErrorStatus(error: unknown): number | undefined {
  return error instanceof DysonError ? error.httpStatusCode : undefined;
}

/** A step of the sign in: the request for a login code, the login with it, or the login with the password alone. */
export type SignInStep = 'code' | 'login' | 'password';

/**
 * Describe a failed step of the sign in in words the setup page can show
 *
 * The cloud answers a refusal with a status and no reason, so the reason is read from the status, and the status is
 * kept for whoever has to look further.
 *
 * Edge cases:
 *  - 429 -> asked again too soon
 *  - 503 or 504 -> the cloud did not answer
 *  - any other 4xx -> the address, the password and the code, or the password alone refused
 *  - any other status -> the cloud failed
 *  - an error without a status -> its own message
 *
 * @param {unknown} error The error the step rejected with.
 * @param {SignInStep} step The step that failed.
 * @returns {string} What went wrong and what to do, with the HTTP status, such as `... (HTTP 401)`.
 */
export function describeSignInFailure(error: unknown, step: SignInStep): string {
  const status = getErrorStatus(error);
  if (status === undefined) return getErrorMessage(error);
  let reason = 'The Dyson cloud could not handle the request: try again later';
  if (status === 429) reason = 'Dyson was asked for this moments ago: wait a minute, then try again';
  else if (status === 503 || status === 504) reason = 'The Dyson cloud did not answer: check that Matterbridge reaches the internet, then try again';
  else if (status >= 400 && status < 500 && step === 'code') {
    reason = 'Dyson refused the address: check that it is the email address you sign in to the MyDyson app with. An account that signs in with a mobile number is not supported';
  } else if (status >= 400 && status < 500 && step === 'password') reason = 'Dyson did not accept the password: check it';
  else if (status >= 400 && status < 500) reason = 'Dyson did not accept the password or the code: check both, or ask for a new code';
  return `${reason} (HTTP ${status})`;
}

/**
 * Tell whether a call failed because the cloud no longer accepts the account
 *
 * @param {unknown} error The error.
 * @returns {boolean} True for a `DysonError` with status 401.
 */
export function isSignInRequired(error: unknown): boolean {
  return getErrorStatus(error) === signInRequiredStatus;
}
