const api = require('./api');
const { logger } = require('./logger');

// module vars
let objectId = '';
let bondedSsid = '';
let bondedPasskey = '';

// init function sets up variables and makes sure the ssid and passkey fields are in the db
function Init() {
  return new Promise((resolve, reject) => {
    logger.debug('Initializing config module...');
    api.authenticate(process.env.GWFA, process.env.GWFP)
      .then(() => {
        return api.getGatewayState();
      })
      .then(xdata => {
        const state = xdata.gatewayState[0];
        objectId = state._id;

        if (!state.ssid && !state.passkey) {
          logger.debug('No bonded mode SSID or passkey found in current state.  Creating SSID and passkey from Resin Device UUID.');

          const resinId = process.env.RESIN_DEVICE_UUID;
          if (!resinId) {
            throw new Error('RESIN_DEVICE_UUID environment variable is missing!');
          } else if (resinId.length < 16) {
            throw new Error(`RESIN_DEVICE_UUID environment variable has unexpected length.  Expected length of 16 characters or more, actual length is ${resinId.length}.`);
          }

          bondedSsid = resinId.substring(0, 8);
          bondedPasskey = resinId.substring(resinId.length - 8, resinId.length);

          api.saveGatewayState(bondedSsid, bondedPasskey, objectId)
            .then(() => {
              // init returns the current gateway state
              logger.debug('Initialized config module.');
              resolve();
            })
            .catch(error => {
              logger.error('An unexpected error occurred while saving the bonded hotspot config.', error);
              reject(error);
            });

        } else {
          logger.debug('Bonded mode SSID and passkey found in gateway state.  Persisting values in config module for future use.');
          bondedSsid = state.ssid;
          bondedPasskey = state.passKey;

          logger.debug('Initialized config module.');
          resolve();
        }
      })
      .catch(error => {
        logger.error('An unexpected error occurred while initializing the config module.', error);
        reject(error);
      });
  });
}

function GetFailoverState() {
  return api.getFailoverSettings();
}

class NetworkConfig {
  constructor(name) {
    this.ssid = null;
    this.passkey = null;
    this.gatewayIp = null;
    this.subnet = '255.255.255.0';
    this.dhcp = null;
    this.name = name;
  }
}

// provisioning config vals
function GetProvisioningHotspotObject() {
  const networkAddress = parseInt(process.env.NETWORK_ADDRESS, 10) || 42;
  const gip = process.env.EXTERNAL_ACCESSPOINT === 'true' ? '10.1.10.1' : `192.168.${networkAddress}.1`;
  const dhcpr = process.env.EXTERNAL_ACCESSPOINT === 'true' ? '10.1.10.3,10.1.10.254' : `192.168.${networkAddress}.2,192.168.${networkAddress}.254`;

  const config = new NetworkConfig('ProvisioningHS');
  if (process.env.PROVISIONING_SSID && process.env.PROVISIONING_PK && process.env.PROVISIONING_SSID !== '' && process.env.PROVISIONING_SSID !== ''){
    config.ssid = process.env.PROVISIONING_SSID;
    config.passkey = process.env.PROVISIONING_PK;    
  } else {
    config.ssid = '4KQCyRN6HS0k';
    config.passkey = 'JNx3eRYqe9zV';    
  }
  config.gatewayIp = gip;
  config.dhcp = dhcpr;
  return config;
}

// bonded config vals
function GetBondedHotspotObject() {
  const networkAddress = parseInt(process.env.NETWORK_ADDRESS, 10) || 42;
  const config = new NetworkConfig('BondedHS');
  config.ssid = bondedSsid;
  config.passkey = bondedPasskey;
  config.gatewayIp = `192.168.${networkAddress}.1`;
  config.dhcp = `192.168.${networkAddress}.2, 192.168.${networkAddress}.250`;
  return config;
}

function GetGlinetObject() {
  const networkAddress = parseInt(process.env.NETWORK_ADDRESS, 10) || 42;
  const config = new NetworkConfig('gwap');
  config.gatewayIp = `192.168.${networkAddress}.1`;
  config.dhcp = `192.168.${networkAddress}.100, 192.168.${networkAddress}.250`;
  return config;  
}

function GetGlinetProvisioningObject() {
  const gip = '10.1.10.1';
  const dhcpr = '10.1.10.3,10.1.10.254'

  const config = new NetworkConfig('ProvisioningHS');
  if (process.env.PROVISIONING_SSID && process.env.PROVISIONING_PK && process.env.PROVISIONING_SSID !== '' && process.env.PROVISIONING_SSID !== ''){
    config.ssid = process.env.PROVISIONING_SSID;
    config.passkey = process.env.PROVISIONING_PK;    
  } else {
    config.ssid = '4KQCyRN6HS0k';
    config.passkey = 'JNx3eRYqe9zV';    
  }
  config.gatewayIp = gip;
  config.dhcp = dhcpr;
  return config;
}


function FeathersUri() {
  const uri = api.getUrl();
  // logger.debug('Feathers root uri: ' + uri);
  return uri;
}

module.exports = {
  Init,
  FeathersUri,
  GetProvisioningHotspotObject,
  GetBondedHotspotObject,
  GetFailoverState,
  GetGlinetObject,
  GetGlinetProvisioningObject
};
