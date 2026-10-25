/**
 * @file vitest/setup/probe.test.ts
 * @description This file contains the tests for the checks the guided setup runs on a machine.
 * @author Calvin Che
 */

import { DysonError } from 'dyson-control';

import { getMachineSupport, probeMachine, searchLan } from '../../src/setup/probe.js';
import { account, coolFan, createSensors, purifierCool } from '../fakeDyson.js';

// The network calls of a client, which the tests answer. Its constructor and its capabilities are the real ones.
const calls = vi.hoisted(() => ({
  connect: vi.fn(async () => Promise.resolve()),
  getState: vi.fn(async () => Promise.resolve({})),
  getSensors: vi.fn(async () => Promise.resolve({})),
  disconnect: vi.fn(async () => Promise.resolve()),
}));

vi.mock('dyson-control', async (importOriginal) => {
  const original = await importOriginal<typeof import('dyson-control')>();
  class EnvironmentalCareClient extends original.EnvironmentalCareClient {
    override async connect(): Promise<void> {
      return calls.connect();
    }
    override async getState(): Promise<never> {
      return calls.getState() as Promise<never>;
    }
    override async getSensors(): Promise<never> {
      return calls.getSensors() as Promise<never>;
    }
    override async disconnect(): Promise<void> {
      return calls.disconnect();
    }
  }
  return { ...original, EnvironmentalCareClient };
});

describe('probe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should tell which machines of the account the plugin can control', () => {
    expect(getMachineSupport(purifierCool, account)).toBe('supported');
    expect(getMachineSupport({ ...purifierCool, category: 'robot' }, account)).toBe('otherCategory');
    expect(getMachineSupport({ ...purifierCool, remoteBrokerType: 'rabbitMq' }, account)).toBe('otherBroker');
    expect(getMachineSupport({ ...purifierCool, type: '999' }, account)).toBe('unknownType');
  });

  test('should read the capabilities and the readings of a machine that answers, and disconnect', async () => {
    const sensors = createSensors();
    calls.getSensors.mockResolvedValueOnce(sensors);
    const result = await probeMachine(coolFan, account);
    expect(result).toMatchObject({ status: 'ready', machine: coolFan, sensors, controls: { hasAutoMode: false, hasAirQualitySensor: false } });
    expect(result.capabilities?.autoMode).toBe(false);
    expect(calls.getState).toHaveBeenCalledTimes(1);
    expect(calls.disconnect).toHaveBeenCalledTimes(1);
  });

  test('should tell what stands in the way of a machine that does not answer', async () => {
    calls.connect.mockRejectedValueOnce(new DysonError('Unauthorized', 401));
    expect(await probeMachine(purifierCool, account)).toEqual({ status: 'signInRequired', machine: purifierCool, message: 'Unauthorized' });
    calls.getState.mockRejectedValueOnce(new DysonError('The machine did not answer', 504));
    expect(await probeMachine(purifierCool, account)).toMatchObject({ status: 'unreachable' });
    calls.connect.mockRejectedValueOnce(new DysonError('Refused', 503));
    expect(await probeMachine(purifierCool, account)).toMatchObject({ status: 'unreachable' });
    calls.connect.mockRejectedValueOnce(new DysonError('On the RabbitMQ broker', 501));
    expect(await probeMachine(purifierCool, account)).toMatchObject({ status: 'unsupported' });
    calls.getSensors.mockRejectedValueOnce(new DysonError('Bad reply', 502));
    expect(await probeMachine(purifierCool, account)).toMatchObject({ status: 'failed', message: 'Bad reply' });
    calls.getSensors.mockRejectedValueOnce(new Error('Broken'));
    // A failed disconnect does not hide the answer.
    calls.disconnect.mockRejectedValueOnce(new Error('Not connected'));
    expect(await probeMachine(purifierCool, account)).toMatchObject({ status: 'failed', message: 'Broken' });
  });

  test('should refuse a machine of a type the client does not know, without connecting', async () => {
    expect(await probeMachine({ ...purifierCool, type: '999' }, account)).toEqual({
      status: 'unsupported',
      machine: { ...purifierCool, type: '999' },
      message: '999 is no known type of environmental care machine',
    });
    expect(calls.connect).not.toHaveBeenCalled();
  });

  test('should tell whether a search of the LAN finds a machine whose broker opens, and disconnect', async () => {
    const machine = { ...purifierCool, apPasswordHash: 'hash-1' };
    expect(await searchLan(machine)).toBe(true);
    expect(calls.disconnect).toHaveBeenCalledTimes(1);
    calls.connect.mockRejectedValueOnce(new DysonError('No machine answered the search', 504));
    // A failed disconnect does not hide the answer.
    calls.disconnect.mockRejectedValueOnce(new Error('Not connected'));
    expect(await searchLan(machine)).toBe(false);
  });

  test('should not search the LAN for a machine the client cannot be built for', async () => {
    expect(await searchLan(purifierCool)).toBe(false);
    expect(await searchLan({ ...purifierCool, type: '999', apPasswordHash: 'hash-1' })).toBe(false);
    expect(calls.connect).not.toHaveBeenCalled();
  });
});
