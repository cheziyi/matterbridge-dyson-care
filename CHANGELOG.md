# Matterbridge Dyson Care changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-10-25

### Added

- [devices]: Add a fan as an option for the oscillation, in place of the rocking, for the apps that show neither the rocking nor a mode select. Its first speed stands the machine still and each speed above it is an angle it sweeps, narrowest first, and its fan mode Auto is the breeze of a humidifier whose barrel turns. The fan of the Big+Quiet tilts it to 0°, 25° and 50° and breezes in auto. The on/off of the fan is the power of the machine, and the fan's own on/off does nothing. A machine with no angle to make a speed of gets a switch instead.
- [setup]: Offer the fan as a choice for the oscillation and the tilt in the Options step, with the speeds the machine would get, on a machine that has an angle to make a speed of. The home page describes it as a fan of its own.

### Changed

- [devices]: **Breaking:** devices stored by an earlier version change their identity in Matter at the first start, and the Matter apps take them for new devices: put them back in their rooms once. The name of a device in Matterbridge is made of the serial number of its machine, such as `Dyson NK6-EU-MHA0000A`, and the name given in the setup page is the label of the device, which the Matter apps show. Matterbridge derives the identity of a device from its name, so a new name no longer builds the device again: it is written to the label of each endpoint that is a device of its own, and the apps keep the device with its room and its automations.
- [devices]: A change of how a device appears in Matter, a reading its machine gives for the first time and a firmware that gives the machine other controls no longer build the device again at once. The device keeps its endpoints, and is built again with its new options at the next restart of Matterbridge, which Matterbridge and the setup page ask for. Taking the endpoints of a device away and registering them again while Matterbridge runs made Apple Home take the device for a new one, with its room and its automations lost; across a restart the endpoint numbers are kept.
- [devices]: An endpoint that is brought back after it was taken away, such as a switch turned off and on again in the options, gets a new endpoint id, and with it a new endpoint number instead of the one it had: Apple Home could not change the settings of a device that came back under its old number. The machine and the endpoints that stay keep theirs.
- [devices]: The product name of a machine stays as it was when the machine was added: Matterbridge makes the identity of the device in Matter from it too, so the machine list no longer updates it.

## [0.4.0] - 2026-10-20

### Added

- [setup]: Set a machine to the Dyson cloud only in the Connection of its options, so that each connection skips the search of the network, which takes up to 3 seconds when the machine is not there. The Connect step searches the network for a new machine beside its check through the cloud, and starts one it does not find on the cloud only.

### Changed

- [devices]: Find each machine on the local network by the service it announces over mDNS, with dyson-control 0.8.2, in place of its name `<serialNumber>.local`. The search runs again on each connection, so the plugin follows a machine its router gives a new IP address, and it needs no Avahi on Linux. A machine the search does not find in 3 seconds is reached through the Dyson cloud. A host given in the setup page is still used in place of the search.
- [setup]: The Connection field of the options leaves the host empty to search the network, and a machine online through the cloud alone says that it was not found on the network, or did not answer at the host given.
- [deps]: Update dyson-control to 0.8.2.

## [0.3.0] - 2026-10-20

### Added

- [devices]: Reach each machine on the local network first, at `<serialNumber>.local`, and through the Dyson cloud when it does not answer there, with dyson-control 0.8.1. The password of each machine's broker comes from the machine list of the account and is stored with the device, never shown in the setup page. A device stored by an earlier version gets it at the next read of the machine list, at the start.
- [setup]: Add a host to the options of a machine, for a network where its own name does not resolve, such as a Docker container: an IP address or a host name. A new host connects the machine again without building it again in Matter.
- [setup]: Show whether a machine is online on the network or through the Dyson cloud, and say so when it did not answer on the network. The log says which one each connection goes through when it changes.

### Changed

- [deps]: Update dyson-control to 0.8.1, which also signs in an account the Dyson cloud reports with the authentication method `EMAIL_PWD_2FA`.

## [0.2.0] - 2026-10-20

### Added

- [docs]: Add screenshots of the guided setup, a comparison with the other Dyson plugins, and bring the README up to date with the code.
- [dev]: Add `npm run screenshots`, which takes the screenshots of the README from the setup page in front of simulated machines.

### Changed

- [devices]: Leave whether a machine that is off turns on to dyson-control, which turns it on with nearly every control, as the MyDyson app does. The plugin no longer sends the power off with every control but the power, a fan speed or the auto mode, the heating, the humidifying and find and follow, and a setpoint turns the heating on and the auto humidifying the humidifying, as in the app.
- [setup]: Call the Dyson app the MyDyson app, as Dyson names it, in the setup page and the README.

### Fixed

- [setup]: Show the descriptions of the auto mode choices in the Options step in the same weight as every other choice, not bold.

## [0.1.0] - 2026-10-20

### Added

