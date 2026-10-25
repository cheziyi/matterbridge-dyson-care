/**
 * @file src/accessory/endpoints.ts
 * @description This file contains the builders of the Matter endpoints of one machine.
 * @author Calvin Che
 * @created 2026-10-19
 * @version 1.1.0
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

import {
  airPurifier,
  airQualitySensor,
  bridgedNode,
  type DeviceTypeDefinition,
  fan,
  humiditySensor,
  MatterbridgeEndpoint,
  modeSelect,
  onOffPlugInUnit,
  powerSource,
  temperatureSensor,
  thermostat,
} from 'matterbridge';
import { MatterbridgeFanControlServer } from 'matterbridge/behaviors';
import { CommonNumberTag } from 'matterbridge/matter';
import { NitrogenDioxideConcentrationMeasurementServer } from 'matterbridge/matter/behaviors';
import { AirQuality, BridgedDeviceBasicInformation, ConcentrationMeasurement, FanControl, type ModeSelect } from 'matterbridge/matter/clusters';
import type { Semtag } from 'matterbridge/matter/types';

import { maxDeviceNameLength } from '../config.js';
import { composeDeviceName, defaultHeatTargetInC, getFanModeSequence } from '../mapping.js';
import type { EndpointIds } from '../platform/endpointIds.js';
import type { AccessoryLayout } from './layout.js';

const vendorName = 'Dyson';

/** The longest product name Matter takes. */
const maxProductNameLength = 32;

/** What every endpoint of a device says about the device it belongs to. */
export interface EndpointIdentity {
  /** The name the user gave the device: the label of the device in Matter, which is what the Matter apps show. */
  label: string;
  /** The serial number of the machine, which neither a new name nor a new firmware changes. */
  serial: string;
  /** The name the machine is sold under, such as `Purifier Cool`, as it was when the device was added: Matterbridge makes the unique id of the device from it, with the name, the serial number and the vendor name. */
  productName: string;
  /** The vendor id of the bridge, used for the bridged device information. */
  vendorId: number;
  /** The endpoint ids of the device, which give an endpoint that comes back after it was taken away a new id. */
  ids: EndpointIds;
}

/** What each endpoint beside the main one is, such as `Night Mode`, for the endpoints that are devices of their own in Matter. */
const labels = new WeakMap<MatterbridgeEndpoint, string>();

/**
 * Get the name of a device in Matterbridge, which never changes
 *
 * Matterbridge derives the unique id of a bridged device from its name, which the Matter apps use to tell a device they
 * know from a new one. The name is therefore made of the serial number of the machine, and the name the user gives the
 * device is its label: see `getDeviceLabel`.
 *
 * @param {string} serial The serial number of the machine.
 * @returns {string} The name, such as `Dyson NK6-EU-MHA0000A`.
 */
export function getDeviceName(serial: string): string {
  return `${vendorName} ${serial}`;
}

/**
 * Get the label of an endpoint of a device, which the Matter apps show as its name: the name the user gave the device,
 * followed by what the endpoint is when it is not the main endpoint
 *
 * @param {MatterbridgeEndpoint} endpoint The endpoint: the main endpoint, or a device of its own beside it.
 * @param {string} name The name the user gave the device.
 * @returns {string} The label, of at most 32 characters.
 */
export function getDeviceLabel(endpoint: MatterbridgeEndpoint, name: string): string {
  const label = labels.get(endpoint);
  return label === undefined ? name.slice(0, maxDeviceNameLength) : composeDeviceName(name, label);
}

/**
 * Write the name the user gave a device to the endpoints that are devices of their own in Matter
 *
 * @param {readonly MatterbridgeEndpoint[]} endpoints The endpoints: the main endpoint, and the devices of their own beside it.
 * @param {string} name The name the user gave the device.
 * @returns {Promise<void>} Resolves when every label is written.
 */
export async function applyDeviceLabel(endpoints: readonly MatterbridgeEndpoint[], name: string): Promise<void> {
  for (const endpoint of endpoints) await endpoint.updateAttribute(BridgedDeviceBasicInformation, 'nodeLabel', getDeviceLabel(endpoint, name));
}

/**
 * Give an endpoint its label from the start, before it is active
 *
 * @param {MatterbridgeEndpoint} endpoint The endpoint, with its bridged device basic information created.
 * @param {EndpointIdentity} identity The device the endpoint belongs to.
 * @param {string} [label] What the endpoint is, such as `Night Mode`, for a device of its own beside the main endpoint.
 * @returns {MatterbridgeEndpoint} The endpoint.
 */
