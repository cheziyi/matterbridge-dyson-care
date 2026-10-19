/**
 * @file vitest/accessory/pendingCommand.test.ts
 * @description This file contains the tests for what the Matter controllers asked of one machine since the last command was sent.
 * @author Calvin Che
 */

/* oxlint-disable unicorn/no-useless-undefined */

import { type MachineSnapshot, PendingCommand } from '../../src/accessory/pendingCommand.js';
import { capabilitiesOf, createFakeClient, hotCool, humidifyCool, purifierCool } from '../fakeDyson.js';

/**
 * Describe a machine as it was last read
 *
 * @param {Partial<MachineSnapshot>} overrides The fields to replace.
 * @returns {MachineSnapshot} The machine: a purifier that is on at speed 4, with a sweep select.
 */
function snapshot(overrides: Partial<MachineSnapshot> = {}): MachineSnapshot {
  return { state: createFakeClient(purifierCool).state, capabilities: capabilitiesOf(purifierCool), lastManualFanSpeed: 6, isSweepSelect: true, ...overrides };
}

describe('PendingCommand', () => {
  it('should send nothing when nothing was asked', () => {
    expect(new PendingCommand().take(snapshot(), () => 'off')).toEqual({});
  });

  it('should turn the machine off with a fan set to off, unless its power was asked on with it', () => {
    const pending = new PendingCommand();
    pending.requestFan();
    expect(pending.take(snapshot(), () => 'off')).toEqual({ fanPower: false });
    pending.requestControl({ fanPower: true });
    pending.requestFan();
    expect(pending.take(snapshot(), () => 'off')).toEqual({ fanPower: true });
    // A power asked off wins over any speed.
    pending.requestControl({ fanPower: false });
    pending.requestFan();
    expect(pending.take(snapshot(), () => 5)).toEqual({ fanPower: false });
    pending.requestFan();
    expect(pending.take(snapshot(), () => undefined)).toEqual({});
  });

  it('should leave the auto mode for the last speed, or speed 5, and keep a machine that is off off', () => {
    const pending = new PendingCommand();
    const inAuto = { ...createFakeClient(purifierCool).state, autoMode: true, fanSpeed: null };
    pending.requestFanAuto(false);
    expect(pending.take(snapshot({ state: inAuto }), () => undefined)).toEqual({ fanSpeed: 6 });
    pending.requestFanAuto(false);
    expect(pending.take(snapshot({ state: { ...inAuto, fanPower: false }, lastManualFanSpeed: undefined }), () => undefined)).toEqual({ fanSpeed: 5, fanPower: false });
    // A speed asked for with it wins.
    pending.requestFanAuto(false);
    pending.requestControl({ autoMode: true, fanSpeed: 8 });
    expect(pending.take(snapshot({ state: undefined }), () => undefined)).toEqual({ fanSpeed: 8 });
    // A machine not in its auto mode has nothing to leave.
    pending.requestFanAuto(false);
    expect(pending.take(snapshot(), () => undefined)).toEqual({});
  });

  it('should sweep through two angles on a machine that takes any two, and send a preset otherwise', () => {
    const pending = new PendingCommand();
    pending.requestOscillation(180);
    expect(pending.take(snapshot(), () => undefined)).toEqual({ oscillationMode: 'on', oscillationAngles: { lowerInDegrees: 90, upperInDegrees: 270 } });
    pending.requestOscillation(90);
    expect(pending.take(snapshot({ state: undefined }), () => undefined)).toEqual({ oscillationMode: 'on', oscillationAngles: { lowerInDegrees: 135, upperInDegrees: 225 } });
    pending.requestOscillation('breeze');
    expect(pending.take(snapshot({ isSweepSelect: false }), () => undefined)).toEqual({ oscillationMode: 'on', oscillationPresetAngleInDegrees: 'breeze' });
  });

  it('should humidify to a target, and to the auto mode only on a machine that has one', () => {
    const pending = new PendingCommand();
    pending.requestHumidity(40);
    expect(pending.take(snapshot({ capabilities: capabilitiesOf(humidifyCool) }), () => undefined)).toEqual({
      fanPower: true,
      humidificationMode: 'humidify',
      autoHumidification: false,
      manualHumidificationTargetInPercent: 40,
    });
    // A humidifier without the auto mode takes the target alone.
    pending.requestHumidity(60);
    expect(pending.take(snapshot({ capabilities: { ...capabilitiesOf(humidifyCool), autoHumidification: false } }), () => undefined)).toEqual({
      fanPower: true,
      humidificationMode: 'humidify',
      manualHumidificationTargetInPercent: 60,
    });
  });

  it('should clamp a heating setpoint, and drop what was asked when it is cleared', () => {
    const pending = new PendingCommand();
    pending.requestHeatTarget(40.4);
    expect(pending.take(snapshot({ capabilities: capabilitiesOf(hotCool) }), () => undefined)).toEqual({ targetTemperatureInC: 37 });
    pending.requestHeatTarget(22);
    pending.requestFan();
    pending.clear();
    expect(pending.take(snapshot(), () => 'off')).toEqual({});
  });
});
