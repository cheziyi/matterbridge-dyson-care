/**
 * @file vitest/accessory/pendingCommand.test.ts
 * @description This file contains the tests for what the Matter controllers asked of one machine since the last command was sent.
 * @author Calvin Che
 */

/* oxlint-disable unicorn/no-useless-undefined */

import { type MachineSnapshot, PendingCommand } from '../../src/accessory/pendingCommand.js';
import { bigQuiet, capabilitiesOf, createFakeClient, hotCool, humidifyCool, purifierCool } from '../fakeDyson.js';

/**
 * Describe a machine as it was last read
 *
 * @param {Partial<MachineSnapshot>} overrides The fields to replace.
 * @returns {MachineSnapshot} The machine: a purifier that is on at speed 4, with a sweep select.
 */
function snapshot(overrides: Partial<MachineSnapshot> = {}): MachineSnapshot {
  return {
    state: createFakeClient(purifierCool).state,
    capabilities: capabilitiesOf(purifierCool),
    lastManualFanSpeed: 6,
    isSweepSelect: true,
    isTilt: false,
    lastTiltAngle: undefined,
    ...overrides,
  };
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

  it('should leave the auto mode for the last speed, or speed 5', () => {
    const pending = new PendingCommand();
    const inAuto = { ...createFakeClient(purifierCool).state, autoMode: true, fanSpeed: null };
    pending.requestFanAuto(false);
    expect(pending.take(snapshot({ state: inAuto }), () => undefined)).toEqual({ fanSpeed: 6 });
    pending.requestFanAuto(false);
    expect(pending.take(snapshot({ state: { ...inAuto, fanPower: false }, lastManualFanSpeed: undefined }), () => undefined)).toEqual({ fanSpeed: 5 });
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

  it('should oscillate with the idle modes while the machine stands by, and let the last request win', () => {
    const pending = new PendingCommand();
    const idle = { ...createFakeClient(purifierCool).state, oscillationState: 'idle' as const };
    pending.requestOscillationOn(true);
    expect(pending.take(snapshot({ state: idle }), () => undefined)).toEqual({ oscillationMode: 'idleOn' });
    pending.requestOscillationOn(false);
    expect(pending.take(snapshot(), () => undefined)).toEqual({ oscillationMode: 'off' });
    pending.requestOscillation('off');
    expect(pending.take(snapshot({ state: idle }), () => undefined)).toEqual({ oscillationMode: 'idleOff' });
    pending.requestOscillation(90);
    pending.requestOscillationOn(false);
    expect(pending.take(snapshot(), () => undefined)).toEqual({ oscillationMode: 'off' });
    pending.requestOscillationOn(true);
    pending.requestOscillation(90);
    expect(pending.take(snapshot({ isSweepSelect: false }), () => undefined)).toEqual({ oscillationMode: 'on', oscillationPresetAngleInDegrees: 90 });
  });

  it('should breeze a machine that tilts, and go back to its last angle', () => {
    const pending = new PendingCommand();
    const tilt = { ...createFakeClient(bigQuiet).state, oscillationMode: null, tiltAngleInDegrees: 25 as const };
    const machine = snapshot({ state: tilt, capabilities: capabilitiesOf(bigQuiet), isSweepSelect: false, isTilt: true, lastTiltAngle: 25 });
    pending.requestOscillationOn(true);
    expect(pending.take(machine, () => undefined)).toEqual({ tiltAngleInDegrees: 'breeze' });
    pending.requestOscillationOn(false);
    expect(pending.take(machine, () => undefined)).toEqual({ tiltAngleInDegrees: 25 });
    pending.requestOscillationOn(false);
    expect(pending.take({ ...machine, lastTiltAngle: undefined }, () => undefined)).toEqual({ tiltAngleInDegrees: 0 });
    pending.requestTilt(50);
    expect(pending.take({ ...machine, state: { ...tilt, fanPower: false } }, () => undefined)).toEqual({ tiltAngleInDegrees: 50 });
    // A power asked for with it wins.
    pending.requestOscillationOn(true);
    pending.requestTilt(0);
    pending.requestControl({ fanPower: true });
    expect(pending.take({ ...machine, state: { ...tilt, fanPower: false } }, () => undefined)).toEqual({ tiltAngleInDegrees: 0, fanPower: true });
  });

  it('should sweep the angle of the oscillation fan, breeze in its auto, and stand still at its first speed', () => {
    const pending = new PendingCommand();
    const machine = snapshot({ isSweepSelect: false, capabilities: capabilitiesOf(humidifyCool) });
    pending.requestOscillationFan();
    expect(
      pending.take(
        machine,
        () => undefined,
        () => 90,
      ),
    ).toEqual({ oscillationMode: 'on', oscillationPresetAngleInDegrees: 90 });
    pending.requestOscillationFan();
    expect(
      pending.take(
        machine,
        () => undefined,
        () => 'auto',
      ),
    ).toEqual({ oscillationMode: 'on', oscillationPresetAngleInDegrees: 'breeze' });
    pending.requestOscillationFan();
    expect(
      pending.take(
        machine,
        () => undefined,
        () => 'still',
      ),
    ).toEqual({ oscillationMode: 'off' });
    // A sweep of a machine that takes two angles.
    pending.requestOscillationFan();
    expect(
      pending.take(
        snapshot(),
        () => undefined,
        () => 180,
      ),
    ).toEqual({ oscillationMode: 'on', oscillationAngles: { lowerInDegrees: 90, upperInDegrees: 270 } });
  });

  it('should send nothing for the oscillation fan set to off, or holding nothing, since its on/off is the power of the machine', () => {
    const pending = new PendingCommand();
    const machine = snapshot({ isSweepSelect: false, capabilities: capabilitiesOf(humidifyCool) });
    pending.requestOscillationFan();
    expect(
      pending.take(
        machine,
        () => undefined,
        () => 'off',
      ),
    ).toEqual({});
    pending.requestOscillationFan();
    expect(
      pending.take(
        machine,
        () => undefined,
        () => undefined,
      ),
    ).toEqual({});
    pending.requestOscillationFan();
    expect(pending.take(machine, () => undefined)).toEqual({});
  });

  it('should tilt a machine that tilts to the angle of its oscillation fan, and breeze it in its auto', () => {
    const pending = new PendingCommand();
    const tilt = { ...createFakeClient(bigQuiet).state, oscillationMode: null, tiltAngleInDegrees: 25 as const };
    const machine = snapshot({ state: tilt, capabilities: capabilitiesOf(bigQuiet), isSweepSelect: false, isTilt: true, lastTiltAngle: 25 });
    pending.requestOscillationFan();
    expect(
      pending.take(
        machine,
        () => undefined,
        () => 0,
      ),
    ).toEqual({ tiltAngleInDegrees: 0 });
    pending.requestOscillationFan();
    expect(
      pending.take(
        machine,
        () => undefined,
        () => 50,
      ),
    ).toEqual({ tiltAngleInDegrees: 50 });
    pending.requestOscillationFan();
    expect(
      pending.take(
        machine,
        () => undefined,
        () => 'auto',
      ),
    ).toEqual({ tiltAngleInDegrees: 'breeze' });
    pending.requestOscillationFan();
    expect(
      pending.take(
        machine,
        () => undefined,
        () => 'off',
      ),
    ).toEqual({});
  });

  it('should leave whether a machine that is off turns on to dyson-control, as the MyDyson app does', () => {
    const pending = new PendingCommand();
    const off = snapshot({ state: { ...createFakeClient(hotCool).state, fanPower: false, heatMode: 'off', humidificationMode: 'off' } });
    pending.requestControl({ nightMode: true });
    expect(pending.take(off, () => undefined)).toEqual({ nightMode: true });
    pending.requestFan();
    expect(pending.take(off, () => 3)).toEqual({ fanSpeed: 3 });
    pending.requestFanAuto(true);
    expect(pending.take(off, () => undefined)).toEqual({ autoMode: true });
    pending.requestControl({ findAndFollowMode: 'off' });
    expect(pending.take(off, () => undefined)).toEqual({ findAndFollowMode: 'off' });
    pending.requestHeatTarget(24);
    expect(pending.take(off, () => undefined)).toEqual({ targetTemperatureInC: 24 });
    pending.requestControl({ autoHumidification: true });
    expect(pending.take(off, () => undefined)).toEqual({ autoHumidification: true });
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
    pending.requestOscillationFan();
    pending.clear();
    expect(pending.take(snapshot(), () => 'off')).toEqual({});
  });
});
