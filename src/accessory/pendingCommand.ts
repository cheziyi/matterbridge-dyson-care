/**
 * @file src/accessory/pendingCommand.ts
 * @description This file contains what the Matter controllers asked of one machine since the last command was sent.
 * @author Calvin Che
 * @created 2026-10-19
 * @version 1.0.0
 * @license Apache-2.0
 *
 * Copyright 2026 Calvin Che.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { EnvironmentalCareCapabilities, EnvironmentalCareControl, EnvironmentalCareState, FanSpeed, TiltAngle } from 'dyson-control';

import {
  clampHeatTarget,
  defaultTiltAngle,
  getSweepAngles,
  type HumiditySelectValue,
  isOscillationSweep,
  isTiltFanAngle,
  middleFanSpeed,
  type OscillationSelectValue,
  toOscillationMode,
} from '../mapping.js';
import type { FanRequest, OscillationFanRequest } from './matterState.js';

/** The machine as it was last read, which a command is worked out against. */
export interface MachineSnapshot {
  /** The last state read, or undefined when the machine never answered. */
  state: EnvironmentalCareState | undefined;
  capabilities: EnvironmentalCareCapabilities;
  /** The speed the fan last ran at outside the auto mode, which turning the auto mode off goes back to. */
  lastManualFanSpeed: FanSpeed | undefined;
  /** Whether the angles of the oscillation select or of the oscillation fan are sweeps written as two angles. */
  isSweepSelect: boolean;
  /** Whether the machine tilts, so that its oscillation is its breeze. */
  isTilt: boolean;
  /** The angle the machine was last seen tilted to, which turning its breeze off goes back to. */
  lastTiltAngle: TiltAngle | undefined;
}

/**
 * What the controllers asked for since the last command was sent
 *
 * A controller writes one attribute at a time, so its writes are collected here and sent as one command.
 */
export class PendingCommand {
  private control: EnvironmentalCareControl = {};
  private isFanRequested = false;
  private fanAuto: boolean | undefined;
  private isOscillationOn: boolean | undefined;
  private isOscillationFanRequested = false;
  private oscillation: OscillationSelectValue | undefined;
  private tilt: TiltAngle | undefined;
  private humidity: HumiditySelectValue | undefined;

  /**
   * Ask for fields of the state of the machine
   *
   * @param {EnvironmentalCareControl} control The fields. Each one replaces what was asked for that field before.
   * @returns {void}
   */
  requestControl(control: EnvironmentalCareControl): void {
    Object.assign(this.control, control);
  }

  /**
   * Ask for the power, the speed or the auto mode the fan control holds when the command is sent
   *
   * @returns {void}
   */
  requestFan(): void {
    this.isFanRequested = true;
  }

  /**
   * Ask for the auto mode, or for the machine to leave it
   *
   * @param {boolean} isOn Whether the machine is in its auto mode.
   * @returns {void}
   */
  requestFanAuto(isOn: boolean): void {
    this.fanAuto = isOn;
  }

  /**
   * Ask for the oscillation on or off, as a switch or the rocking of the fan control does: for a machine that tilts,
   * its breeze
   *
   * @param {boolean} isOn Whether the machine oscillates.
   * @returns {void}
   */
  requestOscillationOn(isOn: boolean): void {
    this.isOscillationOn = isOn;
    this.oscillation = undefined;
    this.tilt = undefined;
  }

  /**
   * Ask for the angle or the breeze the oscillation fan holds when the command is sent
   *
   * @returns {void}
   */
  requestOscillationFan(): void {
    this.isOscillationFanRequested = true;
  }

  /**
   * Ask for a value of the tilt select
   *
   * @param {TiltAngle} angle The angle to tilt to, or the breeze.
   * @returns {void}
   */
  requestTilt(angle: TiltAngle): void {
    this.tilt = angle;
    this.isOscillationOn = undefined;
  }

  /**
   * Ask for a value of the oscillation select
   *
   * @param {OscillationSelectValue} value Off, or the angle to sweep.
   * @returns {void}
   */
  requestOscillation(value: OscillationSelectValue): void {
    this.oscillation = value;
    this.isOscillationOn = undefined;
  }

  /**
   * Ask for a value of the humidity select
   *
   * @param {HumiditySelectValue} value Off, auto or a target humidity.
   * @returns {void}
   */
  requestHumidity(value: HumiditySelectValue): void {
    this.humidity = value;
  }

  /**
   * Ask for a heating setpoint
   *
   * @param {number} temperatureInC The setpoint in °C, which is clamped to what the heater takes.
   * @returns {void}
   */
  requestHeatTarget(temperatureInC: number): void {
    this.control.targetTemperatureInC = clampHeatTarget(temperatureInC);
  }

