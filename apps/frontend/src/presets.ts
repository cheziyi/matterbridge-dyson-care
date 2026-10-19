/**
 * @file apps/frontend/src/presets.ts
 * @description The presets of the Options step: each fills in the choices of how a device appears in Matter.
 * @author Calvin Che
 * @license Apache-2.0
 */

import type { AvailableControls, Exposure } from './api.js';
import { fitExposure } from './exposure.js';
import type { Draft } from './state.js';

export type PresetName = 'apple' | 'google' | 'matter';

export const presets: Record<PresetName, { title: string; text: string }> = {
  apple: {
    title: 'Apple Home',
    text: 'Fan speed as a percentage with its auto mode, and a switch for the oscillation and the night mode, with a sensor for the air quality, the temperature and the humidity, each a device of its own.',
  },
  google: {
    title: 'Google Home',
    text: 'Fan speed as steps, and a switch for the auto mode, the oscillation and the night mode, with a sensor for the air quality, the temperature and the humidity, each a device of its own.',
  },
  matter: {
    title: 'Full Matter support',
    text: 'For apps that show every Matter control: the auto mode, the oscillation, the night mode and the airflow direction on the fan control itself, the target humidity as a mode select, and every sensor, all as one device.',
  },
};

/**
 * The choices a preset makes for a machine: never a switch or a control the machine has no use for. The Apple Home and
 * the Google Home presets make the switches and the sensors devices of their own, and the Full Matter support preset
 * makes them parts of the main device.
 */
export function presetExposure(name: PresetName, controls: AvailableControls): Exposure {
  const isMatter = name === 'matter';
  // Matter has a place on the fan control for the auto mode, the oscillation, the night mode and the airflow
  // direction, which neither Home nor Google Home is known to show: a switch is the way to them there. The Apple Home
  // preset leaves the auto mode on the fan control alone, with no switch beside it.
  const fanFeature = isMatter ? 'native' : 'switch';
  return fitExposure(
    {
      // A machine that measures no air is a fan, which every app shows.
      deviceType: controls.hasAirQualitySensor ? 'airPurifier' : 'fan',
      fanControl: name === 'apple' ? 'percent' : 'steps',
      fanAutoControl: name === 'google' ? 'switch' : 'native',
      oscillationControl: fanFeature,
      nightModeControl: fanFeature,
      // The direction of the air is set once, rather than used every day, so it gets no switch of its own.
      airflowDirectionControl: isMatter ? 'native' : 'hidden',
      // Every app shows a thermostat.
      heatControl: 'thermostat',
      // A mode select reaches every target humidity, but few apps show one.
      humidificationControl: isMatter ? 'select' : 'switches',
      hasContinuousMonitoringSwitch: isMatter,
      hasAirQualitySensor: true,
      hasTemperatureSensor: true,
      hasHumiditySensor: true,
      // Home shows the parts of a composed device without their names.
      isComposed: isMatter,
    },
    controls,
  );
}

/** Whether the choices in a draft are exactly those of a preset, leaving aside what the machine has no use for. */
export function matchesPreset(draft: Draft, name: PresetName, controls: AvailableControls): boolean {
  return JSON.stringify(fitExposure(draft, controls)) === JSON.stringify(presetExposure(name, controls));
}
