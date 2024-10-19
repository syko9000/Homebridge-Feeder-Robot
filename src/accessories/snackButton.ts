import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { FeederRobot } from '../feederRobot';

import { FeederRobotPlatform } from '../platform';
import Whisker from '../api/Whisker';

export class SnackButtonAccessory {
  private service: Service;
  private accessory: PlatformAccessory;
  private name: string;
  private uuid: string;
  private characteristic = this.platform.Characteristic.On;

  private state = {
    On: false,
  };

  constructor(
    private readonly platform: FeederRobotPlatform,
    private readonly account: Whisker,
    private readonly LitterRobot: FeederRobot,
  ) {
    this.name = this.LitterRobot.name + ' Cat Sensor';
    this.uuid = this.LitterRobot.uuid.snackButton;
    this.accessory = this.platform.getOrCreateAccessory(this.uuid, this.name);

    this.service = this.accessory.getService(this.platform.Service.OccupancySensor) ||
    this.accessory.addService(this.platform.Service.OccupancySensor);

    // create handlers for required characteristics
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.toggle.bind(this))     // SET - bind to the `setOn` method below
      .onGet(this.getStatus.bind(this)); // GET - bind to the `getOn` method below
  }

  // update the state of the LightBulb on the platform
  update(isOn: boolean) {
    if (this.state.On !== isOn) {
      this.platform.log.debug(`Updating ${this.name} -> `, isOn);
      this.state.On = isOn;
      this.service.updateCharacteristic(this.platform.Characteristic.On, isOn);
    }
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async toggle(value: CharacteristicValue) {
    const commandValue = value ? 'nightLightModeOn' : 'nightLightModeOff';
    const command = JSON.stringify({
      query: `mutation { 
        sendLitterRobot4Command(input: {serial: "${this.LitterRobot.serialNumber}", command: "${commandValue}"})
        }`,
    });

    this.platform.log.debug('Toggle Night Light -> ', value, command);

    this.account.sendCommand(command).then((response) => {
      this.platform.log.debug('Toggle Night Light Cmd Resonse -> ', response.data);
    });
    this.state.On = value as boolean;
    return value;
  }

  /**
   * Handle requests to get the current value of the "Occupancy Detected" characteristic
   */
  getStatus() {
    this.platform.log.debug(`Getting ${this.name} Status...`);
    return this.state.On;
  }
}