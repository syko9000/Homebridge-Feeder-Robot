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

  private async discoverDevices(): Promise<void> {
    let feeders: FeederUnit[];
    try {
      feeders = await this.client.getFeeders();
    } catch (err) {
      this.log.error('Failed to discover Feeder-Robots:', (err as Error).message);
      return;
    }

    for (const feeder of feeders) {
      const uuid = this.api.hap.uuid.generate(feeder.serial);
      let accessory = this.accessories.find((existing) => existing.UUID === uuid);

      if (accessory) {
        this.log.info('Restoring feeder from cache:', feeder.name);
      } else {
        this.log.info('Adding new feeder:', feeder.name);
        accessory = new this.api.platformAccessory(feeder.name, uuid);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.push(accessory);
      }

      this.feederAccessories.set(feeder.serial, new FeederRobotAccessory(this, accessory, this.client, feeder));
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
