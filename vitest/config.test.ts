/**
 * @file vitest/config.test.ts
 * @description This file contains the tests for the plugin configuration model and its validation.
 * @author Calvin Che
 */

/* oxlint-disable unicorn/no-useless-undefined */

import {
  defaultExposure,
  getUnreadableDevices,
  hasSameExposure,
  hasSameMachine,
  isValidSerialNumber,
  normalizeDeviceName,
  normalizePollInterval,
  parseAccountConfig,
  parseDeviceConfig,
  parseDeviceConfigs,
  toDysonMachine,
} from '../src/config.js';
import { account, createDeviceConfig, hotCool, purifierCool } from './fakeDyson.js';

describe('config', () => {
  it('should take a serial number of letters, digits and dashes, 32 at most', () => {
    expect(isValidSerialNumber('NK6-EU-MHA0001A')).toBe(true);
    expect(isValidSerialNumber('-NK6')).toBe(false);
    expect(isValidSerialNumber('NK6 EU')).toBe(false);
    expect(isValidSerialNumber('A'.repeat(33))).toBe(false);
    expect(isValidSerialNumber(42)).toBe(false);
  });

  it('should trim a name, and refuse one that is empty or longer than 32 characters', () => {
    expect(normalizeDeviceName('  Living Room ')).toBe('Living Room');
    expect(normalizeDeviceName('   ')).toBeUndefined();
    expect(normalizeDeviceName('A'.repeat(33))).toBeUndefined();
    expect(normalizeDeviceName(undefined)).toBeUndefined();
  });

  it('should clamp the poll interval to 10..3600 seconds, and fall back to 30', () => {
    expect(normalizePollInterval(60)).toBe(60);
    expect(normalizePollInterval(2)).toBe(10);
    expect(normalizePollInterval(99_999)).toBe(3600);
    expect(normalizePollInterval(12.6)).toBe(13);
    expect(normalizePollInterval('5')).toBe(30);
    expect(normalizePollInterval(undefined)).toBe(30);
  });

  it('should read a stored account, and refuse one that lacks a field', () => {
    expect(parseAccountConfig(account)).toEqual(account);
    expect(parseAccountConfig({ ...account, extra: true })).toEqual(account);
    expect(parseAccountConfig({ ...account, token: '' })).toBeUndefined();
    expect(parseAccountConfig({ ...account, country: 'gb' })).toBeUndefined();
    expect(parseAccountConfig({ ...account, culture: 1 })).toBeUndefined();
    expect(parseAccountConfig('account')).toBeUndefined();
    expect(parseAccountConfig(undefined)).toBeUndefined();
  });

  it('should read a stored device with every setting', () => {
    const device = createDeviceConfig(purifierCool, { variant: 'M', mqttRootTopicLevel: '438M', model: 'TP07' });
    expect(parseDeviceConfig(device)).toEqual(device);
  });

  it('should fall back to the defaults for the settings a device lacks, and report the ones that are not valid', () => {
    const report = vi.fn();
    const device = parseDeviceConfig(
      { name: 'Study', serialNumber: 'NK6-EU-MHA0009A', type: '438', fanControl: 'dial', isComposed: 'yes', firmwareCapabilities: ['A', 7] },
      report,
    );
    expect(device).toEqual({ name: 'Study', serialNumber: 'NK6-EU-MHA0009A', type: '438', ...defaultExposure, firmwareCapabilities: ['A'] });
    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledWith('"Study" has the fanControl "dial", which is not valid: "steps" is used instead');
    expect(report).toHaveBeenCalledWith('"Study" has the isComposed "yes", which is not valid: true is used instead');
  });

  it('should read a device stored without firmware capabilities', () => {
    expect(parseDeviceConfig({ name: 'Study', serialNumber: 'NK6', type: '438' })).not.toHaveProperty('firmwareCapabilities');
  });

  it('should refuse a device without a valid name, serial number or type', () => {
    expect(parseDeviceConfig({ serialNumber: 'NK6', type: '438' })).toBeUndefined();
    expect(parseDeviceConfig({ name: 'A', serialNumber: 'NK6 EU', type: '438' })).toBeUndefined();
    expect(parseDeviceConfig({ name: 'A', serialNumber: 'NK6', type: '' })).toBeUndefined();
    expect(parseDeviceConfig(null)).toBeUndefined();
  });

  it('should drop a device that is not valid, or whose name or serial number another took', () => {
    const report = vi.fn();
    const livingRoom = createDeviceConfig(purifierCool);
    const bedroom = createDeviceConfig(hotCool);
    const stored = [livingRoom, { name: 'Broken' }, { ...bedroom, name: 'Living Room' }, { ...bedroom, serialNumber: livingRoom.serialNumber }, bedroom];
    expect(parseDeviceConfigs(stored, report)).toEqual([livingRoom, bedroom]);
    expect(report).toHaveBeenCalledTimes(3);
    expect(parseDeviceConfigs('devices')).toEqual([]);
  });

  it('should keep the stored devices it cannot read, until a device takes their name or their serial number', () => {
    const livingRoom = createDeviceConfig(purifierCool);
    const broken = { name: 'Broken', serialNumber: 'NK6-EU-MHA0099A' };
    const brokenLivingRoom = { name: 'Living Room' };
    expect(getUnreadableDevices([livingRoom, broken, brokenLivingRoom, 'text'], [livingRoom])).toEqual([broken, 'text']);
    expect(getUnreadableDevices([broken], [createDeviceConfig({ ...purifierCool, serialNumber: 'NK6-EU-MHA0099A' })])).toEqual([]);
    expect(getUnreadableDevices(undefined, [])).toEqual([]);
  });

  it('should turn a stored device into the machine of the Dyson client', () => {
    expect(toDysonMachine(createDeviceConfig(purifierCool, { variant: 'M', mqttRootTopicLevel: '438M', model: 'TP07' }))).toEqual({
      ...purifierCool,
      variant: 'M',
      mqttRootTopicLevel: '438M',
      model: 'TP07',
    });
    expect(toDysonMachine(createDeviceConfig({ serialNumber: 'NK6', type: '438' }))).toEqual({ serialNumber: 'NK6', type: '438', category: 'environmentalCare', name: 'Unnamed' });
  });

  it('should tell the same machine and the same exposure apart', () => {
    const device = createDeviceConfig(purifierCool);
    expect(hasSameMachine(device, { ...device, name: 'Elsewhere' })).toBe(true);
    expect(hasSameMachine(device, { ...device, firmwareCapabilities: [] })).toBe(false);
    expect(hasSameMachine({ ...device, firmwareCapabilities: undefined }, { ...device, firmwareCapabilities: [] })).toBe(true);
    expect(hasSameMachine({ ...device, firmwareCapabilities: [] }, { ...device, firmwareCapabilities: undefined })).toBe(true);
    expect(hasSameExposure(device, { ...device, firmwareVersion: '1' })).toBe(true);
    expect(hasSameExposure(device, { ...device, name: 'Elsewhere' })).toBe(false);
    expect(hasSameExposure(device, { ...device, nightModeControl: 'switch' })).toBe(false);
  });
});
