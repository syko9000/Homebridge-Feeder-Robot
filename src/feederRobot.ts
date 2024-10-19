import { FeederRobotPlatform } from './platform';
import Whisker from './api/Whisker';
import { Logger } from 'homebridge';
import { NightLightAccessory } from './accessories/nightLight';
import { SnackButtonAccessory } from './accessories/snackButton';
import { FeedLevelAccessory } from './accessories/feedLevel';
import { Robot } from './api/Whisker.types';

export class FeederRobot {
  private nightLight: NightLightAccessory;
  private snackButton: SnackButtonAccessory;
  private feedLevel: FeedLevelAccessory;

  public uuid = {
    bot: this.platform.api.hap.uuid.generate(this.device.serial),
    nightLight: this.platform.api.hap.uuid.generate(this.device.serial + 'nightLight'),
    snackButton: this.platform.api.hap.uuid.generate(this.device.serial + 'snackButton'),
    feedLevel: this.platform.api.hap.uuid.generate(this.device.serial + 'feedLevel'),
  };

  public serialNumber = this.device.serial;
  public name = this.device.name;

  constructor(
    private readonly account: Whisker,
    public readonly device: Robot,
    private readonly platform: FeederRobotPlatform,
    private readonly log: Logger,
  ) {
    this.log.info('Litter Robot:', device.name, device.serial);
    this.nightLight = new NightLightAccessory(this.platform, this.account, this);
    this.snackButton = new SnackButtonAccessory(this.platform, this.account, this);
    this.feedLevel = new FeedLevelAccessory(this.platform, this.account, this);
  }

  public update(device: Robot): void {
    this.nightLight?.update(device.state.info.autoNightMode);
    this.snackButton?.update(false);
    this.feedLevel?.update(device.state.info.level);
  }
}