- [platform]: Expose Dyson purifiers, fans, heaters and humidifiers to Matter through the Dyson cloud with [dyson-control](https://www.npmjs.com/package/dyson-control): power and fan speed, as an air purifier or as a fan.
- [setup]: Add a guided setup in the plugin frontend: sign in to the Dyson account with the code Dyson emails, list its machines with whether the plugin can control each, check each one picked, and choose how it appears in Matter. The password is used once and never stored.
- [devices]: Identify each device by the serial number of its machine, and follow it to a new firmware from the machine list of the account, read at start, every 15 minutes and when the setup page opens. Devices are added, changed and removed without restarting Matterbridge.
- [setup]: Name each device in the options of the setup page. It starts as the room name of the Dyson app, which machines in one room share, with a number after it when another device has that name, and a new room name in the Dyson app does not change it.
- [setup]: Show the room name of the Dyson app beside the type and the serial number of a machine in its options, to tell it apart. It is stored with the device and follows the machine list of the account.
- [setup]: Show a device as connecting, instead of not answering, until its first read through the cloud ends, and read the state again until it settles.
- [setup]: Say after adding or removing a machine that Matterbridge's own list of devices shows the change once its page is reloaded: Matterbridge does not tell its page when a plugin adds or removes a device.
- [devices]: Give a switch, a mode select or a sensor that is a device of its own the serial number of its machine with a dash and a letter after it, such as `NK6-EU-MHA0000A-N`.
- [fan]: Set the speed nearest the percent a Matter app sets, the faster one halfway. The fan modes Low, Medium and High follow from the middle percent Matterbridge gives each.
- [devices]: Build each device from the controls its machine carries, as dyson-control reads them from its type, variant and firmware, and build it again in Matter when a firmware update changes them.
- [devices]: Write a state the machine sends by itself to Matter as it comes, and report a machine as unreachable after two failed reads or when its connection to the cloud closes for good.
- [devices]: Keep taking the commands of a Matter app after the bridge is removed from the last app it was in and paired again, which resets the bridge to factory defaults. Read the machine and write to Matter only while the Matter node is online, after such a reset and at the start of the bridge: a write that held the thermostat of a heater as the node went online would fail the reset and leave Matterbridge stuck. A state or readings the machine sends meanwhile are kept, and written by the read once the node is online.
- [fan]: Expose the fan speed as steps or as a percentage, and the auto mode as the Matter fan mode Auto, a switch, or the first or the last step.
- [fan]: Expose the night mode and the airflow direction in their places on the fan control, the sleep wind and the airflow direction, alone or with a switch beside them for the apps that do not show them, and the oscillation as the rocking of the fan control, or as a switch or a mode select of the angles the machine sweeps in place of the rocking, which Apple Home mishandles. An app that does not show a place leaves it out, so none of them is hidden.
- [fan]: Expose the tilt of a machine that tilts, such as the Big+Quiet, through its oscillation options: its breeze as the up and down rocking of the fan control or a switch, and a mode select of 0°, 25°, 50° and breeze. A tilt from Matter leaves a machine that is off as it is.
- [fan]: Turn the oscillation of a machine that stands by with it paused on and off with its idle modes, as dyson-control 0.6.0 asks.
- [fan]: Expose the find and follow of a machine that follows people, such as the Purifier Cool of variant N, as a switch, a mode select of off, follow and scan, or not at all.
- [devices]: Leave a machine that is off off for every control but the power, a fan speed or the auto mode, the heating, the humidifying and find and follow, where dyson-control 0.7.0 turns it on as the Dyson app does. A setpoint keeps the heat mode the machine has, and the auto humidifying the humidifying mode.
- [devices]: Add optional switches for the child lock, the UV light, the ioniser, the jet focus, the indirect airflow and the wick drying, and mode selects for the air quality target and the wick drying speed, on the machines that have them.
- [heating]: Show whether the heater of a machine that says so runs on its thermostat, and the unit it shows a temperature in as the display mode of the thermostat, which a Matter app can set.
- [filters]: Show the life left in the HEPA and the activated carbon filter of every air purifier whose machine reports it, with no choice to make in the setup, with a warning at 10 % or less, and reset it on the machine when a Matter app resets it.
- [heating]: Expose the heating of a heater as a thermostat that heats, with a setpoint from 1 to 37 °C, or as a switch.
- [humidifying]: Expose the humidifying of a humidifier as switches for the humidifying and its auto mode, or as a mode select of off, auto and the targets from 30 to 70 %.
- [humidifying]: Add an optional mode select for the water hardness of a humidifier that runs a clean cycle.
- [setup]: Show under each machine the life left in its filters, when its next clean cycle is due, how long the drying of its wick has left, and the faults it reports. The plugin asks for the faults at the first read and every 15 minutes, takes those the machine sends, and logs each change.
- [sensors]: Add an air quality sensor with each pollutant the machine measures, and a temperature and a humidity sensor, each from the first time the machine gives its reading. A reading the machine does not give shows no value.
- [sensors]: Add an optional switch for the continuous monitoring of a machine that measures the air while it is off.
- [devices]: Make the thermostat, the switches, the mode selects and the sensors parts of the main device, or devices of their own.
- [setup]: Add the Apple Home, Google Home and Full Matter support presets to the options of a device.
- [account]: Ask for a new sign in when the Dyson cloud stops accepting the account, and leave the devices in Matter, unreachable, while no account is signed in.
- [devices]: Keep a stored device this version cannot read in the configuration, until a device with its name or its serial number is added in the setup page, and log a stored setting that is not valid when its default is used instead.