function setInitialLabel(endpoint: MatterbridgeEndpoint, identity: EndpointIdentity, label?: string): MatterbridgeEndpoint {
  if (label !== undefined) labels.set(endpoint, label);
  // oxlint-disable-next-line typescript/no-non-null-assertion -- the bridged device basic information was just created
  endpoint.getClusterServerOptions(BridgedDeviceBasicInformation)!.nodeLabel = getDeviceLabel(endpoint, identity.label);
  return endpoint;
}

/**
 * Work out the features and the first state of a fan control with the step command, and the speeds and the fan mode
 * Auto it has
 *
 * @param {number} speedCount How many speeds it has, from its first step.
 * @param {boolean} hasSteps Whether it offers its speeds as steps, besides the percent.
 * @param {boolean} hasAuto Whether it has the fan mode Auto.
 * @returns {{ features: FanControl.Feature[]; state: Record<string, unknown> }} The features, and the state it starts with: off.
 */
function getFanControlBase(speedCount: number, hasSteps: boolean, hasAuto: boolean): { features: FanControl.Feature[]; state: Record<string, unknown> } {
  const features: FanControl.Feature[] = [FanControl.Feature.Step];
  // Off and 0 are valid in every sequence; the first read replaces them with the machine's own state.
  const state: Record<string, unknown> = {
    fanMode: FanControl.FanMode.Off,
    fanModeSequence: getFanModeSequence(hasAuto, speedCount),
    percentSetting: 0,
    percentCurrent: 0,
  };
  if (hasSteps) {
    features.push(FanControl.Feature.MultiSpeed);
    Object.assign(state, { speedMax: speedCount, speedSetting: 0, speedCurrent: 0 });
  }
  if (hasAuto) features.push(FanControl.Feature.Auto);
  return { features, state };
}

/**
 * Add the fan control of a device, with the features its layout has
 *
 * Every Dyson fan control has ten speeds and the step command. Each feature beside them is the native Matter place of a
 * control: the fan mode Auto for the auto mode, the left and right rocking for the oscillation, or the up and down
 * rocking for the breeze of a machine that tilts, the sleep wind for the night mode and the airflow direction for the
 * direction of the air.
 *
 * @param {MatterbridgeEndpoint} endpoint The main endpoint of the device.
 * @param {AccessoryLayout} layout How the controls of the device are laid out.
 * @returns {void}
 */
function addFanControl(endpoint: MatterbridgeEndpoint, layout: AccessoryLayout): void {
  const { features, state } = getFanControlBase(layout.fanPositions.length, layout.hasFanSteps, layout.hasFanAuto);
  if (layout.hasRocking) {
    features.push(FanControl.Feature.Rocking);
    // A Dyson machine turns from side to side, or tilts up and down, never both.
    const isTilt = layout.isTilt;
    Object.assign(state, {
      rockSupport: { rockLeftRight: !isTilt, rockUpDown: isTilt, rockRound: false },
      rockSetting: { rockLeftRight: false, rockUpDown: false, rockRound: false },
    });
  }
  // Every machine has a night mode, and an app that does not show the sleep wind leaves it out.
  features.push(FanControl.Feature.Wind);
  Object.assign(state, { windSupport: { sleepWind: true, naturalWind: false }, windSetting: { sleepWind: false, naturalWind: false } });
  if (layout.hasAirflowDirection) {
    features.push(FanControl.Feature.AirflowDirection);
    state.airflowDirection = FanControl.AirflowDirection.Forward;
  }
  endpoint.behaviors.require(MatterbridgeFanControlServer.with(...features), state);
}

/**
 * Create the main endpoint of a device: an air purifier or a fan, with on/off and a fan control
 *
 * An air purifier has the filters its layout has, each full and fitted until the first read.
 *
 * @param {EndpointIdentity} identity The device the endpoint belongs to.
 * @param {AccessoryLayout} layout How the controls of the device are laid out.
 * @returns {MatterbridgeEndpoint} The endpoint, with its clusters and nothing subscribed yet.
 */
export function createMainEndpoint(identity: EndpointIdentity, layout: AccessoryLayout): MatterbridgeEndpoint {
  const deviceType = layout.deviceType === 'airPurifier' ? airPurifier : fan;
  const endpoint = new MatterbridgeEndpoint([deviceType, bridgedNode, powerSource], { id: identity.ids.resolve(identity.serial) })
    .createDefaultIdentifyClusterServer()
    .createDefaultBridgedDeviceBasicInformationClusterServer(
      getDeviceName(identity.serial),
      identity.serial,
      identity.vendorId,
      vendorName,
      identity.productName.slice(0, maxProductNameLength),
    )
    .createDefaultPowerSourceWiredClusterServer()
    .createOnOffClusterServer(false);
  setInitialLabel(endpoint, identity);
  addFanControl(endpoint, layout);
  if (layout.hasHepaFilter) endpoint.createDefaultHepaFilterMonitoringClusterServer();
  if (layout.hasCarbonFilter) endpoint.createDefaultActivatedCarbonFilterMonitoringClusterServer();
  return endpoint.addRequiredClusters();
}

