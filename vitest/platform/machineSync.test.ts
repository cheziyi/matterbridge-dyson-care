/**
 * @file vitest/platform/machineSync.test.ts
 * @description This file contains the tests for what the machine list of the account changes about the stored devices.
 * @author Calvin Che
 */

import type { AnsiLogger } from 'matterbridge/logger';

import { getMachineUpdate } from '../../src/platform/machineSync.js';
import { createDeviceConfig, hotCool, purifierCool } from '../fakeDyson.js';

const log = { warn: vi.fn() } as unknown as AnsiLogger;

describe('machineSync', () => {
  const livingRoom = createDeviceConfig(purifierCool);

  test('should change nothing for a machine the account lists as it is stored', () => {
    expect(getMachineUpdate(livingRoom, [purifierCool, hotCool], log)).toBeUndefined();
    expect(getMachineUpdate(livingRoom, [hotCool], log)).toBeUndefined();
  });

  test('should take the new firmware of a machine, and keep the name of the device', () => {
    const machine = { ...purifierCool, name: 'Lounge', firmwareVersion: '0700.1', firmwareCapabilities: ['AdvanceOscillationDay0'], variant: 'M' };
    expect(getMachineUpdate(livingRoom, [machine], log)).toEqual({
      ...livingRoom,
      roomName: 'Lounge',
      firmwareVersion: '0700.1',
      firmwareCapabilities: ['AdvanceOscillationDay0'],
      variant: 'M',
    });
  });

  test('should drop a field the cloud no longer reports, but keep the product name the device was added with', () => {
    const machine = { serialNumber: purifierCool.serialNumber, type: '438', name: 'Living Room' };
    const updated = getMachineUpdate(livingRoom, [machine], log);
    expect(updated?.firmwareCapabilities).toBeUndefined();
    // Matterbridge makes the identity of the device in Matter from the product name, so the cloud does not change it.
    expect(updated?.productName).toBe('Purifier Cool');
    expect(getMachineUpdate(livingRoom, [{ ...purifierCool, productName: 'Purifier Cool Formaldehyde' }], log)).toBeUndefined();
  });

  test('should take the password of the broker of a machine on the LAN, and keep the host given in the setup page', () => {
    const device = { ...livingRoom, host: '192.168.1.20' };
    expect(getMachineUpdate(device, [{ ...purifierCool, apPasswordHash: 'hash-1' }], log)).toEqual({ ...device, apPasswordHash: 'hash-1' });
    expect(getMachineUpdate({ ...device, apPasswordHash: 'hash-1' }, [purifierCool], log)).toEqual({ ...device, apPasswordHash: undefined });
  });

  test('should take the new room name of a machine, and keep the name of the device', () => {
    expect(getMachineUpdate(livingRoom, [{ ...purifierCool, name: 'Bedroom' }], log)).toEqual({ ...livingRoom, roomName: 'Bedroom' });
    expect(getMachineUpdate(livingRoom, [{ ...purifierCool, name: undefined }], log)).toEqual({ ...livingRoom, roomName: undefined });
  });

  test('should warn of a machine of another type, or on another broker, and change nothing', () => {
    expect(getMachineUpdate(livingRoom, [{ ...purifierCool, type: '520' }], log)).toBeUndefined();
    expect(getMachineUpdate(livingRoom, [{ ...purifierCool, remoteBrokerType: 'rabbitMq' }], log)).toBeUndefined();
    expect(log.warn).toHaveBeenCalledTimes(2);
  });
});
