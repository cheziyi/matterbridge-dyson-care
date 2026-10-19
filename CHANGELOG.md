# Matterbridge Dyson Care changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Dev branch

### Added

- [platform]: Expose Dyson purifiers, fans, heaters and humidifiers to Matter through the Dyson cloud with [dyson-control](https://www.npmjs.com/package/dyson-control): power and fan speed, as an air purifier or as a fan.
- [setup]: Add a guided setup in the plugin frontend: sign in to the Dyson account with the code Dyson emails, list its machines with whether the plugin can control each, check each one picked, and choose how it appears in Matter. The password is used once and never stored.
- [devices]: Identify each device by the serial number of its machine, and follow it to a new firmware from the machine list of the account, read at start and every 15 minutes. Devices are added, changed and removed without restarting Matterbridge.
- [setup]: Name each device in the options of the setup page. It starts as the room name of the Dyson app, which machines in one room share, with a number after it when another device has that name, and a new room name in the Dyson app does not change it.
- [setup]: Show a device as connecting, instead of not answering, until its first read through the cloud ends, and read the state again until it settles.
- [setup]: Say after adding or removing a machine that Matterbridge's own list of devices shows the change once its page is reloaded: Matterbridge does not tell its page when a plugin adds or removes a device.
- [devices]: Give a switch, a mode select or a sensor that is a device of its own the serial number of its machine with a dash and a letter after it, such as `NK6-EU-MHA0000A-N`.
- [fan]: Set the speed nearest the percent a Matter app sets, the faster one halfway, and make the fan modes Low, Medium and High set the slowest speed, the one nearest 50 % and the fastest.
- [devices]: Build each device from the controls its machine carries, as dyson-control reads them from its type, variant and firmware, and build it again in Matter when a firmware update changes them.
- [devices]: Write a state the machine sends by itself to Matter as it comes, and report a machine as unreachable after two failed reads or when its connection to the cloud closes for good.
- [fan]: Expose the fan speed as steps or as a percentage, and the auto mode as the Matter fan mode Auto, a switch, or the first or the last step.
- [fan]: Expose the oscillation as the rocking of the fan control, a switch, a mode select of the angles the machine sweeps, or not at all; the night mode as the sleep wind of the fan control, a switch, or not at all; and the airflow direction as that of the fan control, a switch, or not at all.
- [heating]: Expose the heating of a heater as a thermostat that heats, with a setpoint from 1 to 37 °C, or as a switch.
- [humidifying]: Expose the humidifying of a humidifier as switches for the humidifying and its auto mode, or as a mode select of off, auto and the targets from 30 to 70 %.
- [sensors]: Add an air quality sensor with each pollutant the machine measures, and a temperature and a humidity sensor, each from the first time the machine gives its reading. A reading the machine does not give shows no value.
- [sensors]: Add an optional switch for the continuous monitoring of a machine that measures the air while it is off.
- [devices]: Make the thermostat, the switches, the mode selects and the sensors parts of the main device, or devices of their own.
- [setup]: Add the Apple Home, Google Home and Full Matter support presets to the options of a device.
- [account]: Ask for a new sign in when the Dyson cloud stops accepting the account, and leave the devices in Matter, unreachable, while no account is signed in.
- [devices]: Keep a stored device this version cannot read in the configuration, until a device with its name or its serial number is added in the setup page, and log a stored setting that is not valid when its default is used instead.