/**
 * Create an endpoint of a device beside its main endpoint, without the clusters of its device type
 *
 * @param {DeviceTypeDefinition} deviceType What the endpoint is in Matter.
 * @param {EndpointIdentity} identity The device the endpoint belongs to.
 * @param {string} key What tells the endpoint apart in the endpoint id, such as `night-mode`.
 * @param {string} code What tells the endpoint apart in the serial number, after a dash: one letter.
 * @param {string} label What the endpoint is, such as `Night Mode`. It follows the name of the device in the name and in the label of the endpoint.
 * @returns {MatterbridgeEndpoint} The endpoint.
 */
function createExtraEndpoint(deviceType: DeviceTypeDefinition, identity: EndpointIdentity, key: string, code: string, label: string): MatterbridgeEndpoint {
  const endpoint = new MatterbridgeEndpoint([deviceType, bridgedNode, powerSource], { id: identity.ids.resolve(`${identity.serial}-${key}`) })
    .createDefaultIdentifyClusterServer()
    .createDefaultBridgedDeviceBasicInformationClusterServer(
      `${getDeviceName(identity.serial)} ${label}`,
      `${identity.serial}-${code}`,
      identity.vendorId,
      vendorName,
      `Dyson ${label}`,
    )
    .createDefaultPowerSourceWiredClusterServer();
  return setInitialLabel(endpoint, identity, label);
}

/**
 * Create an endpoint that is a part of the main endpoint of a device, without the clusters of its device type
 *
 * A part has no name and no serial number: in Matter those are of the device, which is the main endpoint. It moves
 * between the rooms of a Matter app with it, and is unreachable when it is.
 *
 * @param {MatterbridgeEndpoint} main The main endpoint the part is a part of.
 * @param {EndpointIdentity} identity The device the part belongs to.
 * @param {DeviceTypeDefinition} deviceType What the endpoint is in Matter.
 * @param {string} key What tells the endpoint apart, such as `night-mode`: the base of its endpoint id.
 * @param {Semtag} [tag] What tells the endpoint apart for a Matter app.
 * @returns {MatterbridgeEndpoint} The endpoint.
 */
function createPartEndpoint(main: MatterbridgeEndpoint, identity: EndpointIdentity, deviceType: DeviceTypeDefinition, key: string, tag?: Semtag): MatterbridgeEndpoint {
  return main.addChildDeviceType(identity.ids.resolve(key), deviceType, tag === undefined ? {} : { tagList: [tag] }).createDefaultIdentifyClusterServer();
}

/**
 * Tag the next switch or mode select that is a part of a main endpoint
 *
 * Matter wants the parts of one device that have the same device type told apart by their tags, so each switch and each
 * mode select gets a number: its place among the parts of its kind, in the order they are created. The tag carries what
 * the part is as its label, for the Matter apps that show it.
 *
 * @param {MatterbridgeEndpoint} main The main endpoint the part is a part of.
 * @param {DeviceTypeDefinition} deviceType The device type of the parts of this kind: an outlet for a switch, or a mode select.
 * @param {string} label What the part is, such as `Night Mode`.
 * @returns {Semtag} The tag.
 */
function getNumberTag(main: MatterbridgeEndpoint, deviceType: DeviceTypeDefinition, label: string): Semtag {
  const count = main.getChildEndpoints().filter((part) => part.deviceTypes.has(deviceType.code)).length;
  // In the namespace of the numbers, the tag of a number is the number itself.
  return { ...CommonNumberTag.One, tag: count + 1, label };
}

/**
 * Create an endpoint beside the main one, as a part of it or as a device of its own
 *
 * @param {DeviceTypeDefinition} deviceType What the endpoint is in Matter.
 * @param {EndpointIdentity} identity The device the endpoint belongs to.
 * @param {string} key What tells the endpoint apart in the endpoint id.
 * @param {string} code What tells the endpoint apart in the serial number, after a dash: one letter.
 * @param {string} label What the endpoint is. It follows the device name in the name of a device of its own, and is the label of the tag of a tagged part.
 * @param {MatterbridgeEndpoint | undefined} main The main endpoint the endpoint is a part of. Left out, the endpoint is a device of its own.
 * @param {boolean} isTagged Whether a part is tagged: the parts of a device type that a device can have more than one of.
 * @returns {MatterbridgeEndpoint} The endpoint.
 */
