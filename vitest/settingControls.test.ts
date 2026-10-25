/**
 * @file vitest/settingControls.test.ts
 * @description This file contains the tests for the switches and the mode selects of the controls of a machine that have no place in Matter beside them.
 * @author Calvin Che
 */

import type { DysonMachine } from 'dyson-control';

import { SETTING_CONTROLS } from '../src/config.js';
import { type SettingSelect, type SettingSwitch, settingControls } from '../src/settingControls.js';
import { capabilitiesOf, coolLink, createFakeClient, humidifyCool, purifierCool } from './fakeDyson.js';

const purifierBigQuiet: DysonMachine = { serialNumber: 'NK6-EU-MHA0081A', type: '997', model: 'EAST', category: 'environmentalCare' };
const hotCoolLink: DysonMachine = { serialNumber: 'NK6-EU-MHA0082A', type: '455', category: 'environmentalCare' };
const nozzle: DysonMachine = { serialNumber: 'NK6-EU-MHA0083A', type: '831', category: 'environmentalCare' };
const wickDryer: DysonMachine = { serialNumber: 'NK6-EU-MHA0084A', type: '965', category: 'environmentalCare' };

/**
 * Get a setting control that is a switch
 *
 * @param {(typeof SETTING_CONTROLS)[number]} key The setting.
 * @returns {SettingSwitch} The switch.
 * @throws {Error} When the setting adds a mode select.
 */
function switchOf(key: (typeof SETTING_CONTROLS)[number]): SettingSwitch {
  const control = settingControls[key];
  if (control.kind !== 'switch') throw new Error(`${key} is no switch`);
  return control;
}

/**
 * Get a setting control that is a mode select
 *
 * @param {(typeof SETTING_CONTROLS)[number]} key The setting.
 * @returns {SettingSelect} The select.
 * @throws {Error} When the setting adds a switch.
 */
function selectOf(key: (typeof SETTING_CONTROLS)[number]): SettingSelect {
  const control = settingControls[key];
  if (control.kind !== 'select') throw new Error(`${key} is no select`);
  return control;
}

describe('settingControls', () => {
  const { state } = createFakeClient(purifierCool);

  test('should give each setting control a code no other has', () => {
    const codes = SETTING_CONTROLS.map((key) => settingControls[key].code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test('should read and send the switches of a machine that has them', () => {
    const big = capabilitiesOf(purifierBigQuiet);
    expect(switchOf('hasChildLockSwitch').isAvailable(big)).toBe(true);
    expect(switchOf('hasChildLockSwitch').read({ ...state, childLockMode: true })).toBe(true);
    expect(switchOf('hasChildLockSwitch').write(false)).toEqual({ childLockMode: false });
    expect(switchOf('hasUvLightSwitch').isAvailable(big)).toBe(true);
    expect(switchOf('hasUvLightSwitch').read({ ...state, uvMode: false })).toBe(false);
    expect(switchOf('hasUvLightSwitch').write(true)).toEqual({ uvMode: true });
    expect(switchOf('hasIoniserSwitch').isAvailable(big)).toBe(true);
    expect(switchOf('hasIoniserSwitch').read(state)).toBeNull();
    expect(switchOf('hasIoniserSwitch').write(true)).toEqual({ ionisationMode: true });
    const focus = switchOf('hasJetFocusSwitch');
    expect(focus.isAvailable(capabilitiesOf(hotCoolLink))).toBe(true);
    expect(focus.read({ ...state, focusDiffuse: 'focus' })).toBe(true);
    expect(focus.read({ ...state, focusDiffuse: 'diffuse' })).toBe(false);
    expect(focus.read(state)).toBeNull();
    expect([focus.write(true), focus.write(false)]).toEqual([{ focusDiffuse: 'focus' }, { focusDiffuse: 'diffuse' }]);
    const indirect = switchOf('hasIndirectAirflowSwitch');
    expect(indirect.isAvailable(capabilitiesOf(nozzle))).toBe(true);
    expect(indirect.read({ ...state, nozzleAngle: 'indirect' })).toBe(true);
    expect(indirect.read(state)).toBeNull();
    expect([indirect.write(true), indirect.write(false)]).toEqual([{ nozzleAngle: 'indirect' }, { nozzleAngle: 'direct' }]);
    expect(switchOf('hasWickDryingSwitch').isAvailable(capabilitiesOf(wickDryer))).toBe(true);
    expect(switchOf('hasWickDryingSwitch').read({ ...state, wickDryingMode: true })).toBe(true);
    expect(switchOf('hasWickDryingSwitch').write(false)).toEqual({ wickDryingMode: false });
    // A purifier has none of them.
    expect(SETTING_CONTROLS.filter((key) => settingControls[key].isAvailable(capabilitiesOf(purifierCool)))).toEqual([]);
  });

  test('should list the modes a machine takes, and read and send them', () => {
    const target = selectOf('hasAirQualityTargetSelect');
    expect(target.isAvailable(capabilitiesOf(coolLink))).toBe(true);
    expect(target.modeOptions(capabilitiesOf(coolLink)).map((option) => option.label)).toEqual(['Good', 'Sensitive', 'Very Sensitive']);
    expect(target.readMode({ ...state, airQualityTarget: 'sensitive' }, capabilitiesOf(coolLink))).toBe(1);
    expect(target.readMode(state, capabilitiesOf(coolLink))).toBeUndefined();
    // A value the machine does not take is none its select lists.
    expect(target.readMode({ ...state, airQualityTarget: 'sensitive' }, capabilitiesOf(purifierCool))).toBeUndefined();
    expect(target.writeMode(2)).toEqual({ airQualityTarget: 'verySensitive' });
    const speed = selectOf('hasWickDryingSpeedSelect');
    expect(speed.modeOptions(capabilitiesOf(wickDryer))).toHaveLength(3);
    expect(speed.readMode({ ...state, wickDryingSpeed: 'fast' }, capabilitiesOf(wickDryer))).toBe(2);
    expect(speed.writeMode(0)).toEqual({ wickDryingSpeed: 'slow' });
    const hardness = selectOf('hasWaterHardnessSelect');
    expect(hardness.isAvailable(capabilitiesOf(humidifyCool))).toBe(true);
    expect(hardness.readMode({ ...state, waterHardness: 'hard' }, capabilitiesOf(humidifyCool))).toBe(2);
    expect(hardness.writeMode(1)).toEqual({ waterHardness: 'medium' });
  });
});
