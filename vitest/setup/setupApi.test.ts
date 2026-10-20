/**
 * @file vitest/setup/setupApi.test.ts
 * @description This file contains the tests for the REST API of the setup page.
 * @author Calvin Che
 */

/* oxlint-disable unicorn/no-useless-undefined */

import type { ProbeResult } from '../../src/setup/probe.js';
import { getMachineReport, handleSetupRequest, parseDysonMachine, type SetupPlatform } from '../../src/setup/setupApi.js';
import { coolLink, createDeviceConfig, createFakeClient, humidifyCool, purifierCool } from '../fakeDyson.js';

const state = { devices: [] };
const ready: ProbeResult = { status: 'ready', machine: purifierCool };
const signIn = { email: 'someone@example.com', country: 'gb', password: 'secret', challengeId: 'challenge-1', otpCode: ' 123456 ' };

const platform = {
  getSetupState: vi.fn(async () => state),
  getCountries: vi.fn(async () => ['GB', 'US']),
  requestLoginCode: vi.fn(async () => 'challenge-1'),
  signIn: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  listMachines: vi.fn(async () => [{ ...purifierCool, isConfigured: false, hasDuplicateName: false, support: 'supported' as const }]),
  syncMachines: vi.fn(async () => {}),
  probe: vi.fn(async () => ready),
  saveDevice: vi.fn(async () => {}),
  removeDevice: vi.fn(async () => true),
} satisfies { [K in keyof SetupPlatform]: unknown };

