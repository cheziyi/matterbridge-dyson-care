/**
 * @file vitest/platform/sensorStore.test.ts
 * @description This file contains the tests for the readings each machine has given, kept between restarts.
 * @author Calvin Che
 */

/* oxlint-disable unicorn/no-useless-undefined */

import type { NodeStorage } from 'node-persist-manager';

import { noReportedSensors } from '../../src/controls.js';
import { SensorStore } from '../../src/platform/sensorStore.js';

describe('SensorStore', () => {
  const values = new Map<string, unknown>();
  const storage = {
    get: vi.fn(async (key: string) => values.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    remove: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  } as unknown as NodeStorage;
  const device = { serialNumber: 'NK6-EU-MHA0001A' };

  it('should keep the readings of a machine under its serial number', async () => {
    const store = new SensorStore(() => storage);
    const reported = { ...noReportedSensors, temperature: true };
    await store.write(device, reported);
    expect(values.get('sensors:NK6-EU-MHA0001A')).toEqual(reported);
    expect(await store.read(device)).toEqual(reported);
    await store.remove(device);
    expect(await store.read(device)).toBeUndefined();
  });

  it('should take a reading that is missing or not valid as not given', async () => {
    const store = new SensorStore(() => storage);
    values.set('sensors:NK6-EU-MHA0001A', { temperature: true, humidity: 'yes' });
    expect(await store.read(device)).toEqual({ ...noReportedSensors, temperature: true });
  });

  it('should read and store nothing before the platform storage is ready', async () => {
    const store = new SensorStore(() => undefined);
    await store.write(device, noReportedSensors);
    expect(await store.read(device)).toBeUndefined();
    await store.remove(device);
  });
});
