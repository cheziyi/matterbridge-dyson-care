# Matterbridge Dyson Care changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

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
