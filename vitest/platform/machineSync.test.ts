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

  it('should change nothing for a machine the account lists as it is stored', () => {
    expect(getMachineUpdate(livingRoom, [purifierCool, hotCool], log)).toBeUndefined();
    expect(getMachineUpdate(livingRoom, [hotCool], log)).toBeUndefined();
  });

  it('should take the new firmware of a machine, and keep the name of the device', () => {
    const machine = { ...purifierCool, name: 'Lounge', firmwareVersion: '0700.1', firmwareCapabilities: ['AdvanceOscillationDay0'], variant: 'M' };
    expect(getMachineUpdate(livingRoom, [machine], log)).toEqual({
      ...livingRoom,
      firmwareVersion: '0700.1',
      firmwareCapabilities: ['AdvanceOscillationDay0'],
      variant: 'M',
    });
  });

  it('should drop a field the cloud no longer reports', () => {
    const machine = { serialNumber: purifierCool.serialNumber, type: '438', name: 'Living Room' };
    const updated = getMachineUpdate(livingRoom, [machine], log);
    expect(updated?.productName).toBeUndefined();
    expect(updated?.firmwareCapabilities).toBeUndefined();
  });

  it('should change nothing for a machine whose room name alone changed in the Dyson app', () => {
    expect(getMachineUpdate(livingRoom, [{ ...purifierCool, name: 'Bedroom' }], log)).toBeUndefined();
    expect(getMachineUpdate(livingRoom, [{ ...purifierCool, name: undefined }], log)).toBeUndefined();
  });

  it('should warn of a machine of another type, or on another broker, and change nothing', () => {
    expect(getMachineUpdate(livingRoom, [{ ...purifierCool, type: '520' }], log)).toBeUndefined();
    expect(getMachineUpdate(livingRoom, [{ ...purifierCool, remoteBrokerType: 'rabbitMq' }], log)).toBeUndefined();
    expect(log.warn).toHaveBeenCalledTimes(2);
  });
});
