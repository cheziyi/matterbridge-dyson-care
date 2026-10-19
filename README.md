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
4. **Options.** The name the machine gets in Matter, starting from its room name in the Dyson app, and how the fan, the oscillation or the tilt, the night mode, the airflow direction, the find and follow, the heating, the humidifying, the water hardness, the filters and the readings appear in Matter, from what the machine can do. Start from a [preset](#presets) or choose each one yourself.

Afterwards the same page lists your machines with their status: online, connecting while a machine just added or rebuilt connects through the cloud, not answering, or not started. Under each machine it shows the life left in its filters, when its next clean cycle is due, and the faults it reports, such as a filter to replace or an empty tank. From there you can add more, change the options of one, reconnect one that stopped answering, remove one, sign in again, or sign out. None of this needs a Matterbridge restart.

## How a machine appears in Matter

| In Matter         | From the machine                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Air purifier      | The machine, with its power and its fan speed. You can make it a fan instead: see [Air purifier or fan](#air-purifier-or-fan)           |
| Fan speed         | Speeds 1 to 10, as steps or as a percentage                                                                                             |
| Auto mode         | Your choice, on a machine that has one: see [Auto mode](#auto-mode)                                                                     |
| Oscillation       | Your choice, or the tilt of a machine that tilts: see [Oscillation](#oscillation) and [Tilt](#tilt)                                     |
| Night mode        | Your choice: see [Night mode and airflow direction](#night-mode-and-airflow-direction)                                                  |
| Airflow direction | Your choice, on a machine that blows its air to the front or the back                                                                   |
| Find and follow   | A switch or a mode select, on a machine that follows the people it finds: see [Find and follow](#find-and-follow)                       |
| Heating           | A thermostat or a switch, on a heater: see [Heating](#heating)                                                                          |
| Humidifying       | Switches or a mode select, on a humidifier: see [Humidifying](#humidifying)                                                             |
| Water hardness    | A mode select, on a humidifier that runs a clean cycle: see [Humidifying](#humidifying)                                                 |
| Filters           | The life left in each filter, on every air purifier: see [Filters](#filters)                                                            |
| More controls     | Switches or mode selects for the child lock, the UV light and the like, on a machine that has them: see [More controls](#more-controls) |
| Readings          | An air quality sensor, a temperature sensor and a humidity sensor, each once the machine gives its reading: see [Readings](#readings)   |

A switch or a mode select is for the Matter apps that do not show a control in its place on the fan control: it comes beside that place, never in place of it, so the place stays for the apps that show it. A control that has a place on the fan control is never hidden, because an app that does not show the place leaves it out. The oscillation is the one exception: its switch or its select takes the place of the rocking, because Apple Home mishandles the rocking.

### How it is built in Matter

Matter describes a device as endpoints. Each endpoint has one or more device types, which say what it is, and clusters, which hold its attributes and commands. Each machine is one device: an endpoint for the air purifier or the fan, with every control or sensor that has no place on it as a part of it, on an endpoint of its own:

```mermaid
flowchart TD
    bridge["Matterbridge<br/>Aggregator"]
    subgraph device["One device in a Matter app"]
        main["<b>Living Room</b><br/>Air Purifier or Fan, Bridged Node, Power Source<br/>On/Off, Fan Control, with Rocking, Wind and Airflow Direction when they are there<br/>HEPA and Activated Carbon Filter Monitoring on an air purifier"]
        thermostat["Thermostat<br/>Thermostat, heating only"]
        switches["On/Off Plug-in Unit, one for each switch<br/>tagged 1 Auto Mode, 2 Night Mode and so on<br/>On/Off"]
        selects["Mode Select, one for each select: the oscillation or the tilt,<br/>the find and follow, the target humidity and the water hardness<br/>Mode Select"]
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
| Mode Select         | 0x0027 | Each select                                           |
| Air Quality Sensor  | 0x002C | The air quality and the pollutants                    |
| Temperature Sensor  | 0x0302 | The room temperature                                  |
| Humidity Sensor     | 0x0307 | The room humidity                                     |

An air purifier also has the HEPA Filter Monitoring (0x0071) and Activated Carbon Filter Monitoring (0x0072) clusters for its filters: see [Filters](#filters).

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

Matter also has the fan modes Low, Medium and High, which apps show as buttons or reach by voice. Matterbridge sets a fan mode picked to the middle percentage of its third, 17 %, 50 % or 84 %, which the plugin rounds to the nearest speed as it does any percentage: Low is speed 2, Medium speed 5 and High speed 8.

### Auto mode

In its auto mode the machine picks its fan speed from the air it measures. On a machine that has one, the setup puts it in one of these places:

| Option               | In Matter                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native fan mode only | The Auto fan mode of the fan control, as Matter has it. Not every app shows it                                                                               |
| A switch             | The Auto fan mode, and a switch named `<name> Auto Mode` beside it. On turns the auto mode on. Off puts the fan back at the speed it last ran at, or speed 5 |
| The first step       | Below speed 1: step 1, or the bottom of the slider                                                                                                           |
| The last step        | Above speed 10: the top step, or 100 %                                                                                                                       |

A step takes the place of the Auto fan mode, because in that mode Matter holds no percent: the fan then has eleven steps. The fan modes then round to the nearest of those: with auto first, Low is speed 1, Medium speed 5 and High speed 8, and with auto last, Low is speed 2, Medium speed 6 and High speed 9. Turning the auto mode off on a machine that is off leaves it off.

### Oscillation

| Option         | In Matter                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native rocking | The left and right rocking of the fan control, as Matter has it. Not every app shows it                                                                                              |
| A switch       | A switch named `<name> Oscillation`, in place of the rocking. On sweeps the angle set in the Dyson app                                                                               |
| A mode select  | A mode select named `<name> Oscillation`, in place of the rocking, with Off and the angles the machine sweeps: see below. Few Matter apps show it: see [Mode selects](#mode-selects) |

The mode select offers what the machine takes:

| Machine                             | Angles                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| One whose firmware takes two angles | The sweeps it takes, 45°, 90°, 180° and 350°, each centred where the machine oscillates now, within the 5° to 355° it turns through |
| One with preset angles              | Its presets: 45°, 90°, 180° and 350°, or 15°, 40° and 70° on some models                                                            |
| A humidifier whose barrel turns     | 45°, 90° and Breeze                                                                                                                 |

A machine that oscillates only on and off gets no mode select, and nor does one whose firmware takes its two angles only as one direction, as on the types 635 and 739: the oscillation is a switch on them.

A machine that pauses its oscillation while it stands by takes it on and off in modes of their own, which the plugin sends in place of on and off while the machine stands by, as dyson-control asks.

### Tilt

The Big+Quiet tilts in place of oscillating: to 0°, 25° or 50°, or back and forth in its breeze. Its oscillation options are for the tilt:

| Option         | In Matter                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Native rocking | The up and down rocking of the fan control. On breezes, and off tilts the machine back to the angle it was at, or to 0°. Not every app shows it |
| A switch       | A switch named `<name> Oscillation`, in place of the rocking, which breezes the same way                                                        |
| A mode select  | A mode select named `<name> Tilt`, in place of the rocking, with 0°, 25°, 50° and Breeze                                                        |

A tilt turns the machine on when the Dyson app sets it. From Matter it leaves a machine that is off as it is: see [Power](#power).

### Night mode and airflow direction

| Option      | Night mode                                                                        | Airflow direction                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native only | The sleep wind of the fan control alone, as Matter has it. Not every app shows it | The airflow direction of the fan control alone: forward is the front. Not every app shows it                                                        |
| A switch    | A switch named `<name> Night Mode`, and the sleep wind of the fan control as well | A switch named `<name> Front Airflow`, and the airflow direction of the fan control as well. On blows the air out of the front, off out of the back |

The airflow direction is offered on a machine that blows its air to the front or the back.

### Find and follow

A machine that follows people, such as the Purifier Cool of variant N, finds the people in the room and turns to follow them. It runs only while the machine is on, so turning it on turns the machine on.

| Option        | In Matter                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A switch      | A switch named `<name> Find and Follow`. On follows the people the machine finds, and it shows on while it looks for them |
| A mode select | A mode select named `<name> Find and Follow`, with Off, Follow and Scan, which looks for people                           |
| Not shown     | Find and follow stays as the Dyson app sets it                                                                            |

### Heating

On a heater, the heating appears in one of these places. It runs only while the machine is on, so turning it on turns the machine on.

| Option       | In Matter                                                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A thermostat | A thermostat that heats, with a setpoint from 1 to 37 °C in whole degrees, named `<name> Heater` as a device of its own. Off turns the heating off and leaves the fan running |
| A switch     | A switch named `<name> Heat`. It heats to the setpoint set in the Dyson app                                                                                                   |
| Not shown    | The heating stays as the Dyson app sets it                                                                                                                                    |

The thermostat shows it heating while the heater runs, as the machine says. A machine that does not say so shows it heating while the room is below the setpoint. A setpoint changed in Matter leaves the heating as it is. On a heater that shows a temperature in °C or °F, the thermostat has that unit as its display mode, which a Matter app can set.

### Humidifying

Matter has no humidifier, so on a humidifier the humidifying appears in one of these places. It runs only while the machine is on, so turning it on turns the machine on.

| Option        | In Matter                                                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Switches      | A switch named `<name> Humidify`, which humidifies to the target set in the Dyson app, and one named `<name> Auto Humidify` on a machine that picks its own target                                 |
| A mode select | A mode select named `<name> Target Humidity`, with Off, Auto on a machine that has it, and 30 %, 40 %, 50 %, 60 % and 70 %. A target the machine holds between two of them shows as the nearer one |
| Not shown     | The humidifying stays as the Dyson app sets it                                                                                                                                                     |

A humidifier that runs a clean cycle asks for one as often as the hardness of its water says: the harder the water, the sooner. It can get a mode select named `<name> Water Hardness`, with Soft, Medium and Hard. The setup page shows when its next clean cycle is due, and how long one that runs has left.

### Filters

An air purifier shows the life left in its filters, as Matter has it for a purifier. It needs no choice in the setup: an app that does not show filters leaves them out.

| Machine                     | In Matter                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| One of the first generation | The HEPA filter, with the hours left of the 4300 a new filter has, as a percentage                                                                  |
| A later one                 | The HEPA filter, from the outer filter, and the activated carbon filter, from the inner filter, which shows as not fitted when the machine has none |

A filter warns that it is about to need replacing at 10 % or less, and needs replacing at 0 %. Resetting a filter in a Matter app, after fitting a new one, resets its life on the machine. Matter has filters on an air purifier alone, so a machine that appears as a fan shows none, and a machine that reports no filter life, such as the Cool Tower, has no filters in Matter. Which apps show the filters has not been tested with this plugin.

### Mode selects

A mode select is the Matter device type that picks one value from a list, as a drop-down does. **Few Matter apps show a mode select.** Home Assistant shows each one as a select among the settings of the device. Apple Home is reported not to show them, and Google Home, Amazon Alexa and SmartThings do not list them among the devices they support. This has not been tested with this plugin. In the other apps, the switches are the way to reach these controls.

### More controls

A machine that has one of these controls can get a switch or a mode select for it, which Matter has no place for beside the fan:

| Control            | In Matter                                                                                     | On                                             |
| ------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Child lock         | A switch named `<name> Child Lock`. On locks the buttons of the machine                       | The types 635, 739, 918, 965, 997 and 1018     |
| UV light           | A switch named `<name> UV Light`                                                              | The machines dyson-control reads as having one |
| Ioniser            | A switch named `<name> Ioniser`                                                               | The machines dyson-control reads as having one |
| Jet focus          | A switch named `<name> Jet Focus`. On focuses the air into one stream, and off diffuses it    | The type 455                                   |
| Indirect airflow   | A switch named `<name> Indirect Airflow`. On tilts the nozzle to 45°, and off points it at 0° | The type 831                                   |
| Air quality target | A mode select named `<name> Air Quality Target`: the air quality the auto mode aims for       | Machines of the first generation               |
| Wick drying        | A switch named `<name> Wick Drying`, and a mode select for its speed: slow, normal or fast    | The type 965                                   |

See dyson-control's [capabilities](https://github.com/cheziyi/dyson-control#capabilities) for which models have a UV light and an ioniser. The setup page offers each only on a machine that has it.

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

| Preset              | Fan speed  | Auto mode | Oscillation, night mode | Airflow direction | Heating    | Humidifying   | Continuous monitoring | Sensors | Parts of the main device |
| ------------------- | ---------- | --------- | ----------------------- | ----------------- | ---------- | ------------- | --------------------- | ------- | ------------------------ |
| Apple Home          | Percentage | Native    | Switches                | Native            | Thermostat | Switches      | No switch             | All     | No                       |
| Google Home         | Steps      | A switch  | Switches                | Native            | Thermostat | Switches      | No switch             | All     | No                       |
| Full Matter support | Steps      | Native    | Native                  | Native            | Thermostat | A mode select | A switch              | All     | Yes                      |

Find and follow is a switch in the Apple Home and Google Home presets and a mode select in the Full Matter support preset. Every preset adds the switches for the jet focus, the indirect airflow, the UV light and the ioniser, and the Full Matter support preset alone the controls of what is set once rather than used every day: the child lock, the air quality target, the wick drying and the water hardness.

Every preset makes a machine that measures the air an air purifier, and one that does not a fan. Apple Home and Google Home are not known to show the rocking, the sleep wind or the airflow direction of a fan control, which is why their presets add switches for the oscillation and the night mode. The airflow direction, set once rather than used every day, stays on the fan control alone. The Google Home preset adds a switch for the auto mode as well, and the Apple Home preset leaves the auto mode on the fan control alone. The switches of the night mode come beside the sleep wind, which stays for the apps that show it, and the switch of the oscillation takes the place of the rocking, which Apple Home mishandles. This has not been tested with this plugin.

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

- **The firmware is kept up to date.** The plugin reads the machine list of your account when it starts, every 15 minutes and when you open the setup page, and takes the firmware each machine runs now.
- **Each device has the name you give it in the setup page**, which starts as the room name of the Dyson app, followed by a number when another device has that name already, such as `Bedroom 2`. A new room name in the Dyson app does not change it: the options of the device show the new one beside its type and serial number, as soon as you open the setup page again. No two devices share a name, because the name is what Matter shows and what its switches and sensors are named after.
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
- <a id="power"></a>**Only some controls turn a machine on.** The power, a fan speed or the auto mode, the heating, the humidifying and find and follow turn a machine that is off on. Every other control, such as the night mode, the oscillation or a switch of [More controls](#more-controls), sets the machine and leaves it off, though the Dyson app turns the machine on for them.
- **Commands are grouped.** A Matter app often changes several things at once. The plugin collects the changes of 300 milliseconds and sends them to the machine as one command.
- **A device is reported as unreachable** after two reads in a row fail, or when its connection to the cloud closes and does not open again. It is reachable again on the first read that works.
- **The setup page is as open as Matterbridge itself.** Anyone who can reach the Matterbridge frontend can use it, and so control the machines of the signed-in account. It never returns the stored sign-in token.
- **Faults are logged.** The plugin asks a machine for its faults when it first reads it and every 15 minutes after, and takes those it sends as they change. It logs each change, and the setup page shows them.
- **Not in Matter:** the sleep timer, the clean cycle, the drying of a wick and the faults, which the setup page shows instead, and the temperature unit of a machine without a thermostat. A machine on the RabbitMQ broker of the Dyson cloud, and an account that signs in with a mobile number, are not supported by dyson-control.

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
