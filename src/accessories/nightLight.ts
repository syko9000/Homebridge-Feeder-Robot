import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { FeederRobotPlatform } from '../platform';
import Whisker from '../api/Whisker';
import { FeederRobot } from '../feederRobot';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class NightLightAccessory {
  private service: Service;
  private accessory: PlatformAccessory;
  private name: string;
  private uuid: string;
  private state = {
    On: true,
  };

  constructor(
    private readonly platform: FeederRobotPlatform,
    private readonly account: Whisker,
    private readonly FeederRobot: FeederRobot,
  ) {
    this.name = this.FeederRobot.name + ' Night Light';
    this.uuid = this.FeederRobot.uuid.nightLight;
    this.accessory = this.platform.getOrCreateAccessory(this.uuid, this.name);

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Whisker Inc.')
      .setCharacteristic(this.platform.Characteristic.Model, 'Litter Robot 4 Night Light')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.FeederRobot.serialNumber);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Lightbulb) ||
    this.accessory.addService(this.platform.Service.Lightbulb);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.name);

    // register handlers for the On/Off Characteristic
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
        sendLitterRobot4Command(input: {serial: "${this.FeederRobot.serialNumber}", command: "${commandValue}"})
        }`,
    });

    this.platform.log.debug('Toggle Night Light -> ', value, command);

    this.account.sendCommand(command).then((response) => {
      this.platform.log.debug('Toggle Night Light Cmd Response -> ', response.data);
    });
    this.state.On = value as boolean;
    return value;
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   */
  async getStatus(): Promise<CharacteristicValue> {
    this.platform.log.debug(`Getting ${this.name} Status...`);
    return this.state.On;
  }
}
