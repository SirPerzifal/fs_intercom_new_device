const { exec, execSync } = require('child_process');

const feathersFramework = require('feathers');
const socketio = require('feathers-socketio/client');
const io = require('socket.io-client');
const { logger } = require('./logger');

const { NetworkConnectManager } = require('./networkManager');
const { NetworkConnectServer } = require('./networkConfigServer');
const { DhcpServer } = require('./dnsmasq');
const config = require('./config');
const cell = require('./quectelLib/quectelHat');

const StateEnum = Object.freeze({
  PROVISIONING: 0,
  BOUND: 1,
});

class Main {
  constructor(hsIface) {
    // If HOTSPOT_INTERFACE is set it overrides everything
    // if it is not set then the gateway should always pick the usb dongle
    this.hsInterface = process.env.HOTSPOT_INTERFACE || hsIface;
    this.hsChannel = parseInt(process.env.HOTSPOT_CHANNEL, 10) || 1;

    this.disableConfigServer = process.env.DISABLE_NETWORK_CONFIG || 'false';

    this.networkAddress = parseInt(process.env.NETWORK_ADDRESS, 10) || 42;

    // nm ignores the interface we are on now so we can't screw it up. genius
    this.nm = new NetworkConnectManager(this.hsInterface);
    this.ncServer = new NetworkConnectServer(this.nm);
    this.dhcp = null;

    this.lastState = null;
    this.socket = null;
    this.app = null;
    this.commandSocket = null;
    this.uplinkInterface = null;
    this.shadowInterface = null;
  }

  async Init() {
    await config.Init();
    if (process.env.CELLULAR === 'true') {
      try {
        logger.info('This device is fitted with a cellular modem, starting the Quectel library...');
        await this.InitCellularSetup()
        await this.CheckModem();
        logger.info('Cellular setup finished, continuing rest of setup process...');
      }
      catch (error) {
        logger.error('An unexpected error occurred while initializing the Main module.', error);
        // if cell cant be initialized and there is no other connection type we should probably reboot after some time
      }

    }
    this.NotSoSimpleSetup();
  }

