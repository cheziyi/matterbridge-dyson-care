# Matterbridge Dyson Care

[![npm version](https://img.shields.io/npm/v/matterbridge-dyson-care.svg)](https://www.npmjs.com/package/matterbridge-dyson-care)
[![npm downloads](https://img.shields.io/npm/dt/matterbridge-dyson-care.svg)](https://www.npmjs.com/package/matterbridge-dyson-care)
[![Node.js CI](https://github.com/cheziyi/matterbridge-dyson-care/actions/workflows/build.yml/badge.svg)](https://github.com/cheziyi/matterbridge-dyson-care/actions/workflows/build.yml)
[![CodeQL](https://github.com/cheziyi/matterbridge-dyson-care/actions/workflows/codeql.yml/badge.svg)](https://github.com/cheziyi/matterbridge-dyson-care/actions/workflows/codeql.yml)
[![codecov](https://codecov.io/gh/cheziyi/matterbridge-dyson-care/branch/main/graph/badge.svg)](https://codecov.io/gh/cheziyi/matterbridge-dyson-care)
[![license](https://img.shields.io/npm/l/matterbridge-dyson-care.svg)](./LICENSE)

[![powered by](https://img.shields.io/badge/powered%20by-matterbridge-blue)](https://www.npmjs.com/package/matterbridge)
[![powered by](https://img.shields.io/badge/powered%20by-dyson--control-blue)](https://www.npmjs.com/package/dyson-control)

Control your Dyson purifiers, fans, heaters and humidifiers from Apple Home, Google Home, Alexa, Home Assistant and other Matter apps.

It is a [Matterbridge](https://matterbridge.io) plugin built on [dyson-control](https://www.npmjs.com/package/dyson-control), which reaches each machine through the Dyson cloud with your Dyson account, the way the Dyson app does. It covers the environmental care machines dyson-control knows: see its [machines](https://github.com/cheziyi/dyson-control#machines) and its [coverage and limitations](https://github.com/cheziyi/dyson-control#coverage--limitations).

## Why this plugin

- **It finds your machines for you.** Sign in once in the setup page and it lists every machine of your Dyson account, with whether it can control each one. There is no serial number, credential or configuration file to look up: see [Guided setup](#guided-setup).
- **It fits the Matter app you use.** Matter apps differ in what they show, so you choose how each control appears: the oscillation, the night mode and the airflow direction on the fan itself or as switches, the auto mode as a fan mode, a switch or a step, and a mode select for the oscillation angle or the target humidity. Presets for Apple Home and Google Home give you a starting point: see [Presets](#presets).
- **It offers only what your machine can do.** The plugin reads which controls each machine carries from its type, its variant and its firmware, and builds its device in Matter from that. A heater gets a thermostat, a humidifier its humidifying, a purifier its air quality sensor.
- **It shows the air quality.** A purifier gets an air quality sensor with the air quality of its worst pollutant and each pollutant it measures: PM2.5, PM10, VOC, NO₂, formaldehyde and CO₂.
- **You name each machine.** The Dyson app names a machine after its room, which several machines can share: the setup page starts from that name and lets you give each machine a name of its own in Matter. A machine whose firmware gains a control gets it.
- **It says when a machine stops answering.** After two reads in a row fail, your Matter app shows the machine as unreachable, and it comes back by itself on the first read that works.
- **Nothing needs a restart.** Sign in, add, change and remove machines while Matterbridge keeps running.

## Requirements

- Matterbridge 3.10.10 or later.
- Node.js 22.13 or later (22, 24 or 26). Node.js 20 is not supported, because dyson-control needs Node.js 22.
- A Dyson account, signed in with an email address, and a route to the internet: the machines are reached through the Dyson cloud, not over the local network.

## Installation

In the Matterbridge frontend, type `matterbridge-dyson-care` in the **Install plugins** field and click **Install**, then restart Matterbridge.

From the command line instead:

```bash
npm install -g matterbridge-dyson-care
matterbridge --add matterbridge-dyson-care
```

Then set up your machines in the plugin's own page: see [Guided setup](#guided-setup).

## Guided setup

Open the plugin frontend from the plugin's row on the Matterbridge home page. It walks through four steps:

1. **Sign in.** Enter the email address and the country of your Dyson account. Dyson emails you a code: enter it with your password. The password is used once and not stored.
2. **Find.** The page lists the machines of your account, and says why it cannot control one, such as a robot vacuum or a machine of a type dyson-control does not know yet.
3. **Connect.** For each machine you picked, the plugin checks that it answers through the Dyson cloud, and reads which sensors it has.
4. **Options.** The name the machine gets in Matter, starting from its room name in the Dyson app, and how the fan, the oscillation, the night mode, the airflow direction, the heating, the humidifying and the readings appear in Matter, from what the machine can do. Start from a [preset](#presets) or choose each one yourself.

Afterwards the same page lists your machines with their status: online, connecting while a machine just added or rebuilt connects through the cloud, not answering, or not started. From there you can add more, change the options of one, reconnect one that stopped answering, remove one, sign in again, or sign out. None of this needs a Matterbridge restart.

## How a machine appears in Matter

| In Matter         | From the machine                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Air purifier      | The machine, with its power and its fan speed. You can make it a fan instead: see [Air purifier or fan](#air-purifier-or-fan)         |
| Fan speed         | Speeds 1 to 10, as steps or as a percentage                                                                                           |
| Auto mode         | Your choice, on a machine that has one: see [Auto mode](#auto-mode)                                                                   |
| Oscillation       | Your choice: see [Oscillation](#oscillation)                                                                                          |
| Night mode        | Your choice: see [Night mode and airflow direction](#night-mode-and-airflow-direction)                                                |
| Airflow direction | Your choice, on a machine that blows its air to the front or the back                                                                 |
| Heating           | A thermostat or a switch, on a heater: see [Heating](#heating)                                                                        |
| Humidifying       | Switches or a mode select, on a humidifier: see [Humidifying](#humidifying)                                                           |
| Readings          | An air quality sensor, a temperature sensor and a humidity sensor, each once the machine gives its reading: see [Readings](#readings) |

### How it is built in Matter

Matter describes a device as endpoints. Each endpoint has one or more device types, which say what it is, and clusters, which hold its attributes and commands. Each machine is one device: an endpoint for the air purifier or the fan, with every control or sensor that has no place on it as a part of it, on an endpoint of its own:

```mermaid
flowchart TD
    bridge["Matterbridge<br/>Aggregator"]
    subgraph device["One device in a Matter app"]
        main["<b>Living Room</b><br/>Air Purifier or Fan, Bridged Node, Power Source<br/>On/Off, Fan Control, with Rocking, Wind and Airflow Direction when they are there"]
        thermostat["Thermostat<br/>Thermostat, heating only"]
        switches["On/Off Plug-in Unit, one for each switch<br/>tagged 1 Auto Mode, 2 Night Mode and so on<br/>On/Off"]
        selects["Mode Select, for the oscillation and the target humidity<br/>Mode Select"]
        air["Air Quality Sensor<br/>Air Quality, and a concentration measurement for each pollutant"]
        sensors["Temperature Sensor, Humidity Sensor<br/>Temperature Measurement, Relative Humidity Measurement"]
    end
    bridge --> main
    main -.-> thermostat
    main -.-> switches
    main -.-> selects
    main -.-> air
    main -.-> sensors
```

A solid line is always there. A dashed one is there when you choose it in the setup and the machine has it, and for a sensor once the machine gives its reading. The main endpoint also has the Bridged Node and Power Source device types, with the Identify, Bridged Device Basic Information and Power Source clusters: the name and the serial number of the machine, whether it is reachable, and that it runs on mains power. Its parts have none of these, because in Matter they belong to the device. The setup can also make each part a device of its own: see [One device or several](#one-device-or-several).

| Device type         | ID     | Stands for                                            |
| ------------------- | ------ | ----------------------------------------------------- |
| Aggregator          | 0x000E | Matterbridge, which holds the devices it bridges      |
| Bridged Node        | 0x0013 | Each device: its name, serial number and reachability |
| Power Source        | 0x0011 | Each device: mains powered                            |
| Air Purifier        | 0x002D | The machine, as an air purifier                       |
| Fan                 | 0x002B | The machine, as a fan                                 |
| Thermostat          | 0x0301 | The heating of a heater                               |
| On/Off Plug-in Unit | 0x010A | Each switch                                           |
| Mode Select         | 0x0027 | The oscillation select and the target humidity select |
| Air Quality Sensor  | 0x002C | The air quality and the pollutants                    |
| Temperature Sensor  | 0x0302 | The room temperature                                  |
| Humidity Sensor     | 0x0307 | The room humidity                                     |

### Air purifier or fan

| Option       | In Matter                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------- |
| Air purifier | The Matter device type of a purifier. The presets pick it for a machine that measures the air  |
| Fan          | The Matter device type every app shows, with the same fan speed. The presets pick it for a fan |

Both have an on/off and a fan control. Setting the fan to off or 0 turns the machine off, and a speed turns it on.

### Fan speed

| Option     | In Matter                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Steps      | Ten steps, one for each speed, and a percentage beside them                                            |
| Percentage | A slider from 0 to 100. The plugin rounds it to the nearest speed: 10 % is speed 1, and 100 % speed 10 |

Matter also has the fan modes Low, Medium and High, which apps show as buttons or reach by voice. Each picks a speed of the machine: Low the slowest, Medium the one nearest 50 %, and High the fastest, wherever auto is on the scale. Matterbridge sets a fan mode picked to the middle percentage of its third, such as 84 % for High, so a slider moved to exactly that percentage counts as the fan mode, and picks that speed instead of the nearest one. Low is speed 1, Medium speed 5 and High speed 10.

### Auto mode

In its auto mode the machine picks its fan speed from the air it measures. On a machine that has one, the setup puts it in one of these places:

| Option               | In Matter                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native fan mode only | The Auto fan mode of the fan control, as Matter has it. Not every app shows it                                                                               |
| A switch             | The Auto fan mode, and a switch named `<name> Auto Mode` beside it. On turns the auto mode on. Off puts the fan back at the speed it last ran at, or speed 5 |
| The first step       | Below speed 1: step 1, or the bottom of the slider                                                                                                           |
| The last step        | Above speed 10: the top step, or 100 %                                                                                                                       |

A step takes the place of the Auto fan mode, because in that mode Matter holds no percent: the fan then has eleven steps. Turning the auto mode off on a machine that is off leaves it off.

### Oscillation

| Option        | In Matter                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| On the fan    | The left and right rocking of the fan control, as Matter has it. Not every app shows it                                                                     |
| A switch      | A switch named `<name> Oscillation`. On sweeps the angle set in the Dyson app                                                                               |
| A mode select | A mode select named `<name> Oscillation`, with Off and the angles the machine sweeps: see below. Few Matter apps show it: see [Mode selects](#mode-selects) |
| Not shown     | No oscillation control. The oscillation stays as the Dyson app sets it                                                                                      |

The mode select offers what the machine takes:

| Machine                             | Angles                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| One whose firmware takes two angles | The sweeps it takes, 45°, 90°, 180° and 350°, each centred where the machine oscillates now, within the 5° to 355° it turns through |
| One with preset angles              | Its presets: 45°, 90°, 180° and 350°, or 15°, 40° and 70° on some models                                                            |
| A humidifier whose barrel turns     | 45°, 90° and Breeze                                                                                                                 |

A machine that oscillates only on and off gets no mode select, and nor does one whose firmware takes its two angles only as one direction, as on the types 635 and 739: the oscillation is a switch on them. A machine that tilts gets no oscillation control at all: dyson-control does not set the tilt.

### Night mode and airflow direction

| Option     | Night mode                                                                  | Airflow direction                                                                             |
| ---------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| On the fan | The sleep wind of the fan control, as Matter has it. Not every app shows it | The airflow direction of the fan control: forward is the front. Not every app shows it        |
| A switch   | A switch named `<name> Night Mode`                                          | A switch named `<name> Front Airflow`. On blows the air out of the front, off out of the back |
| Not shown  | The night mode stays as the Dyson app sets it                               | The direction stays as the Dyson app sets it                                                  |

The airflow direction is offered on a machine that blows its air to the front or the back.

### Heating

On a heater, the heating appears in one of these places. It runs only while the machine is on, so turning it on turns the machine on.

| Option       | In Matter                                                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A thermostat | A thermostat that heats, with a setpoint from 1 to 37 °C in whole degrees, named `<name> Heater` as a device of its own. Off turns the heating off and leaves the fan running |
| A switch     | A switch named `<name> Heat`. It heats to the setpoint set in the Dyson app                                                                                                   |
| Not shown    | The heating stays as the Dyson app sets it                                                                                                                                    |

The machine does not say whether its heater is running, so the thermostat shows it heating while the machine heats and the room is below the setpoint.

### Humidifying

Matter has no humidifier, so on a humidifier the humidifying appears in one of these places. It runs only while the machine is on, so turning it on turns the machine on.

| Option        | In Matter                                                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Switches      | A switch named `<name> Humidify`, which humidifies to the target set in the Dyson app, and one named `<name> Auto Humidify` on a machine that picks its own target                                 |
| A mode select | A mode select named `<name> Target Humidity`, with Off, Auto on a machine that has it, and 30 %, 40 %, 50 %, 60 % and 70 %. A target the machine holds between two of them shows as the nearer one |
| Not shown     | The humidifying stays as the Dyson app sets it                                                                                                                                                     |

### Mode selects

A mode select is the Matter device type that picks one value from a list, as a drop-down does. **Few Matter apps show a mode select.** Home Assistant shows each one as a select among the settings of the device. Apple Home is reported not to show them, and Google Home, Amazon Alexa and SmartThings do not list them among the devices they support. This has not been tested with this plugin. In the other apps, the switches are the way to reach these controls.

### Readings

| Reading     | In Matter                                                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Air quality | An air quality sensor named `<name> Air Quality`, on a machine that measures the air. Its air quality is that of its worst pollutant, and it has a measurement of each pollutant the machine gives |
| Temperature | A temperature sensor named `<name> Temperature`. A thermostat shows the room temperature too                                                                                                       |
| Humidity    | A humidity sensor named `<name> Humidity`                                                                                                                                                          |

| Pollutant                    | In Matter                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| PM2.5, PM10 and formaldehyde | A concentration, in μg/m³                                                               |
| CO₂                          | A concentration, in parts per million                                                   |
| VOC and NO₂                  | A level, low, medium, high or critical, from the machine's own index, which has no unit |

Dyson rates the air from good to severe on one index for every pollutant, and Matter from good to extremely poor. The six bands are taken in order:

| Dyson index | Dyson          | Matter air quality | Matter level |
| ----------- | -------------- | ------------------ | ------------ |
| Under 4     | Good           | Good               | Low          |
| 4 to 7      | Fair           | Fair               | Medium       |
| 7 to 9      | Poor           | Moderate           | High         |
| 9 to 11     | Very poor      | Poor               | High         |
| 11 to 13    | Extremely poor | Very poor          | Critical     |
| 13 and over | Severe         | Extremely poor     | Critical     |

- **No machine says which readings it has**, beyond whether it measures the air, so the plugin goes by what the machine reads. The setup page offers a temperature or a humidity sensor only once the machine has given that reading, so a machine without them, such as the HushJet Purifier Compact, is offered neither. A sensor gets its place in Matter the first time the machine gives its reading: at once for one it gave during setup, and otherwise the machine is built again in Matter when the reading first comes.
- **A reading keeps its place from then on**, so a sensor does not come and go in your Matter app.
- **A reading the machine does not give right now shows no value**, instead of the last one it gave.
- **Continuous monitoring.** A machine that can keep measuring the air while it is off can get a switch named `<name> Continuous Monitoring`. On keeps its readings fresh while it is off.

### Presets

In the Options step, a preset fills in every choice above for what the machine can do. You can change any of them afterwards. A new machine starts with the Apple Home preset, and one already set up keeps its own choices.

| Preset              | Fan speed  | Auto mode  | Oscillation, night mode | Airflow direction | Heating    | Humidifying   | Continuous monitoring | Sensors | Parts of the main device |
| ------------------- | ---------- | ---------- | ----------------------- | ----------------- | ---------- | ------------- | --------------------- | ------- | ------------------------ |
| Apple Home          | Percentage | On the fan | Switches                | Not shown         | Thermostat | Switches      | No switch             | All     | No                       |
| Google Home         | Steps      | A switch   | Switches                | Not shown         | Thermostat | Switches      | No switch             | All     | No                       |
| Full Matter support | Steps      | On the fan | On the fan              | On the fan        | Thermostat | A mode select | A switch              | All     | Yes                      |

Every preset makes a machine that measures the air an air purifier, and one that does not a fan. Apple Home and Google Home are not known to show the rocking, the sleep wind or the airflow direction of a fan control, which is why their presets use switches for them. The Google Home preset adds a switch for the auto mode as well, and the Apple Home preset leaves the auto mode on the fan control alone. This has not been tested with this plugin: try the native places in your app, and pick the switches where they do not show.

### One device or several

The thermostat, the switches, the mode selects and the sensors are parts of the air purifier or the fan, which Matter calls a composed device, so they move between rooms with it. The setup can make each of them a device of its own instead, beside it. A Matter app then does not know that they belong together, so each is put in a room by itself.

|                 | Parts of the main device                                                                                                      | Devices of their own                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| In a Matter app | One device                                                                                                                    | One device for the machine, and one for each of the others |
| Rooms           | The parts move with the machine                                                                                               | Each is put in a room by itself                            |
| Names           | The machine alone has one. Each switch and each mode select is tagged with a number and with what it is, such as `Night Mode` | Each has its own, such as `<name> Night Mode`              |
| Unreachable     | The machine says so for all of them                                                                                           | Each says so itself                                        |

Matter names a device, not its parts, so what a part is called is up to the Matter app. One that reads the tags can show `Night Mode`, one that does not shows numbered outlets to rename yourself, and one that shows no parts at all shows the machine alone. This has not been tested in each Matter app: try it in yours, and turn it off if the parts do not show as you want.

Changing the choice builds the machine again in Matter, so a Matter app takes its parts for new devices: they lose the rooms, the names and the automations they had there.

## How devices are stored

The plugin knows each machine by its **serial number**, which is also the serial number it has in Matter. A switch, a mode select or a sensor that is a device of its own has that serial number with a dash and a letter after it, such as `NK6-EU-MHA0000A-N` for the night mode switch:

- **The firmware is kept up to date.** The plugin reads the machine list of your account when it starts and every 15 minutes, and takes the firmware each machine runs now.
- **Each device has the name you give it in the setup page**, which starts as the room name of the Dyson app, followed by a number when another device has that name already, such as `Bedroom 2`. A new room name in the Dyson app does not change it. No two devices share a name, because the name is what Matter shows and what its switches and sensors are named after.
- **A new name builds the device again in Matter**, with the same serial number. A Matter app may take it for a new device, and ask you again for its room and its automations.
- **What each machine can do** is read from its type, its variant and its firmware capabilities, as the cloud reports them. When a firmware update gives a machine other controls, it is built again in Matter and a setting it no longer takes is reset.
- **The readings each machine has given** are kept in the plugin's storage, so that its sensors are there from the start after a restart.

The account and the devices are stored in the plugin configuration, which Matterbridge keeps in `matterbridge-dyson-care.config.json`. The account is stored as the sign-in token Dyson gives the plugin, with its email address and country, and never the password. The devices are added, changed and removed in the setup page only: the Matterbridge config editor does not list them.

A stored device that this version of the plugin cannot read, for example one stored by a later version, is ignored and logged. It stays in the configuration as it is, until a device with its name or its serial number is added in the setup page. A setting whose stored value is not valid falls back to its default, which is logged as well.

## Configuration

| Setting                 | Meaning                                                                                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pollIntervalInSeconds` | How often the state and the readings of each machine are read, 10 to 3600. Defaults to 30. A machine sends a change of its state by itself, so this mostly sets how fresh the readings are, and how soon a machine that is unplugged shows as unreachable |

## Good to know

- **It needs the Dyson cloud.** Each machine is reached through the Dyson cloud, which needs a route to the internet: without one, the machines show as unreachable. See dyson-control's [connectivity](https://github.com/cheziyi/dyson-control/blob/main/DESIGN.md#connectivity) for why it does not talk to a machine over the local network.
- **The sign-in can expire.** How long the cloud accepts a sign-in is not known. When it stops accepting it, the plugin logs a warning and the setup page asks you to sign in again. Signing out leaves the machines in Matter, unreachable, with their rooms and automations, until you sign in again.
- **A change on the machine shows up at once.** A machine sends its state to the cloud when it changes, from its remote or the Dyson app, and the plugin writes it to Matter as it comes.
- **Commands are grouped.** A Matter app often changes several things at once. The plugin collects the changes of 300 milliseconds and sends them to the machine as one command.
- **A device is reported as unreachable** after two reads in a row fail, or when its connection to the cloud closes and does not open again. It is reachable again on the first read that works.
- **The setup page is as open as Matterbridge itself.** Anyone who can reach the Matterbridge frontend can use it, and so control the machines of the signed-in account. It never returns the stored sign-in token.
- **Not in Matter:** the filter life, the sleep timer, the tilt of a machine that tilts, and the find and follow of a machine that has it. A machine on the RabbitMQ broker of the Dyson cloud, and an account that signs in with a mobile number, are not supported by dyson-control.

## Development

The plugin is developed from the [Matterbridge plugin template](https://github.com/Luligu/matterbridge-plugin-template); see its README for the dev container and the toolchain, and [STYLEGUIDE.md](./STYLEGUIDE.md) and [AGENTS.md](./AGENTS.md) for the conventions.

```bash
npm install
npm link matterbridge        # with matterbridge installed globally
npm run build                # the plugin, into dist
npm run build:frontend       # the setup page, into apps/frontend/build (run npm install in apps/frontend and npm run build first)
npm run test:coverage
npm run lint
```

The plugin's source is in [src](./src), and its tests follow the same layout under [vitest](./vitest):

| Path                             | What it holds                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [module.ts](./src/module.ts)     | The platform: the Matterbridge entry point, the account, the stored device list and the devices that run from it.                    |
| [config.ts](./src/config.ts)     | The stored configuration: its model, its validation and its comparisons.                                                             |
| [controls.ts](./src/controls.ts) | What the capabilities of a machine let its device have in Matter, and the readings it has given.                                     |
| [mapping.ts](./src/mapping.ts)   | The conversions between the Dyson model and the Matter clusters.                                                                     |
| [errors.ts](./src/errors.ts)     | The helpers that describe errors.                                                                                                    |
| [accessory/](./src/accessory)    | One machine in Matter: its endpoints, what the controllers ask of it and what the machine answers.                                   |
| [platform/](./src/platform)      | What the platform keeps between restarts and machine lists: the readings of each machine, its own saves, the names and the firmware. |
| [setup/](./src/setup)            | The guided setup: the checks of a machine and the REST API of the setup page.                                                        |

The setup page is a small TypeScript page without a framework, in [apps/frontend](./apps/frontend), which esbuild bundles into one `app.js`. Matterbridge serves `apps/frontend/build` at `/plugins/matterbridge-dyson-care/`, and the page calls the plugin through `onFetch`: see [src/setup/setupApi.ts](./src/setup/setupApi.ts). The page takes the types of what the plugin sends from the plugin itself, through a TypeScript project reference to the plugin's build, which is why the plugin is built first. What a machine leaves to choose is worked out by the plugin and sent to the page: see `getAvailableControls` in [src/controls.ts](./src/controls.ts).

The tests run the plugin against fake machines, whose capabilities dyson-control decodes from real machine types: see [vitest/fakeDyson.ts](./vitest/fakeDyson.ts).

## Legal disclaimer

An independent, community project for interoperability and home automation. It is not affiliated with, authorized, or endorsed by Dyson. All product names and trademarks are the property of their respective owners.

The plugin talks to the Dyson cloud with the account you sign in with, as an ordinary client of the cloud's own endpoints. Its use may be subject to Dyson's terms of service.

## License

[Apache-2.0](./LICENSE)