  /**
   * Take what was asked for, as the command to send, and start collecting again
   *
   * Edge cases:
   *  - a fan control set to off or 0 turns the machine off, unless the power was asked to be on with it
   *  - auto off goes back to the speed the fan last ran at, or to speed 5 when it was never seen at one
   *  - a target humidity turns the humidifying on, and the machine with it
   *  - the oscillation of a machine paused while it stands by is turned on and off with its idle modes
   *  - the breeze of a machine that tilts turned off goes back to the angle it was last seen at, or to 0°
   *  - the on/off of the oscillation fan and the fan set to off send nothing: the read back puts back the power of the
   *    machine, which they show. Its first speed stands a machine that does not tilt still
   *  - whether a machine that is off turns on is left to dyson-control, which turns it on with nearly every field, as
   *    the MyDyson app does
   *
   * @param {MachineSnapshot} machine The machine as it was last read.
   * @param {() => FanRequest | undefined} readFan Reads what the fan control holds. It is only called when the fan control was written.
   * @param {() => OscillationFanRequest | undefined} [readOscillationFan] Reads what the oscillation fan holds. It is only called when its fan control was written.
   * @returns {EnvironmentalCareControl} The fields to send, none when nothing was asked of the machine.
   */
  take(machine: MachineSnapshot, readFan: () => FanRequest | undefined, readOscillationFan?: () => OscillationFanRequest | undefined): EnvironmentalCareControl {
    const { control } = this;
    const { state } = machine;
    if (this.isFanRequested) this.applyFan(control, readFan());
    if (this.fanAuto === true) control.autoMode = true;
    else if (this.fanAuto === false && (control.autoMode ?? state?.autoMode) === true) {
      control.fanSpeed = control.fanSpeed ?? machine.lastManualFanSpeed ?? middleFanSpeed;
      delete control.autoMode;
    }
    if (this.isOscillationFanRequested) this.applyOscillationFan(machine.isTilt, readOscillationFan?.());
    const oscillationModes = machine.capabilities.oscillationModes;
    if (this.isOscillationOn !== undefined) {
      if (machine.isTilt) this.tilt = this.isOscillationOn ? 'breeze' : (machine.lastTiltAngle ?? defaultTiltAngle);
      else control.oscillationMode = toOscillationMode(this.isOscillationOn, machine.state, oscillationModes);
    }
    if (this.tilt !== undefined) control.tiltAngleInDegrees = this.tilt;
    if (this.oscillation === 'off') control.oscillationMode = toOscillationMode(false, machine.state, oscillationModes);
    else if (this.oscillation !== undefined) {
      control.oscillationMode = toOscillationMode(true, machine.state, oscillationModes);
      // The select of a machine that takes two angles lists sweeps alone, which fit its range.
      const range = machine.capabilities.oscillationAngles;
      if (machine.isSweepSelect && range !== null && isOscillationSweep(this.oscillation)) {
        control.oscillationAngles = getSweepAngles(this.oscillation, machine.state?.oscillationAngles ?? null, range);
      } else {
        control.oscillationPresetAngleInDegrees = this.oscillation;
      }
    }
    if (this.humidity === 'off') control.humidificationMode = 'off';
    else if (this.humidity !== undefined) {
      Object.assign(control, { fanPower: true, humidificationMode: 'humidify' });
      const isAuto = this.humidity === 'auto';
      if (machine.capabilities.autoHumidification) control.autoHumidification = isAuto;
      if (this.humidity !== 'auto') control.manualHumidificationTargetInPercent = this.humidity;
    }
    this.clear();
    return control;
  }

  /**
   * Drop what was asked for, and start collecting again
   *
   * @returns {void}
   */
  clear(): void {
    this.control = {};
    this.isFanRequested = false;
    this.fanAuto = undefined;
    this.isOscillationOn = undefined;
    this.isOscillationFanRequested = false;
    this.oscillation = undefined;
    this.tilt = undefined;
    this.humidity = undefined;
  }

  // The on/off of the fan is the power of the machine, which it does not set, so that its speeds and its breeze are all
  // it sends.
  private applyOscillationFan(isTilt: boolean, request: OscillationFanRequest | undefined): void {
    if (request === undefined || request === 'off') return;
    if (request === 'auto') {
      if (isTilt) this.tilt = 'breeze';
      else this.oscillation = 'breeze';
    } else if (request === 'still') this.oscillation = 'off';
    else if (isTiltFanAngle(request)) this.tilt = request;
    else this.oscillation = request;
  }

  // Off is the power, unless a controller turned the power on with the same write.
  private applyFan(control: EnvironmentalCareControl, request: FanRequest | undefined): void {
    if (request === undefined || control.fanPower === false) return;
    if (request === 'off') {
      if (control.fanPower !== true) control.fanPower = false;
    } else if (request === 'auto') control.autoMode = true;
    else control.fanSpeed = request;
  }
}
