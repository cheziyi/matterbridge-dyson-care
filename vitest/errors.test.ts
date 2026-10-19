/**
 * @file vitest/errors.test.ts
 * @description This file contains the tests for the helpers that describe errors.
 * @author Calvin Che
 */

import { DysonError } from 'dyson-control';

import { describeSignInFailure, getErrorMessage, getErrorStatus, isSignInRequired } from '../src/errors.js';

describe('errors', () => {
  it('should describe an error by its message, and anything else by its string form', () => {
    expect(getErrorMessage(new Error('Broken'))).toBe('Broken');
    expect(getErrorMessage('down')).toBe('down');
  });

  it('should read the status of a Dyson error alone', () => {
    expect(getErrorStatus(new DysonError('Unauthorized', 401))).toBe(401);
    expect(getErrorStatus(new Error('Broken'))).toBeUndefined();
    expect(isSignInRequired(new DysonError('Unauthorized', 401))).toBe(true);
    expect(isSignInRequired(new DysonError('Timed out', 504))).toBe(false);
  });

  it('should explain a failed sign in by its status, and keep the status', () => {
    const failed = (status: number, step: 'code' | 'login'): string => describeSignInFailure(new DysonError('Dyson request failed', status), step);
    expect(failed(401, 'code')).toMatch(/^Dyson refused the address: .* \(HTTP 401\)$/);
    expect(failed(401, 'login')).toBe('Dyson did not accept the password or the code: check both, or ask for a new code (HTTP 401)');
    expect(failed(429, 'code')).toBe('Dyson was asked for this moments ago: wait a minute, then try again (HTTP 429)');
    expect(failed(504, 'login')).toBe('The Dyson cloud did not answer: check that Matterbridge reaches the internet, then try again (HTTP 504)');
    expect(failed(503, 'code')).toMatch(/^The Dyson cloud did not answer: .* \(HTTP 503\)$/);
    expect(failed(500, 'code')).toBe('The Dyson cloud could not handle the request: try again later (HTTP 500)');
    expect(describeSignInFailure(new Error('Broken'), 'code')).toBe('Broken');
  });
});