  WaitFor(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async setupGlinetNetworking() {
    // this is fine cause these should be deleted even if they exist
    await this.CheckForExistingConnectionAndDelete(config.GetBondedHotspotObject().name);
    await this.CheckForExistingConnectionAndDelete(config.GetProvisioningHotspotObject().name);

    // if the provisioner is a standalone script we need the network config server
    // if we move the api in here we can keep it off.
    // network config server is still sort of needed to set up client networks though, at least during setup
    if (this.disableConfigServer !== 'true') {
      // start the network connect server
      this.StartNetworkConfigServer();
    } else {
      logger.warn('Network Config Server disabled');
    }



    let iface;
    iface = execSync("/usr/local/bin/getethernetinterface.sh hotspot",
      {
        encoding: 'utf8'
      }).trim();
    if (!iface) {
      logger.error('Could not pick interface. Is ethernet adapter connected?');
      return;
    }

    if (iface === this.uplinkInterface) {
      logger.error("GWAP should not override uplink connection. Get help ;) ");
      return;
    }

    this.shadowInterface = iface;



    const ip = `192.168.${this.networkAddress}.1`;
    const ipRange = `192.168.${this.networkAddress}.2,192.168.${this.networkAddress}.254`;

    // start dhcp server and leave running
    this.dhcp = new DhcpServer(iface, ip, ipRange);

    // this is now a manual network
    const data = config.GetGlinetObject();
    await this.AddWiredConnection(data);
    logger.info('Wired connection created');
    this.dhcp.Start();
    this.lastState = StateEnum.BOUND;

    const uplinkInterface = this.uplinkInterface || 'eth0';

    exec(`/usr/local/bin/updateiptables.sh ${iface} ${uplinkInterface}`, () => {
      logger.info('Updated iptables...');
    });

    // check if ap exists in db
    // check if ap responds
    // if ap doesn't respond set it up
    // if ap ready then setup networking

    // 3? scenarios:
    //  fresh install
    //  existing install but normal
    //  existing install but ap disappeared
    //    new ip address
    //    gone gone

    const programmingAppEnabled = process.env.PROGRAMMING_APP === 'true'
    if (programmingAppEnabled) {
      logger.warn('PROGRAMMING_APP enabled. Starting off in Provisioning')
      this.NewSetGatewayState(StateEnum.PROVISIONING);
    } else {
      this.NewSetGatewayState(StateEnum.BOUND);
    }
  }


  async setupLocalNetworking() {
    if (this.disableConfigServer !== 'true') {
      // start the network connect server
      this.StartNetworkConfigServer();
    } else {
      logger.warn('Network Config Server disabled');
    }

    // don't want this guy
    await this.CheckForExistingConnectionAndDelete("gwap");

    const ip = `192.168.${this.networkAddress}.1`;
    const ipRange = `192.168.${this.networkAddress}.2,192.168.${this.networkAddress}.254`;

    // start dhcp server and leave running
    this.dhcp = new DhcpServer(this.hsInterface, ip, ipRange);

    const programmingAppEnabled = process.env.PROGRAMMING_APP === 'true'
    if (programmingAppEnabled) {
      logger.warn('PROGRAMMING_APP enabled. Starting off in Provisioning')
      await this.CheckForExistingConnectionAndDelete(config.GetBondedHotspotObject().name);
      this.NewSetGatewayState(StateEnum.PROVISIONING);

    } else {
      await this.CheckForExistingConnectionAndDelete(config.GetProvisioningHotspotObject().name);
      this.NewSetGatewayState(StateEnum.BOUND);
    }

    const uplinkInterface = this.uplinkInterface || 'eth0';

    exec(`/usr/local/bin/updateiptables.sh ${this.hsInterface} ${uplinkInterface}`, () => {
      logger.info('Updated iptables...');
    });
  }

  async CheckUplink() {
    // Look for wired uplink and save interface name
    const allCons = await this.GetAllConnections();
    console.log(JSON.stringify(allCons, null, 2));

    const uplinkName = process.env.UPLINK_NAME;
    const possibleNames = ['Wired connection 1', 'static', 'STATIC', 'mauro-casa', uplinkName];

    allCons.forEach((con) => {
      if (possibleNames.includes(con.settings.connection.id)) {
        this.uplinkInterface = con.settings.connection['interface-name'];
        logger.info(`Uplink interface: ${this.uplinkInterface}`);
      }
    });
    const activeCons = await this.GetAllActiveConnections();
    console.log(JSON.stringify(activeCons, null, 2));
  }



  async NotSoSimpleSetup() {

    await this.CheckUplink();

    if (process.env.GLINET == 'true') {
      logger.info("Glinet setup");
      this.setupGlinetNetworking();
    } else if (process.env.EXTERNAL_ACCESSPOINT == 'true') {
      logger.info("Unifi setup")
      // TODO: set up unifi networking
      // this.setupUnifiNetworking();
    } else {
      logger.info("Regular ol' dongle setup");
      this.setupLocalNetworking();
    }
    // set up socket listener for gateway state
    this.socket = io(config.FeathersUri());
    this.app = feathersFramework().configure(socketio(this.socket));
    this.commandSocket = this.app.service('api/v1/gatewayStates');
    this.commandSocket.on('patched', ent => {
      this.NewSetGatewayState(parseInt(ent.gatewayState[0].currentState, 10));
    });



  }

  CheckModem() {
    return new Promise((resolve, reject) => {
      logger.debug('Checking modem')
      this.nm.ListAvailableModems()
        .then((modems) => {
          console.log(modems);
          if (!Object.keys(modems).length) {
            logger.debug('Modem not found. Initializing');
            return cell.Initialize();
          }
          logger.debug('Modem found');
          resolve();
        })
        .catch(error => {
          logger.debug('Error listing modems');
          console.log(error);
        });
    });
  }

  InitCellularSetup() {
    return new Promise((resolve, reject) => {
      logger.debug('Checking if verizon connection exists')
      this.CheckForExistingConnection('verizon')
        .then(connectionExists => {
          if (connectionExists) {
            logger.debug('Connection verizon already exists. Nothing to do here')
            return resolve()
          }
          logger.debug('Creating new verizon gsm connection...');
          return this.nm.CreateCellularConnection();
        })
        .then(() => {
          resolve();
        })
        .catch(error => {
          logger.error('An unexpected error occurred while creating the cellular connection.', error);
          reject();
        });
    });
  }

  CheckForExistingConnection(conName) {
    return new Promise((resolve, reject) => {
      this.nm.GetConnectionPath(conName)
        .then(connections => {
          if (connections.length <= 0 || !connections[0].path) {
            logger.debug(`${conName} hotspot connection not found.`);
            // connection not found
            return resolve(false);
          }
          return resolve(true);
        })
        .catch(connectionsError => {
          logger.error('Error getting existing connections.', connectionsError);
          reject(connectionsError);
        });
    });
  }

  GetAllConnections() {
    return new Promise((resolve, reject) => {
      this.nm.GetAllConnections()
        .then(connections => {
          return resolve(connections);
        })
        .catch(connectionsError => {
          logger.error('Error getting existing connections.', connectionsError);
          reject(connectionsError);
        });
    });
  }

  GetAllActiveConnections() {
    return new Promise((resolve, reject) => {
      this.nm.GetAllActiveConnections()
        .then(connections => {
          return resolve(connections);
        })
        .catch(connectionsError => {
          logger.error('Error getting existing connections.', connectionsError);
          reject(connectionsError);
        });
    });
  }

  CheckForExistingConnectionAndDelete(conName) {
    return new Promise((resolve, reject) => {
      // check to see if this connection name already exists, if it does -- delete it
      logger.debug(`Trying to delete ${conName}.`);

      this.nm.GetConnectionPath(conName)
        .then(connections => {
          if (connections.length <= 0 || !connections[0].path) {
            logger.debug(`${conName} hotspot connection not found.`);
            return resolve();
          }

          return this.nm.DeleteConnection(connections[0].path);
        })
        .then(() => {
          resolve();
        })
        .catch(connectionsError => {
          logger.error('Error getting existing connections.', connectionsError);
          reject(connectionsError);
        });
    });
  }

  async CheckForExistingConnectionAndDeleteIfNeeded(newCon) {
    try {
      logger.debug(`Checking ${newCon.name} to see if it needs to be updated`);
      const connections = await this.nm.GetConnectionPath(newCon.name);
      if (connections.length <= 0 || !connections[0].path) {
        logger.debug(`${newCon.name} hotspot connection not found.`);
        return true;
      }

      const method = connections[0].settings.ipv4.method.toString();
      const currentInterface = connections[0].settings.connection['interface-name'];
      const currentSSID = Buffer.from(connections[0].settings['802-11-wireless'].ssid).toString();
      const currentChannel = connections[0].settings['802-11-wireless'].channel;
      logger.info(`Current channel: ${connections[0].settings['802-11-wireless'].channel}, Target channel: ${this.hsChannel}`)
      if (currentInterface == this.hsInterface && currentSSID == newCon.ssid && method == "manual" && currentChannel == this.hsChannel) {
        logger.info("Current and target connections are the same. No need to delete or create")
        return false;
      }

      logger.debug(`${currentInterface} ${this.hsInterface}`);
      logger.debug(`${currentSSID} ${newCon.ssid}`);
      await this.nm.DeleteConnection(connections[0].path);
      return true;
    }
    catch (error) {
      logger.error(error);
      return true;
    }
  }

  async NewAddHotspotConnection(hc) {
    logger.debug('Adding a new hotspot connection');
    const createConnection = await this.CheckForExistingConnectionAndDeleteIfNeeded(hc);
    if (!createConnection) {
      return;
    }
    await this.WaitFor(1000);
    logger.info(`Creating the new hotspot object on ${this.hsInterface}`);
    const conPath = await this.nm.CreateHotspotConnection({
      ssid: hc.ssid,
      passkey: hc.passkey,
      hidden: 0,
      name: hc.name,
      ifaceName: this.hsInterface,
      channel: this.hsChannel,
      ip: hc.gatewayIp,
      subnet: hc.subnet,
      gateway: hc.gatewayIp,
    });
    await this.WaitFor(1000);
    const devPath = (await this.nm.GetInterfacePath(this.hsInterface))[0].path
    await this.WaitFor(1000);
    await this.nm.ActivateConnection(conPath, devPath);
    logger.info(`${hc.name} hotspot connection successfully added!`);
  }


  async AddGlinetHotspotConnection(hc) {
    logger.debug('Adding a new wired connection for the shadow');
    const createConnection = await this.CheckForExistingConnectionAndDeleteIfNeeded(hc);
    if (!createConnection) {
      return;
    }
    await this.WaitFor(1000);
    logger.info('Creating the new shadow connection');
    const conPath = await this.nm.CreateSharedHotspotConnection({
      ssid: hc.ssid,
      passkey: hc.passkey,
      hidden: 0,
      name: hc.name,
      ifaceName: this.hsInterface,
      channel: this.hsChannel,
      ip: hc.gatewayIp,
      subnet: hc.subnet,
      gateway: hc.gatewayIp,
    });
    await this.WaitFor(1000);
    const devPath = (await this.nm.GetInterfacePath(this.hsInterface))[0].path
    await this.WaitFor(1000);
    await this.nm.ActivateConnection(conPath, devPath);
    logger.info(`${hc.name} shadow connection successfully added!`);
  }

  // TODO: pick or set other interfaces
  async AddWiredConnection(hc) {
    logger.info('Adding new wired connection...');
    await this.CheckForExistingConnectionAndDelete(hc.name)
    await this.WaitFor(1000);
    logger.info(`Creating new wired connection using interface ${this.shadowInterface}...`);
    const conPath = await this.nm.CreateNewWiredConnection({
      interfaceName: this.shadowInterface,
      name: hc.name,
      connectivityType: "3",
      ip: hc.gatewayIp,
      subnet: hc.subnet,
      gateway: hc.gatewayIp,
    })
    await this.WaitFor(1000);
    const devPath = (await this.nm.GetInterfacePath(this.shadowInterface))[0].path
    await this.WaitFor(1000);
    await this.nm.ActivateConnection(conPath, devPath);
    logger.info(`${hc.name} Wired connection successfully added!`);
  }


  async AddHotspotConnection(hc) {
    try {
      logger.debug('Adding a new hotspot connection');
      const createConnection = await this.CheckForExistingConnectionAndDeleteIfNeeded(hc);
      if (!createConnection) {
        return;
      }
      await this.WaitFor(1000);
      logger.info(`Creating the new hotspot object on ${this.hsInterface}`);
      const conPath = await this.nm.CreateHotspotConnection({
        ssid: hc.ssid,
        passkey: hc.passkey,
        hidden: 0,
        name: hc.name,
        ifaceName: this.hsInterface,
        channel: this.hsChannel,
        ip: hc.gatewayIp,
        subnet: hc.subnet,
        gateway: hc.gatewayIp,
      });
      await this.WaitFor(1000);
      const devPath = (await this.nm.GetInterfacePath(this.hsInterface))[0].path
      await this.WaitFor(1000);
      await this.nm.ActivateConnection(conPath, devPath);
      logger.info(`${hc.name} hotspot connection successfully added!`);
    }
    catch (error) {
      logger.error('An unexpected error occurred while adding the hotspot connection.', error);
    }

  }

  StartNetworkConfigServer() {
    return new Promise((resolve, reject) => {
      logger.debug('Starting network config server...');
      this.ncServer.Start()
        .then(() => {
          logger.debug('Network config server has been started.');
          resolve();
        });
    });
  }

  // is this used at all???
  RemoveHotspotConnection(hc) {
    return new Promise((resolve, reject) => {
      logger.debug('Removing hotspot connection...');
      this.nm.GetConnectionPath(hc.name)
        .then(connectionInfo => {
          return this.nm.DeleteConnection(connectionInfo[0].path);
        })
        .then(nmMessage => {
          logger.info(`${hc.name} hotspot connection successfully removed.`);
          resolve(true);
        })
        .catch(error => {
          logger.error('An unexpected error occurred while removing the hotspot connection.', error);
          reject(error);
        });
    });
  }


  async StartSmarterBonded() {
    if (process.env.GLINET == 'true') {
      this.lastState = StateEnum.BOUND;
      // TODO: call glinet api to change network settings
      return;
    }
    logger.debug('Starting bonded hotspot...');
    const data = await config.GetBondedHotspotObject();
    await this.NewAddHotspotConnection(data)
    logger.debug('Bonded hotspot started.');
    this.dhcp.Start();
    this.lastState = StateEnum.BOUND;
  }

  async StartSmarterProvisioning() {
    if (process.env.GLINET == 'true') {
      logger.info('Starting glinet provisioning...');
      const data = await config.GetGlinetProvisioningObject();
      await this.AddGlinetHotspotConnection(data)
      logger.debug('Provisioning hotspot started.');
      this.lastState = StateEnum.PROVISIONING;
      return;
    }
    logger.debug('Starting Provisioning hotspot...');
    const data = await config.GetProvisioningHotspotObject();
    await this.NewAddHotspotConnection(data)
    logger.debug('Provisioning hotspot started.');
    this.dhcp.Start();
    this.lastState = StateEnum.PROVISIONING;
  }

  StopBonded() {
    return new Promise((resolve, reject) => {
      logger.debug('Stopping bonded hotspot...');
      const data = config.GetBondedHotspotObject();
      // make sure Bonded hotspot is not running
      this.CheckForExistingConnectionAndDelete(data.name)
        .then(() => {
          logger.debug('Bonded hotspot stopped.');
          resolve();
        });
    });
  }

  StopProvisioning() {
    return new Promise((resolve, reject) => {
      const data = config.GetProvisioningHotspotObject();
      logger.debug(`Stopping Provisioning hotspot ${data.name}...`);
      // make sure Bonded hotspot is not running
      this.CheckForExistingConnectionAndDelete(data.name)
        .then(() => {
          logger.debug('Provisioning hotspot stopped.');
          resolve();
        });
    });
  }

  async NewKillLastState(newState) {
    if (this.lastState == null) {
      logger.debug('Gateway state is starting up.');
      return true;
    }

    if (newState == this.lastState) {
      logger.debug(`From: ${this.lastState} To: ${newState} - State has not changed.`);
      return false;
    }

    if (this.lastState === StateEnum.BOUND) {
      // If we are using an extrernal accesspoint we never want to stop the dhcp server :)
      if (process.env.EXTERNAL_ACCESSPOINT === 'true') {
        logger.debug(`EXTERNAL_ACCESSPOINT is true - Nothing to do`);
        return true;
      }

      if (process.env.GLINET === 'true') {
        logger.debug(`GLINET is true - Nothing to do`);
        return true;
      }

      try {
        await this.StopBonded();
        this.dhcp.Stop();
        return true;
      } catch (error) {
        logger.debug("Could not kill previous connection");
        logger.error(error);
        return false;
      }
    }

    if (this.lastState === StateEnum.PROVISIONING) {
      // If we are using an extrernal accesspoint we never want to stop the dhcp server :)
      if (process.env.EXTERNAL_ACCESSPOINT === 'true') {
        logger.debug(`EXTERNAL_ACCESSPOINT is true`);
        await this.StopProvisioning();
        return true;
      }

      if (process.env.GLINET === 'true') {
        logger.debug(`GLINET is true`);
        await this.StopProvisioning();
        return true;
      }

      try {
        await this.StopProvisioning();
        this.dhcp.Stop();
        return true;
      } catch (error) {
        logger.debug("Could not kill previous connection");
        logger.error(error);
        return false;
      }
    }
  }



  async NewSetGatewayState(newState) {
    try {
      logger.debug('Setting new gateway state');
      const failoverObject = await config.GetFailoverState();
      if (failoverObject.enabled && !failoverObject.isMaster) {
        logger.debug('Failover is enabled and not set to Master.');
        // delete all connections
        return;
      }
      // this returns either true or false
      const we_good = await this.NewKillLastState(newState);
      if (!we_good) {
        logger.warn('Could not kill last state');
        return;
      }
      if (newState === StateEnum.PROVISIONING) {
        this.StartSmarterProvisioning();
        return;
      }
      if (newState === StateEnum.BOUND) {
        this.StartSmarterBonded();
      }
    }
    catch (error) {
      logger.error(error);
      return true;
    }
  }
}

function PickWirelessInterface() {
  const iface = execSync("/usr/local/bin/getwirelessinterfaces.sh hotspot",
    {
      encoding: 'utf8'
    }).trim();
  return iface;
};

const hsIface = PickWirelessInterface() || 'wlan0';

const controller = new Main(hsIface);
controller.Init();