describe('setupApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should report the filters, the clean cycle and the faults a machine tells', () => {
    expect(getMachineReport(undefined, undefined)).toBeUndefined();
    expect(getMachineReport(undefined, ['filterReplacement'])).toEqual({ filters: [], faults: ['filterReplacement'] });
    expect(getMachineReport(createFakeClient(purifierCool).state, undefined)).toEqual({ filters: [] });
    const humidifier = { ...createFakeClient(humidifyCool).state, outerFilterLifeInPercent: 84.6, innerFilterLifeInPercent: 60, cleanCycleState: 'notInCleanCycle' as const };
    expect(getMachineReport(humidifier, [])).toEqual({
      filters: [
        { filter: 'outerFilter', lifeInPercent: 85 },
        { filter: 'innerFilter', lifeInPercent: 60 },
      ],
      cleanCycle: { state: 'notInCleanCycle', remainingTimeToNextInHours: null, remainingTimeOfActiveInMinutes: null },
      faults: [],
    });
    // A machine that reports the hours to its next clean cycle alone has one too.
    expect(getMachineReport({ ...humidifier, cleanCycleState: null, remainingTimeToNextCleanCycleInHours: 120 }, undefined)?.cleanCycle).toEqual({
      state: null,
      remainingTimeToNextInHours: 120,
      remainingTimeOfActiveInMinutes: null,
    });
    expect(getMachineReport({ ...createFakeClient(coolLink).state, filterLifeInHours: 2150 }, undefined)).toEqual({ filters: [{ filter: 'filter', lifeInPercent: 50 }] });
    // A humidifier that dries its wick says so, and how long it has left when it tells.
    expect(getMachineReport({ ...humidifier, wickDryingState: 'wickDrying', wickDryingTimeRemainingInMinutes: 20 }, undefined)?.wickDrying).toEqual({ remainingTimeInMinutes: 20 });
    expect(getMachineReport({ ...humidifier, wickDryingState: 'idle' }, undefined)?.wickDrying).toBeUndefined();
  });

  it('should read the machine a request is about', () => {
    expect(parseDysonMachine({ ...purifierCool, variant: 'M', firmwareCapabilities: ['A', 1], extra: true })).toEqual({
      ...purifierCool,
      variant: 'M',
      firmwareCapabilities: ['A'],
    });
    expect(parseDysonMachine({ serialNumber: 'NK6', type: '438', name: '  ' })).toEqual({ serialNumber: 'NK6', type: '438', category: 'environmentalCare' });
    expect(parseDysonMachine({ serialNumber: 'NK6 EU', type: '438' })).toBeUndefined();
    expect(parseDysonMachine({ serialNumber: 'NK6' })).toBeUndefined();
    expect(parseDysonMachine(undefined)).toBeUndefined();
  });

  it('should return the state and the countries', async () => {
    expect(await handleSetupRequest(platform, 'GET', 'state')).toEqual({ ok: true, state });
    expect(await handleSetupRequest(platform, 'GET', 'countries')).toEqual({ ok: true, countries: ['GB', 'US'] });
  });

  it('should leave a path it does not serve to Matterbridge', async () => {
    expect(await handleSetupRequest(platform, 'GET', 'nothing')).toBeUndefined();
    expect(await handleSetupRequest(platform, 'GET')).toBeUndefined();
    expect(await handleSetupRequest(platform, 'POST')).toBeUndefined();
    expect(await handleSetupRequest(platform, 'POST', 'nothing', {}, {})).toBeUndefined();
    expect(await handleSetupRequest(platform, 'PUT', 'state')).toBeUndefined();
    expect(await handleSetupRequest(platform, 'DELETE', 'state')).toBeUndefined();
  });

  it('should ask for a login code with a valid address and country', async () => {
    expect(await handleSetupRequest(platform, 'POST', 'login-code', {}, { email: ' someone@example.com ', country: 'gb' })).toEqual({ ok: true, challengeId: 'challenge-1' });
    expect(platform.requestLoginCode).toHaveBeenCalledWith('someone@example.com', 'GB');
    expect(await handleSetupRequest(platform, 'POST', 'login-code', {}, { email: 'someone', country: 'GB' })).toEqual({
      ok: false,
      error: 'Enter the email address of your Dyson account',
    });
    expect(await handleSetupRequest(platform, 'POST', 'login-code', {}, { email: 'someone@example.com', country: 'GBR' })).toEqual({
      ok: false,
      error: 'Pick the country of your Dyson account',
    });
    expect(platform.requestLoginCode).toHaveBeenCalledTimes(1);
  });

  it('should sign in with the code and the password', async () => {
    expect(await handleSetupRequest(platform, 'POST', 'login', {}, signIn)).toEqual({ ok: true, state });
    expect(platform.signIn).toHaveBeenCalledWith({ email: 'someone@example.com', country: 'GB', password: 'secret', challengeId: 'challenge-1', otpCode: '123456' });
  });

  it('should say what a sign in lacks', async () => {
    const failed = async (change: Record<string, unknown>): Promise<unknown> => handleSetupRequest(platform, 'POST', 'login', {}, { ...signIn, ...change });
    expect(await failed({ email: 1 })).toEqual({ ok: false, error: 'Enter the email address of your Dyson account' });
    expect(await failed({ country: undefined })).toEqual({ ok: false, error: 'Pick the country of your Dyson account' });
    expect(await failed({ password: '' })).toEqual({ ok: false, error: 'Enter the password of your Dyson account' });
    expect(await failed({ challengeId: undefined })).toEqual({ ok: false, error: 'Ask for a new code: this sign in has no code to check' });
    expect(await failed({ otpCode: '12' })).toEqual({ ok: false, error: 'Enter the code Dyson emailed you' });
    expect(await failed({ otpCode: 123456 })).toEqual({ ok: false, error: 'Enter the code Dyson emailed you' });
    expect(platform.signIn).not.toHaveBeenCalled();
  });

  it('should sign out', async () => {
    expect(await handleSetupRequest(platform, 'DELETE', 'account')).toEqual({ ok: true });
    expect(platform.signOut).toHaveBeenCalledTimes(1);
  });

  it('should list the machines of the account', async () => {
    expect(await handleSetupRequest(platform, 'POST', 'machines')).toEqual({
      ok: true,
      machines: [{ ...purifierCool, isConfigured: false, hasDuplicateName: false, support: 'supported' }],
    });
  });

  it('should read the machine list again, and answer with the state it leaves', async () => {
    expect(await handleSetupRequest(platform, 'POST', 'sync')).toEqual({ ok: true, state });
    expect(platform.syncMachines).toHaveBeenCalledTimes(1);
  });

  it('should check a machine', async () => {
    expect(await handleSetupRequest(platform, 'POST', 'probe', {}, { machine: purifierCool })).toEqual({ ok: true, result: ready });
    expect(await handleSetupRequest(platform, 'POST', 'probe', {}, {})).toEqual({ ok: false, error: 'The machine has no valid serial number or type' });
  });

  it('should save a device, and refuse one that is not valid', async () => {
    const device = createDeviceConfig(purifierCool);
    expect(await handleSetupRequest(platform, 'POST', 'device', {}, { device })).toEqual({ ok: true, state });
    expect(platform.saveDevice).toHaveBeenCalledWith(device);
    expect(await handleSetupRequest(platform, 'POST', 'device', {}, { device: { name: 'A' } })).toEqual({
      ok: false,
      error: 'The device needs a name of at most 32 characters, the serial number of its machine and its type',
    });
  });

  it('should save a device with a host, and refuse a host that is not valid', async () => {
    const device = createDeviceConfig(purifierCool, { host: '192.168.1.20' });
    expect(await handleSetupRequest(platform, 'POST', 'device', {}, { device })).toEqual({ ok: true, state });
    expect(platform.saveDevice).toHaveBeenCalledWith(device);
    vi.mocked(platform.saveDevice).mockClear();
    expect(await handleSetupRequest(platform, 'POST', 'device', {}, { device: { ...device, host: 'http://purifier' } })).toEqual({
      ok: false,
      error: 'Enter a host name or an IPv4 address for Living Room, or leave the host empty to search your network for it',
    });
    expect(platform.saveDevice).not.toHaveBeenCalled();
  });

  it('should remove a device by the serial number of its machine', async () => {
    expect(await handleSetupRequest(platform, 'DELETE', 'device', { serialNumber: purifierCool.serialNumber })).toEqual({ ok: true });
    platform.removeDevice.mockResolvedValueOnce(false);
    expect(await handleSetupRequest(platform, 'DELETE', 'device', { serialNumber: 'NK6' })).toEqual({ ok: false, error: 'No device has the machine NK6' });
    expect(await handleSetupRequest(platform, 'DELETE', 'device', {})).toEqual({ ok: false, error: 'Give the serial number of the machine of the device to remove' });
  });

  it('should answer a failure with its message, never a thrown error', async () => {
    platform.requestLoginCode.mockRejectedValueOnce(new Error('Too many requests'));
    expect(await handleSetupRequest(platform, 'POST', 'login-code', {}, { email: 'someone@example.com', country: 'GB' })).toEqual({ ok: false, error: 'Too many requests' });
    platform.getSetupState.mockRejectedValueOnce('down');
    expect(await handleSetupRequest(platform, 'GET', 'state')).toEqual({ ok: false, error: 'down' });
  });
});
