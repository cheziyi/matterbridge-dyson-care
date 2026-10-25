## Chip tests

The Matter CHIP conformance tests run against this plugin inside the `luligu/matterbridge:chip-test` container, driven by [scripts/run-chip-tests.mjs](./scripts/run-chip-tests.mjs) and configured by [chipTests.json](./chipTests.json). How the harness works is in [.agents/rules/chip-tests.instructions.md](./.agents/rules/chip-tests.instructions.md).

### What the configured tests cover

The plugin builds the Matter endpoints of a machine from what the Dyson cloud says the machine takes, which needs a Dyson account signed in, and the container has none. `chipTests.json` therefore starts the plugin with no account and no devices, so the bridge exposes its root node and its aggregator alone, and the three generic tests check the composition, the conformance and the default warnings of that node. They cover none of the clusters of a machine: see [Testing a machine](#testing-a-machine).

### Create and start the container (Linux, macOS, and Windows)

Run the `luligu/matterbridge:chip-test` docker image:

- frontend on port 8585
- plugin mapped to .
- container test logs directory mapped on ./temp directory

```shell
node scripts/run-chip-tests.mjs --start
```

### Run all configured tests inside the container

```shell
node scripts/run-chip-tests.mjs
```

### Manually run the tests inside the container

Open a shell in the container

```shell
docker exec -it chip-test bash
```

In the shell:

```bash
# Generic device composition and conformance
python3 src/python_testing/TC_DeviceBasicComposition.py
python3 src/python_testing/TC_DeviceConformance.py
python3 src/python_testing/TC_DefaultWarnings.py --bool-arg pixit_allow_default_vendor_id:true
```

### Stop the container

```shell
node scripts/run-chip-tests.mjs --stop
```

### Testing a machine

The cluster tests need a machine the container can reach: one of a Dyson account, on the network of the Docker host or through the Dyson cloud. The account is stored as the sign-in token Dyson gives the plugin, so sign in inside the container instead of writing the account into `chipTests.json`:

1. Start the container, open the Matterbridge frontend it serves at `http://localhost:8585` and open the setup page of the plugin from its row. Sign in to the Dyson account and add the machine, with the options to test. The plugin stores the account and the device in the configuration of the container, which `--start` writes over: add them again after each `--start`.
2. Read the endpoint numbers with the wildcard read of section 4 of the harness guide rather than counting: Matter numbers the endpoints in the order they are registered and keeps the numbers in the node storage afterwards. The plugin registers the main endpoint of a device first, then its thermostat, its switches, its mode selects and its oscillation fan in the order of `endpoints` in [src/accessory/dysonAccessory.ts](./src/accessory/dysonAccessory.ts), and its sensors last. A composed device has those as child endpoints of the main one.
3. Add the tests to `chipTests.json` with `--endpoint` set accordingly, and a `chip:test:<cluster>` script to `package.json` for each cluster.

What a machine exposes, so which clusters have tests to run, is in the README under [How it is built in Matter](./README.md#how-it-is-built-in-matter): the Fan Control with the Multi Speed, Auto, Rocking, Wind and Airflow Direction features as configured (`FAN`), On/Off on the main endpoint, the oscillation fan and every switch (`OO`), Mode Select on the selects (`MOD`), the Thermostat with the Heating feature on a heater (`TSTAT`) and its user interface configuration (`TSUIC`), HEPA and Activated Carbon Filter Monitoring on an air purifier that reports its filters (`HEPAFREMON`, `ACFREMON`), Air Quality and the concentration measurements of the pollutants on the air quality sensor (`AIRQUAL`, `PMICONC`, `PMKCONC`, `TVOCCONC`, `NDOCONC`, `FLDCONC`, `CDOCONC`), Temperature and Relative Humidity Measurement on the sensors (`TMP`, `RH`) and Bridged Device Basic Information on every device (`BRBINFO`). Find the runnable YAML and Python tests of each with the two list commands of section 5 of the harness guide. The curated `/root/matterbridge.pics` of the image has no Thermostat section, and the generic `ci-pics-values` overclaims the Presets and Thermostat Suggestions features, so the Thermostat tests need a PICS overlay of their own with `TSTAT.S=1` and the Heating feature alone. The plugin template's overlay for a Heating + Cooling + Auto Mode thermostat, which this repository no longer carries, is in its history as `thermostat.pics` and is a starting point.
