import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import { WhiskerApiClient } from './api/WhiskerApiClient';
import { FeederUnit, foodLevelToPercent } from './api/types';
import { FeederRobotPlatform } from './platform';

const FEED_NOW_RESET_MS = 1000;

/**
 * Manages three separate PlatformAccessories for one physical Feeder-Robot -- food level, a
 * momentary "Feed Now" switch, and a night light toggle -- each its own Home app tile. Gravity
 * mode/panel lock are left for later since they're not needed yet.
 *
 * These used to be one accessory with multiple services, but Home groups same-type services
 * (both switches) into a single tile and won't adopt a plugin's per-service names over a name
 * the user already assigned to a sibling service -- so a new switch would show up mislabeled
 * with whatever name was already given to the other one. Separate accessories avoid that
 * entirely, at the cost of one more tile in Home per feeder.
 *
 * Food level is reported via a HumiditySensor (CurrentRelativeHumidity), not the more
 * semantically-correct FilterMaintenance. A standalone FilterMaintenance service (not attached
 * to an air purifier/fan) doesn't get its own tile in the Home app at all -- Homebridge reports
 * it fine, but Home silently drops it. HumiditySensor is the standard Homebridge-community
 * workaround for showing an arbitrary percentage as its own tile.
 */
export class FeederRobotAccessory {
  private readonly levelService: Service;
  private readonly feedNowService: Service;
  private readonly nightLightService: Service;
  private feeder: FeederUnit;
  private feedNowResetTimeout?: NodeJS.Timeout;

  constructor(
    private readonly platform: FeederRobotPlatform,
    private readonly foodLevelAccessory: PlatformAccessory,
    private readonly feedNowAccessory: PlatformAccessory,
    private readonly nightLightAccessory: PlatformAccessory,
    private readonly client: WhiskerApiClient,
    feeder: FeederUnit,
  ) {
    this.feeder = feeder;
    const { Service: HapService, Characteristic } = this.platform;

    for (const accessory of [foodLevelAccessory, feedNowAccessory, nightLightAccessory]) {
      accessory.getService(HapService.AccessoryInformation)!
        .setCharacteristic(Characteristic.Manufacturer, 'Whisker')
        .setCharacteristic(Characteristic.Model, 'Feeder-Robot')
        .setCharacteristic(Characteristic.SerialNumber, feeder.serial)
        .setCharacteristic(Characteristic.FirmwareRevision, feeder.state.info.fwVersion || 'unknown');
    }

    this.levelService = this.foodLevelAccessory.getService(HapService.HumiditySensor)
      || this.foodLevelAccessory.addService(HapService.HumiditySensor, `${feeder.name} Food Level`);
    this.levelService.setCharacteristic(Characteristic.Name, `${feeder.name} Food Level`);

    this.levelService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .onGet(() => foodLevelToPercent(this.feeder.state.info.level));
    this.levelService.getCharacteristic(Characteristic.StatusFault)
      .onGet(() => this.statusFault());

    this.feedNowService = this.feedNowAccessory.getService(HapService.Switch)
      || this.feedNowAccessory.addService(HapService.Switch, `${feeder.name} Feed Now`);
    this.feedNowService.setCharacteristic(Characteristic.Name, `${feeder.name} Feed Now`);
    this.feedNowService.getCharacteristic(Characteristic.On)
      .onGet(() => false)
      .onSet(this.handleFeedNow.bind(this));

    this.nightLightService = this.nightLightAccessory.getService(HapService.Switch)
      || this.nightLightAccessory.addService(HapService.Switch, `${feeder.name} Night Light`);
    this.nightLightService.setCharacteristic(Characteristic.Name, `${feeder.name} Night Light`);
    this.nightLightService.getCharacteristic(Characteristic.On)
      .onGet(() => Boolean(this.feeder.state.info.autoNightMode))
      .onSet(this.handleNightLightSet.bind(this));

    this.updateFromFeeder(feeder);
  }

  /** Applies freshly-fetched feeder state (from polling, or later a push update) to HomeKit. */
  public updateFromFeeder(feeder: FeederUnit): void {
    this.feeder = feeder;
    const { Characteristic } = this.platform;

    this.levelService.updateCharacteristic(Characteristic.CurrentRelativeHumidity, foodLevelToPercent(feeder.state.info.level));
    this.levelService.updateCharacteristic(Characteristic.StatusFault, this.statusFault());
    this.nightLightService.updateCharacteristic(Characteristic.On, Boolean(feeder.state.info.autoNightMode));
  }

  private statusFault(): number {
    const { Characteristic } = this.platform;
    return this.feeder.state.info.online
      ? Characteristic.StatusFault.NO_FAULT
      : Characteristic.StatusFault.GENERAL_FAULT;
  }

  private async handleFeedNow(value: CharacteristicValue): Promise<void> {
    if (!value) {
      return;
    }

    try {
      await this.client.giveSnack(this.feeder.serial);
    } catch (err) {
      this.platform.log.error(`Failed to feed ${this.feeder.name}:`, (err as Error).message);
    } finally {
      // Momentary switch: flip back off shortly after so it doesn't read as "stuck on" in HomeKit.
      if (this.feedNowResetTimeout) {
        clearTimeout(this.feedNowResetTimeout);
      }
      this.feedNowResetTimeout = setTimeout(() => {
        this.feedNowService.updateCharacteristic(this.platform.Characteristic.On, false);
      }, FEED_NOW_RESET_MS);
    }
  }

  private async handleNightLightSet(value: CharacteristicValue): Promise<void> {
    const enabled = Boolean(value);
    try {
      await this.client.setAutoNightMode(this.feeder.serial, enabled);
      // Reflect the change locally so it's accurate before the next poll refreshes this.feeder.
      this.feeder.state.info.autoNightMode = enabled;
    } catch (err) {
      this.platform.log.error(`Failed to set night light for ${this.feeder.name}:`, (err as Error).message);
      this.nightLightService.updateCharacteristic(
        this.platform.Characteristic.On,
        Boolean(this.feeder.state.info.autoNightMode),
      );
    }
  }
}
