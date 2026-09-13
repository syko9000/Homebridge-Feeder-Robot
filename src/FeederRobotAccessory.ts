import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import { WhiskerApiClient } from './api/WhiskerApiClient';
import { FeederUnit, foodLevelToPercent } from './api/types';
import { FeederRobotPlatform } from './platform';

const FEED_NOW_RESET_MS = 1000;

/**
 * One PlatformAccessory per physical Feeder-Robot, exposing food level and a momentary
 * "Feed Now" switch. v1 scope only -- gravity mode/night light/panel lock are left for later
 * since they're not needed yet.
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
  private feeder: FeederUnit;
  private feedNowResetTimeout?: NodeJS.Timeout;

  constructor(
    private readonly platform: FeederRobotPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly client: WhiskerApiClient,
    feeder: FeederUnit,
  ) {
    this.feeder = feeder;
    const { Service: HapService, Characteristic } = this.platform;

    this.accessory.getService(HapService.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Whisker')
      .setCharacteristic(Characteristic.Model, 'Feeder-Robot')
      .setCharacteristic(Characteristic.SerialNumber, feeder.serial)
      .setCharacteristic(Characteristic.FirmwareRevision, feeder.state.info.fwVersion || 'unknown');

    // Clean up the FilterMaintenance service from earlier versions of this plugin, if present,
    // so accessories that were already paired don't end up with both services.
    const staleFilterService = this.accessory.getService(HapService.FilterMaintenance);
    if (staleFilterService) {
      this.accessory.removeService(staleFilterService);
    }

    this.levelService = this.accessory.getService(HapService.HumiditySensor)
      || this.accessory.addService(HapService.HumiditySensor, `${feeder.name} Food Level`);
    this.levelService.setCharacteristic(Characteristic.Name, `${feeder.name} Food Level`);

    this.levelService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .onGet(() => foodLevelToPercent(this.feeder.state.info.level));
    this.levelService.getCharacteristic(Characteristic.StatusFault)
      .onGet(() => this.statusFault());

    this.feedNowService = this.accessory.getService(HapService.Switch)
      || this.accessory.addService(HapService.Switch, `${feeder.name} Feed Now`);
    this.feedNowService.setCharacteristic(Characteristic.Name, `${feeder.name} Feed Now`);
    this.feedNowService.getCharacteristic(Characteristic.On)
      .onGet(() => false)
      .onSet(this.handleFeedNow.bind(this));

    this.updateFromFeeder(feeder);
  }

  /** Applies freshly-fetched feeder state (from polling, or later a push update) to HomeKit. */
  public updateFromFeeder(feeder: FeederUnit): void {
    this.feeder = feeder;
    const { Characteristic } = this.platform;

    this.levelService.updateCharacteristic(Characteristic.CurrentRelativeHumidity, foodLevelToPercent(feeder.state.info.level));
    this.levelService.updateCharacteristic(Characteristic.StatusFault, this.statusFault());
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
}
