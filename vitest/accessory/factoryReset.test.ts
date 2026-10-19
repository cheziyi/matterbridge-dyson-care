/**
 * @file vitest/accessory/factoryReset.test.ts
 * @description This file contains the tests for a device that outlives a factory reset of the Matter node.
 * @author Calvin Che
 */

/**
 * WARNING!!!
 * The tests in this unit are supposed to run sequentially because they depend on the Matter state.
 * The node is reset to factory defaults, so they have a server node of their own.
 */

import type { MatterbridgeEndpoint } from 'matterbridge';
import type { ActionContext } from 'matterbridge/matter';
import { BridgedDeviceBasicInformation, OnOff, Thermostat } from 'matterbridge/matter/clusters';
import { log, setupTest } from 'matterbridge/vitest-utils';
import { addDevice, aggregator, createServerNode, createTestEnvironment, server, startServerNode, stopServerNode } from 'matterbridge/vitest-utils/matter';

import { DysonAccessory } from '../../src/accessory/dysonAccessory.js';
import { createDeviceConfig, createFakeClient, createSensors, factoryOf, type FakeClient, hotCool } from '../fakeDyson.js';

const online = { fabric: 1 } as unknown as ActionContext;
const vendorId = 0xfff1;

/**
 * Write an attribute the way a controller does: the value lands, then the change is announced with a fabric
 *
 * @param {MatterbridgeEndpoint | undefined} endpoint The endpoint.
 * @param {string} cluster The cluster name.
 * @param {string} attribute The attribute name.
 * @param {unknown} value The value to write.
 * @returns {Promise<void>} Resolves when the change is announced.
 */
async function writeAsController(endpoint: MatterbridgeEndpoint | undefined, cluster: string, attribute: string, value: unknown): Promise<void> {
  if (endpoint === undefined) throw new Error('The endpoint is missing');
  const previous: unknown = endpoint.getAttribute(cluster, attribute);
  await endpoint.setAttribute(cluster, attribute, value as never);
  const events = endpoint.eventsOf(cluster.charAt(0).toLowerCase() + cluster.slice(1)) as Record<string, { emit: (...parameters: unknown[]) => void } | undefined>;
  events[`${attribute}$Changed`]?.emit(value, previous, online);
}

await setupTest('FactoryReset', false);

describe('a device when the Matter node is reset to factory defaults', () => {
  let client: FakeClient;
  let accessory: DysonAccessory;

  beforeAll(async () => {
    await createTestEnvironment();
    await createServerNode(6203);
    await startServerNode();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await accessory.dispose();
    await stopServerNode();
    vi.restoreAllMocks();
  });

  it('should take the writes of a controller before the reset', async () => {
    // A heater with a thermostat, which the node writes its temperature to as it goes online.
    client = createFakeClient(hotCool, { heatMode: 'off', targetTemperatureInC: 20 });
    const config = createDeviceConfig(hotCool, { name: 'Lounge', nightModeControl: 'switch', heatControl: 'thermostat' });
    accessory = new DysonAccessory({ config, createClient: factoryOf(client), log, vendorId, commandDelayInMs: 500 });
    for (const endpoint of accessory.endpoints) expect(await addDevice(aggregator, endpoint)).toBe(true);
    await accessory.start();
    await writeAsController(accessory.endpoint, 'OnOff', 'onOff', false);
    await accessory.flushCommands();
    expect(client.setState).toHaveBeenCalledExactlyOnceWith({ fanPower: false });
  });

  it('should subscribe again once the node is back, and write the state of the machine again', async () => {
    client.state.fanPower = true;
    client.sensors = createSensors({ temperatureInC: 18 });
    const info = vi.spyOn(log, 'info');
    const isOnlineAtRead: boolean[] = [];
    client.getState.mockImplementation(async () => {
      isOnlineAtRead.push(server.lifecycle.isOnline);
      return { ...client.state };
    });
    // A poll, a state and readings the machine sends while the node is offline for the reset write nothing, and wait
    // for the node instead.
    const pollDuringReset = new Promise<boolean>((resolve) => {
      server.lifecycle.offline.once(() => {
        client.handlers.onState({ ...client.state });
        client.handlers.onSensors(createSensors({ temperatureInC: 18 }));
        resolve(accessory.refresh());
      });
    });
    await server.erase();
    expect(await pollDuringReset).toBe(false);
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith('"Lounge" is subscribed again after the Matter node was reset'), { timeout: 5000 });
    // The reset put the heater back to off and the room to no temperature: the state of the machine replaces them.
    await vi.waitFor(() => expect(accessory.endpoint.getAttribute(OnOff, 'onOff')).toBe(true), { timeout: 5000 });
    await vi.waitFor(() => expect(accessory.thermostat?.getAttribute(Thermostat, 'localTemperature')).toBe(1800), { timeout: 5000 });
    // One read once the node is online, for the poll that waited and every endpoint that came back.
    expect(isOnlineAtRead).toEqual([true]);
  });

  it('should take the writes of a controller to each endpoint after the reset', async () => {
    await writeAsController(accessory.endpoint, 'OnOff', 'onOff', false);
    await accessory.flushCommands();
    expect(client.setState).toHaveBeenLastCalledWith({ fanPower: false });
    await writeAsController(accessory.nightModeSwitch, 'OnOff', 'onOff', true);
    await accessory.flushCommands();
    // The machine is off, and the night mode leaves it off.
    expect(client.setState).toHaveBeenLastCalledWith({ nightMode: true, fanPower: false });
    // Each write was taken once: the reset left no subscription behind twice.
    expect(client.setState).toHaveBeenCalledTimes(2);
  });

  it('should show a device signed out while the node is offline as unreachable once the node is back', async () => {
    const suspendDuringReset = new Promise<void>((resolve) => {
      server.lifecycle.offline.once(() => {
        resolve(accessory.suspend());
      });
    });
    await server.erase();
    await suspendDuringReset;
    await vi.waitFor(() => expect(accessory.endpoint.getAttribute(BridgedDeviceBasicInformation, 'reachable')).toBe(false), { timeout: 5000 });
    expect(client.getState).not.toHaveBeenCalled();
  });

  it('should write nothing once the node is back when the device was disposed while it was offline', async () => {
    const info = vi.spyOn(log, 'info');
    const disposeDuringReset = new Promise<void>((resolve) => {
      server.lifecycle.offline.once(() => {
        resolve(
          (async (): Promise<void> => {
            // The sign-out waits for the node, and the device is gone by the time it is back.
            await accessory.suspend();
            await accessory.dispose();
          })(),
        );
      });
    });
    await server.erase();
    await disposeDuringReset;
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith('"Lounge" is subscribed again after the Matter node was reset'), { timeout: 5000 });
    await vi.waitFor(() => expect(server.lifecycle.isOnline).toBe(true), { timeout: 5000 });
    // Disposing again waits for what the node queued as it came back.
    await accessory.dispose();
    // The reset put the reachability back to its default, which nothing writes over.
    expect(accessory.endpoint.getAttribute(BridgedDeviceBasicInformation, 'reachable')).toBe(true);
    expect(client.getState).not.toHaveBeenCalled();
  });
});
