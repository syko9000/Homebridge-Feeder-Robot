import { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { CognitoAuth } from './auth/CognitoAuth';
import { WhiskerApiClient } from './api/WhiskerApiClient';
import { FeederUnit } from './api/types';
import { FeederRobotAccessory } from './FeederRobotAccessory';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

const DEFAULT_POLLING_INTERVAL_SECONDS = 60;

/**
 * Discovers Feeder-Robots on the configured Whisker account and keeps their HomeKit
 * accessories in sync by polling. (A push-update transport can replace the polling loop later
 * without changing how accessories consume state -- see FeederRobotAccessory.updateFromFeeder.)
 */
export class FeederRobotPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory[] = [];
  private readonly feederAccessories = new Map<string, FeederRobotAccessory>();
  private readonly client: WhiskerApiClient;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    const auth = new CognitoAuth(this.config.email as string, this.config.password as string, this.log);
    this.client = new WhiskerApiClient(auth, this.log);

    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      this.discoverDevices();

      const intervalSeconds = Number(this.config.pollingIntervalSeconds) || DEFAULT_POLLING_INTERVAL_SECONDS;
      setInterval(() => this.pollForUpdates(), intervalSeconds * 1000);
    });
  }

  /**
   * Invoked when Homebridge restores cached accessories from disk at startup.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  private getOrCreateAccessory(uuid: string, name: string): PlatformAccessory {
    const existing = this.accessories.find((accessory) => accessory.UUID === uuid);
    if (existing) {
      this.log.info('Restoring accessory from cache:', existing.displayName);
      return existing;
    }

    this.log.info('Adding new accessory:', name);
    const accessory = new this.api.platformAccessory(name, uuid);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    this.accessories.push(accessory);
    return accessory;
  }

  /**
   * v1 registered one combined accessory per feeder (food level + both switches as services on
   * it). That made Feed Now and Night Light show up as two same-named controls grouped under one
   * Home app tile, since Home doesn't adopt a plugin's service names over a name the user already
   * assigned to a sibling service. Splitting each control into its own accessory avoids that.
   * This removes the old combined accessory (if present) so it doesn't linger as an orphan.
   */
  private removeLegacyCombinedAccessory(feeder: FeederUnit): void {
    const legacyUuid = this.api.hap.uuid.generate(feeder.serial);
    const index = this.accessories.findIndex((accessory) => accessory.UUID === legacyUuid);
    if (index === -1) {
      return;
    }

    this.log.info('Removing old combined accessory for', feeder.name, '-- replaced by separate accessories');
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessories[index]]);
    this.accessories.splice(index, 1);
  }

  private async discoverDevices(): Promise<void> {
    let feeders: FeederUnit[];
    try {
      feeders = await this.client.getFeeders();
    } catch (err) {
      this.log.error('Failed to discover Feeder-Robots:', (err as Error).message);
      return;
    }

    for (const feeder of feeders) {
      this.removeLegacyCombinedAccessory(feeder);

      const foodLevelAccessory = this.getOrCreateAccessory(
        this.api.hap.uuid.generate(`${feeder.serial}:food-level`),
        `${feeder.name} Food Level`,
      );
      const feedNowAccessory = this.getOrCreateAccessory(
        this.api.hap.uuid.generate(`${feeder.serial}:feed-now`),
        `${feeder.name} Feed Now`,
      );
      const nightLightAccessory = this.getOrCreateAccessory(
        this.api.hap.uuid.generate(`${feeder.serial}:night-light`),
        `${feeder.name} Night Light`,
      );

      this.feederAccessories.set(
        feeder.serial,
        new FeederRobotAccessory(this, foodLevelAccessory, feedNowAccessory, nightLightAccessory, this.client, feeder),
      );
    }
  }

  private async pollForUpdates(): Promise<void> {
    let feeders: FeederUnit[];
    try {
      feeders = await this.client.getFeeders();
    } catch (err) {
      this.log.warn('Failed to poll Feeder-Robot state:', (err as Error).message);
      return;
    }

    for (const feeder of feeders) {
      this.feederAccessories.get(feeder.serial)?.updateFromFeeder(feeder);
    }
  }
}