function createSideEndpoint(
  deviceType: DeviceTypeDefinition,
  identity: EndpointIdentity,
  key: string,
  code: string,
  label: string,
  main: MatterbridgeEndpoint | undefined,
  isTagged: boolean,
): MatterbridgeEndpoint {
  if (main === undefined) return createExtraEndpoint(deviceType, identity, key, code, label);
  return createPartEndpoint(main, identity, deviceType, key, isTagged ? getNumberTag(main, deviceType, label) : undefined);
}

/**
 * Create one on/off switch of a device
 *
 * An outlet is the on/off device type every Matter app shows.
 *
 * @param {EndpointIdentity} identity The device the endpoint belongs to.
 * @param {string} key What tells the switch apart in the endpoint id, such as `night-mode`.
 * @param {string} code What tells the switch apart in the serial number, after a dash: one letter.
 * @param {string} label What the switch is, such as `Night Mode`.
 * @param {MatterbridgeEndpoint} [main] The main endpoint the switch is a part of. Left out, the switch is a device of its own.
 * @returns {MatterbridgeEndpoint} The endpoint, with its clusters and nothing subscribed yet.
 */
export function createSwitchEndpoint(identity: EndpointIdentity, key: string, code: string, label: string, main?: MatterbridgeEndpoint): MatterbridgeEndpoint {
  return createSideEndpoint(onOffPlugInUnit, identity, key, code, label, main, true).addRequiredClusters();
}

/**
 * Create one mode select of a device
 *
 * @param {EndpointIdentity} identity The device the endpoint belongs to.
 * @param {string} key What tells the select apart in the endpoint id, such as `humidity-select`.
 * @param {string} code What tells the select apart in the serial number, after a dash: one letter.
 * @param {string} label What the select picks, such as `Target Humidity`. It is also the description of its cluster.
 * @param {ModeSelect.ModeOption[]} supportedModes The modes it picks from: at least one.
 * @param {MatterbridgeEndpoint} [main] The main endpoint the select is a part of. Left out, the select is a device of its own.
 * @returns {MatterbridgeEndpoint} The endpoint, on its first mode until the first read, with nothing subscribed yet.
 */
export function createModeSelectEndpoint(
  identity: EndpointIdentity,
  key: string,
  code: string,
  label: string,
  supportedModes: ModeSelect.ModeOption[],
  main?: MatterbridgeEndpoint,
): MatterbridgeEndpoint {
  // Matter refuses a current or a start-up mode that is not one of the modes.
  const { mode } = supportedModes[0];
  return createSideEndpoint(modeSelect, identity, key, code, label, main, true).createDefaultModeSelectClusterServer(label, supportedModes, mode, mode).addRequiredClusters();
}

/**
 * Create the fan of the oscillation of a device: on/off is the power of the machine, the first speed the machine
 * standing still and each speed above it an angle it sweeps, narrowest first, or each speed an angle a machine that
 * tilts tilts to, and the fan mode Auto its breeze
 *
 * Its speeds are steps or a percent alone, as those of the main fan are.
 *
 * @param {EndpointIdentity} identity The device the endpoint belongs to.
 * @param {AccessoryLayout} layout How the controls of the device are laid out.
 * @param {MatterbridgeEndpoint} [main] The main endpoint the fan is a part of. Left out, it is a device of its own.
 * @returns {MatterbridgeEndpoint} The endpoint, off until the first read, with nothing subscribed yet.
 */
export function createOscillationFanEndpoint(identity: EndpointIdentity, layout: AccessoryLayout, main?: MatterbridgeEndpoint): MatterbridgeEndpoint {
  // Every letter is the code of another endpoint, so this one has two.
  const endpoint = createSideEndpoint(fan, identity, 'oscillation-fan', 'OF', 'Oscillation', main, true).createOnOffClusterServer(false);
  const { features, state } = getFanControlBase(layout.oscillationFanPositions.length, layout.hasFanSteps, layout.hasOscillationFanAuto);
  endpoint.behaviors.require(MatterbridgeFanControlServer.with(...features), state);
  return endpoint.addRequiredClusters();
}

/**
 * Create the thermostat of a heater: it heats alone, to the setpoints the heater takes
 *
 * A heater that shows a temperature in °C or °F has the unit as the display mode of the thermostat.
 *
 * @param {EndpointIdentity} identity The device the endpoint belongs to.
 * @param {AccessoryLayout} layout How the controls of the device are laid out.
 * @param {MatterbridgeEndpoint} [main] The main endpoint the thermostat is a part of. Left out, it is a device of its own.
 * @returns {MatterbridgeEndpoint} The endpoint, with no room temperature until the first read, and nothing subscribed yet.
 */
export function createThermostatEndpoint(identity: EndpointIdentity, layout: AccessoryLayout, main?: MatterbridgeEndpoint): MatterbridgeEndpoint {
  const { min, max } = layout.heatTargetRange;
  const endpoint = createSideEndpoint(thermostat, identity, 'heater', 'T', 'Heater', main, false).createDefaultHeatingThermostatClusterServer(
    defaultHeatTargetInC,
    defaultHeatTargetInC,
    min,
    max,
  );
  if (layout.hasTemperatureUnit) endpoint.createDefaultThermostatUserInterfaceConfigurationClusterServer();
  return endpoint.addRequiredClusters();
}

/**
 * Create the air quality sensor of a device, with a measurement for each pollutant its layout has
 *
 * A pollutant the machine reports as a concentration has its value. One it reports as an index alone, the volatile
 * organic compounds and the nitrogen dioxide, has a level.
 *
 * @param {EndpointIdentity} identity The device the endpoint belongs to.
 * @param {AccessoryLayout} layout How the controls of the device are laid out.
 * @param {MatterbridgeEndpoint} [main] The main endpoint the sensor is a part of. Left out, it is a device of its own.
 * @returns {MatterbridgeEndpoint} The endpoint, with no value until the first read.
 */
export function createAirQualityEndpoint(identity: EndpointIdentity, layout: AccessoryLayout, main?: MatterbridgeEndpoint): MatterbridgeEndpoint {
  const { Ugm3, Ppm } = ConcentrationMeasurement.MeasurementUnit;
  const air = ConcentrationMeasurement.MeasurementMedium.Air;
  const { pollutants } = layout;
  const endpoint = createSideEndpoint(airQualitySensor, identity, 'air-quality', 'Q', 'Air Quality', main, false).createDefaultAirQualityClusterServer(
    AirQuality.AirQualityEnum.Unknown,
  );
  if (pollutants.pm25) endpoint.createDefaultPm25ConcentrationMeasurementClusterServer(null, Ugm3, air);
  if (pollutants.pm10) endpoint.createDefaultPm10ConcentrationMeasurementClusterServer(null, Ugm3, air);
  if (pollutants.volatileOrganicCompounds) endpoint.createLevelTvocMeasurementClusterServer(ConcentrationMeasurement.LevelValue.Unknown, air);
  if (pollutants.nitrogenDioxide) {
    const { LevelIndication, MediumLevel, CriticalLevel } = ConcentrationMeasurement.Feature;
    endpoint.behaviors.require(NitrogenDioxideConcentrationMeasurementServer.with(LevelIndication, MediumLevel, CriticalLevel), {
      levelValue: ConcentrationMeasurement.LevelValue.Unknown,
      measurementMedium: air,
    });
  }
  if (pollutants.formaldehyde) endpoint.createDefaultFormaldehydeConcentrationMeasurementClusterServer(null, Ugm3, air);
  if (pollutants.carbonDioxide) endpoint.createDefaultCarbonDioxideConcentrationMeasurementClusterServer(null, Ppm, air);
  return endpoint.addRequiredClusters();
}

/**
 * Create the temperature sensor of a device
 *
 * @param {EndpointIdentity} identity The device the endpoint belongs to.
 * @param {MatterbridgeEndpoint} [main] The main endpoint the sensor is a part of. Left out, it is a device of its own.
 * @returns {MatterbridgeEndpoint} The endpoint, with no value until the first read.
 */
export function createTemperatureEndpoint(identity: EndpointIdentity, main?: MatterbridgeEndpoint): MatterbridgeEndpoint {
  return createSideEndpoint(temperatureSensor, identity, 'temperature', 'E', 'Temperature', main, false)
    .createDefaultTemperatureMeasurementClusterServer(null)
    .addRequiredClusters();
}

/**
 * Create the humidity sensor of a device
 *
 * @param {EndpointIdentity} identity The device the endpoint belongs to.
 * @param {MatterbridgeEndpoint} [main] The main endpoint the sensor is a part of. Left out, it is a device of its own.
 * @returns {MatterbridgeEndpoint} The endpoint, with no value until the first read.
 */
export function createHumidityEndpoint(identity: EndpointIdentity, main?: MatterbridgeEndpoint): MatterbridgeEndpoint {
  return createSideEndpoint(humiditySensor, identity, 'humidity', 'R', 'Humidity', main, false).createDefaultRelativeHumidityMeasurementClusterServer(null).addRequiredClusters();
}
