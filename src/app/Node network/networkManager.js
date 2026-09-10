/* eslint-disable no-bitwise */
/* eslint-disable no-underscore-dangle */
// / Network connect library

// / node dbus - https://github.com/Shouqun/node-dbus
// / dbus-native - https://github.com/sidorares/dbus-native
process.env.DISPLAY = ':0';
process.env.DBUS_SESSION_BUS_ADDRESS = 'unix:path=/host/run/dbus/system_bus_socket';

const DBus = require('dbus');
const nDBus = require('dbus-native');
const uuidv4 = require('uuid/v4');
const { Address6 } = require('ip-address');
const { logger } = require('./logger');

const ACTIVATION_TIMEOUT = process.env.ACTIVATION_TIMEOUT || 20;

const enums = {
  paths: Object.freeze({
    NetworkManager: '/org/freedesktop/NetworkManager',
    AgentManager: '/org/freedesktop/NetworkManager/AgentManager',
    Settings: '/org/freedesktop/NetworkManager/Settings',
    ModemManager: '/org/freedesktop/ModemManager1',
  }),
  services: Object.freeze({
    NetworkManager: 'org.freedesktop.NetworkManager',
    Settings: 'org.freedesktop.NetworkManager.Settings',
    ModemManager: 'org.freedesktop.ModemManager1',
  }),
  interfaces: Object.freeze({
    Introspectable: 'org.freedesktop.DBus.Introspectable',
    Properties: 'org.freedesktop.DBus.Properties',
    ObjectManager: 'org.freedesktop.DBus.ObjectManager',
    NetworkManager: 'org.freedesktop.NetworkManager',
    ModemManager: 'org.freedesktop.ModemManager1',
    AccessPoint: 'org.freedesktop.NetworkManager.AccessPoint',
    Device: 'org.freedesktop.NetworkManager.Device',
    DeviceAdsl: 'org.freedesktop.NetworkManager.Device.Adsl',
    DeviceBond: 'org.freedesktop.NetworkManager.Device.Bond',
    DeviceBridge: 'org.freedesktop.NetworkManager.Device.Bridge',
    DeviceBluetooth: 'org.freedesktop.NetworkManager.Device.Bluetooth',
    DeviceWired: 'org.freedesktop.NetworkManager.Device.Wired',
    DeviceGeneric: 'org.freedesktop.NetworkManager.Device.Generic',
    DeviceInfiniband: 'org.freedesktop.NetworkManager.Device.Infiniband',
    DeviceIPTunnel: 'org.freedesktop.NetworkManager.Device.IPTunnel',
    DeviceMacvlan: 'org.freedesktop.NetworkManager.Device.Macvlan',
    DeviceModem: 'org.freedesktop.NetworkManager.Device.Modem',
    DeviceOlpcMesh: 'org.freedesktop.NetworkManager.Device.OlpcMesh',
    DeviceTeam: 'org.freedesktop.NetworkManager.Device.Team',
    DeviceTun: 'org.freedesktop.NetworkManager.Device.Tun',
    DeviceVeth: 'org.freedesktop.NetworkManager.Device.Veth',
    DeviceVlan: 'org.freedesktop.NetworkManager.Device.Vlan',
    DeviceVxlan: 'org.freedesktop.NetworkManager.Device.Vxlan',
    DeviceWireless: 'org.freedesktop.NetworkManager.Device.Wireless',
    DeviceWiMax: 'org.freedesktop.NetworkManager.Device.WiMax',
    WiMaxNsp: 'org.freedesktop.NetworkManager.WiMax.Nsp',
    IP4Config: 'org.freedesktop.NetworkManager.IP4Config',
    IP6Config: 'org.freedesktop.NetworkManager.IP6Config',
    DHCP4Config: 'org.freedesktop.NetworkManager.DHCP4Config',
    DHCP6Config: 'org.freedesktop.NetworkManager.DHCP6Config',
    Settings: 'org.freedesktop.NetworkManager.Settings',
    SettingsConnection: 'org.freedesktop.NetworkManager.Settings.Connection',
    ConnectionActive: 'org.freedesktop.NetworkManager.Connection.Active',
    AgentManager: 'org.freedesktop.NetworkManager.AgentManager',
    SecretAgent: 'org.freedesktop.NetworkManager.SecretAgent',
    VPNConnection: 'org.freedesktop.NetworkManager.VPN.Connection',
    VPNPlugin: 'org.freedesktop.NetworkManager.VPN.Plugin',
  }),
  UI_SELECTED_CONNECTION_TYPE: Object.freeze({
    WIRED_DHCP_IP4: '0',
    WIRED_DHCP_IP6: '1',
    WIRED_DHCP_SHARED_IP4_IP6: '2',
    WIRED_STATIC_IP4: '3',
    WIRED_STATIC_IP6: '4',
    WIRELESS_DHCP_IP4: '5',
    WIRELESS_DHCP_IP6: '6',
    WIRELESS_DHCP_SHARED_IP4_IP6: '7',
    WIRELESS_STATIC_IP4: '8',
    WIRELESS_STATIC_IP6: '9',
    WIRED_SHARED_IPv4: '10',
  }),
};


class NetworkConnectManager {
  // / constructor accepts an array/list of device name strings, or a single device name as string that will be ignored
  // / ex: if ['wlan0'] is passed in, wlan0 will not show up in call to GetAllInterfaces(),
  // / will filter any connections associated with the device in call to GetAllConnections()
  constructor(ignoredDevices) {
    if (ignoredDevices != null) {
      logger.warn("Ignoring the following interfaces:", { ignoredDevices })
      if (typeof ignoredDevices === 'string') {
        this.ignoredDevices = [ignoredDevices];
      }

      if (ignoredDevices instanceof Array) {
        this.ignoredDevices = ignoredDevices;
      }
    }
    try {
      this.bus = DBus.getBus('system');
      this.nbus = nDBus.sessionBus();
    } catch (error) {
      logger.error(error);
    }
  }

  // / PRIVATE METHODS ---------------------------------------------------------------------------------------------------------------------------------- ///
  // / -------------------------------------------------------------------------------------------------------------------------------------------------- ///

  // / returns true if device name is not in the ignored devices list
  _checkDeviceInIgnoredDevices(deviceName) {
    if (this.ignoredDevices != null) {
      if (this.ignoredDevices.indexOf(deviceName) > -1) {
        return false;
      }
    }
    return true;
  }

  // / returns all properties associated with a connection
  _getConnectionInformation(connectionPath) {
    return new Promise((resolve, reject) => {
      this.bus.getInterface(enums.services.NetworkManager, connectionPath, enums.interfaces.SettingsConnection, (err, xinterface) => {
        if (err) {
          reject(err);
        }
        xinterface.GetSettings((error, settingsObj) => {
          if (error) {
            reject(error);
          }

          // / filter out connections of type 'bridge'
          if (settingsObj.connection.type !== 'bridge') {
            if (settingsObj.connection['interface-name']) {
              if (!this._checkDeviceInIgnoredDevices(settingsObj.connection['interface-name'])) {
                resolve();
              }
              resolve({ path: connectionPath, settings: settingsObj });
            } else {
              resolve();
            }
          } else {
            resolve();
          }
        });
      });
    });
  }

  _getAnyConnectionInformation(connectionPath, connectionName) {
    return new Promise((resolve, reject) => {
      this.bus.getInterface(enums.services.NetworkManager, connectionPath, enums.interfaces.SettingsConnection, (err, xinterface) => {
        if (err) {
          reject(err);
        }
        xinterface.GetSettings((error, settingsObj) => {
          if (error) {
            reject(error);
          }

          // / filter out connections of type 'bridge'
          if (settingsObj.connection.id === connectionName) {
            resolve({ path: connectionPath, settings: settingsObj });
          } else {
            resolve();
          }
        });
      });
    });
  }

  // / returns all properties associated with a connection
  _getActiveConnectionInformation(connectionPath) {
    return new Promise((resolve, reject) => {
      this.bus.getInterface(enums.services.NetworkManager, connectionPath, enums.interfaces.Properties, (err, xinterface) => {
        if (err) {
          reject(err);
        }
        xinterface.GetAll('org.freedesktop.NetworkManager.Connection.Active', (error, settingsObj) => {
          if (error) {
            reject(error);
          }
          resolve({ path: connectionPath, settings: settingsObj });
        });
      });
    });
  }

  // / returns all properties associated with a device
  _getDeviceInformation(devicePath) {
    return new Promise((resolve, reject) => {
      this.bus.getInterface(enums.services.NetworkManager, devicePath, enums.interfaces.Properties, (err, xinterface) => {
        if (err) {
          reject(err);
        }
        xinterface.GetAll('org.freedesktop.NetworkManager.Device', (error, deviceObj) => {
          if (error) {
            reject(error);
          }

          // / filter device type by valid ethernet or wireless interfaces
          if ((deviceObj.DeviceType == 1 || deviceObj.DeviceType == 2) && this._checkDeviceInIgnoredDevices(deviceObj.Interface)) {
            resolve({ path: devicePath, settings: deviceObj, type: deviceObj.DeviceType });
          } else {
            resolve();
          }
        });
      });
    });
  }

  _getAnyDeviceInformation(devicePath, deviceName) {
    return new Promise((resolve, reject) => {
      this.bus.getInterface(enums.services.NetworkManager, devicePath, enums.interfaces.Properties, (err, xinterface) => {
        if (err) {
          reject(err);
        }
        xinterface.GetAll('org.freedesktop.NetworkManager.Device', (error, deviceObj) => {
          if (error) {
            reject(error);
          }

          // / filter device type by valid ethernet or wireless interfaces
          if (deviceObj.DeviceType == 1 || deviceObj.DeviceType == 2) {
            if (deviceObj.Interface == deviceName) {
              resolve({ path: devicePath, settings: deviceObj, type: deviceObj.DeviceType });
            } else {
              resolve();
            }
          } else {
            resolve();
          }
        });
      });
    });
  }

  // / returns the current NM_DEVICE_STATE for device -- to be used during connection activation
  _getDeviceState(devicePath) {
    return new Promise((resolve, reject) => {
      this.bus.getInterface(enums.services.NetworkManager, devicePath, enums.interfaces.Properties, (err, xinterface) => {
        if (err) {
          resolve(-1);
        }
        xinterface.Get('org.freedesktop.NetworkManager.Device', 'State', (error, state) => {
          if (error) {
            resolve(-1);
          }
          // logger.debug("Resolving state: " + state);
          resolve(state);
        });
      });
    });
  }

  // / returns access point information for an ap path
  _getAccessPointInformation(apPath) {
    return new Promise((resolve, reject) => {
      this.bus.getInterface(enums.services.NetworkManager, apPath, enums.interfaces.Properties, (err, xinterface) => {
        if (err) {
          reject(err);
        }
        xinterface.GetAll('org.freedesktop.NetworkManager.AccessPoint', (error, apInfo) => {
          if (error) {
            reject(error);
          }
          apInfo.Ssid = Buffer.from(apInfo.Ssid).toString('utf8');
          resolve(apInfo);
        });
      });
    });
  }

  // / converts an ip to an int32 in little endian byte order (network byte order)
  _ipToInt(stringip) {
    return stringip.split('.').reverse().reduce((ipInt, octet) => { return (ipInt << 8) + parseInt(octet, 10); }, 0) >>> 0;
  }

  // / converts a string to a byte array
  _stringToBytearray(stringVal, isIpv6) {
    if (isIpv6) {
      return new Address6(stringVal).toUnsignedByteArray();
    }

    const data = [];
    for (let i = 0; i < stringVal.length; i++) {
      data.push(stringVal.charCodeAt(i));
    }
    return data;
  }

  // / counts the used bits in the subnet mask and retuns a CIDR
  _subnetToCidr(subnetString) {
    const totals = [];
    const sections = subnetString.split('.');
    const bitSections = [1, 2, 4, 8, 16, 32, 64, 128];

    for (let i = 0; i < sections.length; i++) {
      const section = parseInt(sections[i], 10);
      const bits = [];

      for (let t = 0; t < bitSections.length; t++) {
        if ((section & bitSections[t]) === bitSections[t]) {
          bits.push(1);
        } else {
          bits.push(0);
        }
      }
      totals.push(bits.reduce((a, b) => { return a + b; }));
    }
    return totals.reduce((a, b) => { return a + b; });
  }

  // / returns the correct ipv6 structure for static ipv6 wired connections ----> this uses dbus-native library
  _getIpv6WiredConnectionBlock(settings) {
    // more information on ipv6 properties for NetworkManager 1.10.0
    // https://developer.gnome.org/NetworkManager/1.10/settings-ipv6.html


    // addr-gen-mode
    //
    // int32
    //
    // Configure method for creating the address for use with RFC4862 IPv6 Stateless Address Autoconfiguration. The permitted values are: NM_SETTING_IP6_CONFIG_ADDR_GEN_MODE_EUI64 (0)
    // or NM_SETTING_IP6_CONFIG_ADDR_GEN_MODE_STABLE_PRIVACY (1). If the property is set to EUI64, the addresses will be generated using the interface tokens derived from hardware
    // address. This makes the host part of the address to stay constant, making it possible to track host's presence when it changes networks. The address changes when the interface
    // hardware is replaced. The value of stable-privacy enables use of cryptographically secure hash of a secret host-specific key along with the connection's stable-id and the network
    // address as specified by RFC7217. This makes it impossible to use the address track host's presence, and makes the address stable when the network interface hardware is replaced.
    // On D-Bus, the absence of an addr-gen-mode setting equals enabling stable-privacy. For keyfile plugin, the absence of the setting on disk means EUI64 so that the property doesn't
    // change on upgrade from older versions. Note that this setting is distinct from the Privacy Extensions as configured by "ip6-privacy" property and it does not affect the temporary
    // addresses configured with this option.


    // ip6-privacy
    //
    // NMSettingIP6ConfigPrivacy (int32)
    //
    // Configure IPv6 Privacy Extensions for SLAAC, described in RFC4941. If enabled, it makes the kernel generate a temporary IPv6 address in addition to the public one generated from
    // MAC address via modified EUI-64. This enhances privacy, but could cause problems in some applications, on the other hand. The permitted values are: -1: unknown, 0: disabled,
    // 1: enabled (prefer public address), 2: enabled (prefer temporary addresses). Having a per-connection setting set to "-1" (unknown) means fallback to global configuration
    // "ipv6.ip6-privacy". If also global configuration is unspecified or set to "-1", fallback to read "/proc/sys/net/ipv6/conf/default/use_tempaddr". Note that this setting is
    // distinct from the Stable Privacy addresses that can be enabled with the "addr-gen-mode" property's "stable-privacy" setting as another way of avoiding host tracking with IPv6
    // addresses.

    // defaults

    if (settings.dns1 == undefined || settings.dns1 == '') {
      settings.dns1 = '2001:4860:4860::8888';
    }
    if (settings.dns2 == undefined || settings.dns2 == '') {
      settings.dns2 = '2001:4860:4860::8844';
    }

    if (settings.ip6privacy == undefined || settings.ip6privacy == '') {
      settings.ip6privacy = -1;
    }
    if (settings.ip6genmode == undefined || settings.ip6genmode == '') {
      settings.ip6genmode = 1;
    }


    return [
      ['802-3-ethernet',
        [
          ['auto-negotiate', ['b', 1]],
        ],
      ],
      ['connection',
        [
          ['id', ['s', settings.name]],
          ['type', ['s', '802-3-ethernet']],
          ['uuid', ['s', uuidv4()]],
          ['interface-name', ['s', settings.interfaceName]],
          ['autoconnect', ['b', 1]],
        ],
      ],
      ['ipv4',
        [
          ['method', ['s', 'auto']],
        ],
      ],
      ['ipv6',
        [
          ['method', ['s', 'manual']],
          ['ip6-privacy', ['i', parseInt(settings.ip6privacy, 10)]],
          ['addr-gen-mode', ['i', parseInt(settings.ip6genmode, 10)]],
          ['dns',
            ['aay',
              [
                [
                  this._stringToBytearray(settings.dns1, true),
                  this._stringToBytearray(settings.dns2, true),
                ],
              ],
            ],
          ],
          ['addresses',
            ['a(ayuay)',
              [
                [
                  [
                    this._stringToBytearray(settings.ip, true),
                    parseInt(settings.subnet, 10),
                    this._stringToBytearray(settings.gateway, true),
                  ],
                ],
              ],
            ],
          ],
        ],
      ],
    ];
  }

  // / returns the correct ipv6 structure for static ipv6 wireless connections ----> this uses dbus-native library
  _getIpv6WirelessConnectionBlock(settings) {
    // more information on ipv6 properties for NetworkManager 1.10.0
    // https://developer.gnome.org/NetworkManager/1.10/settings-ipv6.html


    // addr-gen-mode
    //
    // int32
    //
    // Configure method for creating the address for use with RFC4862 IPv6 Stateless Address Autoconfiguration. The permitted values are: NM_SETTING_IP6_CONFIG_ADDR_GEN_MODE_EUI64 (0)
    // or NM_SETTING_IP6_CONFIG_ADDR_GEN_MODE_STABLE_PRIVACY (1). If the property is set to EUI64, the addresses will be generated using the interface tokens derived from hardware
    // address. This makes the host part of the address to stay constant, making it possible to track host's presence when it changes networks. The address changes when the interface
    // hardware is replaced. The value of stable-privacy enables use of cryptographically secure hash of a secret host-specific key along with the connection's stable-id and the network
    // address as specified by RFC7217. This makes it impossible to use the address track host's presence, and makes the address stable when the network interface hardware is replaced.
    // On D-Bus, the absence of an addr-gen-mode setting equals enabling stable-privacy. For keyfile plugin, the absence of the setting on disk means EUI64 so that the property doesn't
    // change on upgrade from older versions. Note that this setting is distinct from the Privacy Extensions as configured by "ip6-privacy" property and it does not affect the temporary
    // addresses configured with this option.


    // ip6-privacy
    //
    // NMSettingIP6ConfigPrivacy (int32)
    //
    // Configure IPv6 Privacy Extensions for SLAAC, described in RFC4941. If enabled, it makes the kernel generate a temporary IPv6 address in addition to the public one generated from
    // MAC address via modified EUI-64. This enhances privacy, but could cause problems in some applications, on the other hand. The permitted values are: -1: unknown, 0: disabled,
    // 1: enabled (prefer public address), 2: enabled (prefer temporary addresses). Having a per-connection setting set to "-1" (unknown) means fallback to global configuration
    // "ipv6.ip6-privacy". If also global configuration is unspecified or set to "-1", fallback to read "/proc/sys/net/ipv6/conf/default/use_tempaddr". Note that this setting is
    // distinct from the Stable Privacy addresses that can be enabled with the "addr-gen-mode" property's "stable-privacy" setting as another way of avoiding host tracking with IPv6
    // addresses.

    // defaults

    if (settings.dns1 == undefined || settings.dns1 == '') {
      settings.dns1 = '2001:4860:4860::8888';
    }
    if (settings.dns2 == undefined || settings.dns2 == '') {
      settings.dns2 = '2001:4860:4860::8844';
    }

    if (settings.ip6privacy == undefined) {
      settings.ip6privacy = -1;
    }
    if (settings.ip6genmode == undefined) {
      settings.ip6genmode = 1;
    }

    if (settings.hidden != undefined) {
      if (settings.hidden) {
        settings.hidden = 1;
      } else {
        settings.hidden = 0;
      }
    } else {
      settings.hidden = 0;
    }

    const p = [
      ['802-11-wireless',
        [
          ['ssid', ['ay', [this._stringToBytearray(settings.ssid)]]],
          ['mode', ['s', 'infrastructure']],
          ['hidden', ['b', settings.hidden]],
        ],
      ],
      ['connection',
        [
          ['id', ['s', settings.name]],
          ['type', ['s', '802-11-wireless']],
          ['uuid', ['s', uuidv4()]],
          ['interface-name', ['s', settings.interfaceName]],
          ['autoconnect', ['b', 1]],
        ],
      ],
      ['ipv4',
        [
          ['method', ['s', 'auto']],
        ],
      ],
      ['ipv6',
        [
          ['method', ['s', 'manual']],
          ['ip6-privacy', ['i', parseInt(settings.ip6privacy, 10)]],
          ['addr-gen-mode', ['i', parseInt(settings.ip6genmode, 10)]],
          ['dns',
            ['aay',
              [
                [
                  this._stringToBytearray(settings.dns1, true),
                  this._stringToBytearray(settings.dns2, true),
                ],
              ],
            ],
          ],
          ['addresses',
            ['a(ayuay)',
              [
                [
                  [
                    this._stringToBytearray(settings.ip, true),
                    parseInt(settings.subnet, 10),
                    this._stringToBytearray(settings.gateway, true),
                  ],
                ],
              ],
            ],
          ],
        ],
      ],
    ];

    if (settings.passkey != undefined || settings.passkey != '') {
      p.push(['802-11-wireless-security',
        [
          ['key-mgmt', ['s', 'wpa-psk']],
          ['auth-alg', ['s', 'open']],
          ['psk', ['s', settings.passkey]],
        ],
      ]);
    }

    return p;
  }

  // / PUBLIC METHODS ----------------------------------------------------------------------------------------------------------------------------------- ///
  // / -------------------------------------------------------------------------------------------------------------------------------------------------- ///

  // GetAllAccessPoints - returns list of ssids currently listed on the device parameter
  GetAllAccessPoints(devicePath) {
    return new Promise((resolve, reject) => {
      this.bus.getInterface(enums.services.NetworkManager, devicePath, enums.interfaces.DeviceWireless, (err, xinterface) => {
        if (err) {
          reject(err);
        }
        xinterface.GetAllAccessPoints((error, aps) => {
          if (error) {
            reject(error);
          }
          // / make a list of promises to return back to the calling source
          const apObjects = [];
          for (let i = 0; i < aps.length; i++) {
            // / _getAccessPointInformation returns all properties of the ap as json
            apObjects.push(this._getAccessPointInformation(aps[i]));
          }
          // / _getAccessPointInformation returns both valid and invalid ap connections, filter out null objects and return the list of promises
          resolve(Promise.all(apObjects)
            .then(values => values.filter(v => v)));
        });
      });
    });
  }

  // RequestSsidScan -- starts a scan on the wireless device
  RequestSsidScan(devicePath) {
    return new Promise((resolve, reject) => {
      this.bus.getInterface(enums.services.NetworkManager, devicePath, enums.interfaces.DeviceWireless, (err, xinterface) => {
        if (err) {
          reject(err);
        }
        xinterface.RequestScan(error => {
          if (error) {
            reject(error);
          }
          resolve();
        });
      });
    });
  }

  GetAllActiveConnections() {
    return new Promise((resolve, reject) => {
      // / latch the dbus network manager interface responsible for working with connection objects
      this.bus.getInterface(enums.services.NetworkManager, enums.paths.NetworkManager, enums.interfaces.Properties, (err, xinterface) => {
        if (err) {
          reject(err);
        }
        xinterface.Get('org.freedesktop.NetworkManager', 'ActiveConnections', (error, activeConnections) => {
          if (error) {
            reject(error);
          }
          // / make a list of promises to return back to the calling source
          const connectionObjects = [];
          for (let i = 0; i < activeConnections.length; i++) {
            // / getConnectionInformation returns all properties of the connection as json
            connectionObjects.push(this._getActiveConnectionInformation(activeConnections[i]));
          }
          // / getConnectionInformation returns both valid and invalid connections, filter out null objects and return the list of promises
          resolve(Promise.all(connectionObjects)
            .then(values => values.filter(v => v)));
        });
      });
    });
  }

  // / GetAllConnections - return list of connections as json.  This list is filtered by connections that are not of type 'bridge'.
  GetAllConnections() {
    return new Promise((resolve, reject) => {
      // / latch the dbus network manager interface responsible for working with connection objects
      this.bus.getInterface(enums.services.NetworkManager, enums.paths.Settings, enums.interfaces.Settings, (err, xinterface) => {
        if (err) {
          reject(err);
        }

        // / call 'ListConnections' method on connections interface
        xinterface.ListConnections((error, connections) => {
          if (error) {
            reject(error);
          }
          // / make a list of promises to return back to the calling source
          const connectionObjects = [];
          for (let i = 0; i < connections.length; i++) {
            // / getConnectionInformation returns all properties of the connection as json
            connectionObjects.push(this._getConnectionInformation(connections[i]));
          }
          // / getConnectionInformation returns both valid and invalid connections, filter out null objects and return the list of promises
          resolve(Promise.all(connectionObjects)
            .then(values => values.filter(v => v)));
        });
      });
    });
  }

  // / GetAllConnections - return list of connections as json.  This list is filtered by connections that are not of type 'bridge'.
  GetConnectionPath(conName) {
    return new Promise((resolve, reject) => {
      // / latch the dbus network manager interface responsible for working with connection objects
      this.bus.getInterface(enums.services.NetworkManager, enums.paths.Settings, enums.interfaces.Settings, (err, xinterface) => {
        if (err) {
          reject(err);
        }

        // / call 'ListConnections' method on connections interface
        xinterface.ListConnections((error, connections) => {
          if (error) {
            reject(error);
          }
          // / make a list of promises to return back to the calling source
          const connectionObjects = [];
          for (let i = 0; i < connections.length; i++) {
            // / getConnectionInformation returns all properties of the connection as json
            connectionObjects.push(this._getAnyConnectionInformation(connections[i], conName));
          }
          // / getConnectionInformation returns both valid and invalid connections, filter out null objects and return the list of promises
          resolve(Promise.all(connectionObjects)
            .then(values => values.filter(v => v)));
        });
      });
    });
  }

  // / GetAllInterfaces - return list of devices as json.  This list is filtered by devices that are of type ethernet or wifi.
  GetAllInterfaces() {
    return new Promise((resolve, reject) => {
      // / get dbus network manager interface responsible for working with network interface device objects
      this.bus.getInterface(enums.services.NetworkManager, enums.paths.NetworkManager, enums.interfaces.NetworkManager, (err, xinterface) => {
        if (err) {
          reject(err);
        }
        // / call getDevices method on device interface
        xinterface.GetDevices((error, devices) => {
          if (error) {
            reject(error);
          }
          // make a list of promises to return back to the calling source
          const deviceObjects = [];
          for (let i = 0; i < devices.length; i++) {
            // / getDeviceInformation returns all properties of the device as json
            deviceObjects.push(this._getDeviceInformation(devices[i]));
          }
          // / getDeviceInformation returns both valid and invalid devices, filter out null objects and return the list of promises
          resolve(Promise.all(deviceObjects)
            .then(values => values.filter(v => v)));
        });
      });
    });
  }

  GetInterfacePath(interfaceName) {
    return new Promise((resolve, reject) => {
      // / get dbus network manager interface responsible for working with network interface device objects
      this.bus.getInterface(enums.services.NetworkManager, enums.paths.NetworkManager, enums.interfaces.NetworkManager, (err, xinterface) => {
        if (err) {
          reject(err);
        }
        // / call getDevices method on device interface
        xinterface.GetDevices((error, devices) => {
          if (err) {
            reject(err);
          }
          // make a list of promises to return back to the calling source
          const deviceObjects = [];
          for (let i = 0; i < devices.length; i++) {
            // / getDeviceInformation returns all properties of the device as json
            deviceObjects.push(this._getAnyDeviceInformation(devices[i], interfaceName));
          }
          // / getDeviceInformation returns both valid and invalid devices, filter out null objects and return the list of promises
          resolve(Promise.all(deviceObjects)
            .then(values => values.filter(v => v)));
        });
      });
    });
  }

  // / CreateNewWiredConnection - returns a connection object path after a successful connection addition to network manager
  CreateNewWiredConnection(settings) {
    return new Promise((resolve, reject) => {
      if (settings.connectivityType == enums.UI_SELECTED_CONNECTION_TYPE.WIRED_STATIC_IP6) {
        const con = this._getIpv6WiredConnectionBlock(settings);

        logger.debug(JSON.stringify(con, null, 2));
        // use dbus native to send this complex object/struct using from tree structure
        this.nbus.getService(enums.services.NetworkManager).getInterface(
          enums.paths.Settings,
          enums.interfaces.Settings,
          (err, xinterface) => {
            xinterface.AddConnection(con, (error, result) => {
              if (err) {
                reject(err);
              }
              resolve(result);
            });
          },
        );

      } else {

        const conObject = {
          '802-3-ethernet': '',
          connection: '',
          ipv4: '',
          ipv6: '',
        };

        conObject['802-3-ethernet'] = {
          'auto-negotiate': true,
        };

        conObject.connection = {
          type: '802-3-ethernet',
          uuid: uuidv4(),
          'interface-name': settings.interfaceName,
          id: settings.name || 'WiredConnection',
          autoconnect: true,
        };

        // set defaults for dns1 and dns2
        if (settings.connectivityType == enums.UI_SELECTED_CONNECTION_TYPE.WIRED_STATIC_IP4 ||
            settings.connectivityType == enums.UI_SELECTED_CONNECTION_TYPE.WIRED_SHARED_IPv4) {
          if (settings.dns1 == undefined || settings.dns1 == '') {
            settings.dns1 = '8.8.8.8';
          }
          if (settings.dns2 == undefined || settings.dns2 == '') {
            settings.dns2 = '8.8.4.4';
          }
        }

        switch (settings.connectivityType) {
        case enums.UI_SELECTED_CONNECTION_TYPE.WIRED_DHCP_SHARED_IP4_IP6:
          conObject.ipv4 = {
            method: 'auto',
          };
          conObject.ipv6 = {
            method: 'auto',
          };
          break;
        case enums.UI_SELECTED_CONNECTION_TYPE.WIRED_DHCP_IP4:
          conObject.ipv4 = {
            method: 'auto',
          };
          conObject.ipv6 = {
            method: 'ignore',
          };
          break;
        case enums.UI_SELECTED_CONNECTION_TYPE.WIRED_DHCP_IP6:
          conObject.ipv4 = {
            method: 'auto',
          };
          conObject.ipv6 = {
            method: 'auto',
          };
          break;
        case enums.UI_SELECTED_CONNECTION_TYPE.WIRED_STATIC_IP4:
          conObject.ipv4 = {
            addresses: [[this._ipToInt(settings.ip), this._subnetToCidr(settings.subnet), this._ipToInt(settings.gateway)]],
            dns: [this._ipToInt(settings.dns1), this._ipToInt(settings.dns2)],
            method: 'manual',
          };
          conObject.ipv6 = {
            method: 'ignore',
          };
          break;
        case enums.UI_SELECTED_CONNECTION_TYPE.WIRED_SHARED_IPv4:
          conObject.ipv4 = {
            addresses: [[this._ipToInt(settings.ip), this._subnetToCidr(settings.subnet), this._ipToInt(settings.gateway)]],
            // dns is now allowed for shared. will need it if we do manual
            // dns: [this._ipToInt(settings.dns1), this._ipToInt(settings.dns2)],
            method: 'shared',
          };
          conObject.ipv6 = {
            method: 'disabled',
          };
          break;
        default:
          logger.error('Unexpected connectivity type');
        }

        // / get the settings interface
        this.bus.getInterface(enums.services.NetworkManager, enums.paths.Settings, enums.interfaces.Settings, (err, xinterface) => {
          if (err) {
            logger.error('Something went wrong when getting the settings interface.', err);
            reject(err);
          }
          // / add the newly created connection to network manager settings
          xinterface.AddConnection(conObject, {}, (error, result) => {
            if (error) {
              logger.error('Something went wrong when creating the connection.');
              reject(error);
            }
            resolve(result);
          });
        });
      }
    });
  }

  // / CreateNewWirelessConnection - returns a connection object path after a successful connection addition to network manager
  CreateNewWirelessConnection(settings) {
    return new Promise((resolve, reject) => {
      if (settings.connectivityType == enums.UI_SELECTED_CONNECTION_TYPE.WIRELESS_STATIC_IP6) {
        const con = this._getIpv6WirelessConnectionBlock(settings);

        // use dbus native to send this complex object/struct using from tree structure
        this.nbus.getService(enums.services.NetworkManager).getInterface(
          enums.paths.Settings,
          enums.interfaces.Settings,
          (err, xinterface) => {
            xinterface.AddConnection(con, (error, result) => {
              if (error) {
                reject(error);
              }
              resolve(result);
            });
          },
        );

      } else {

        const conObject = {
          '802-11-wireless': '',
          connection: '',
          ipv4: '',
          ipv6: '',
        };

        conObject['802-11-wireless'] = {
          ssid: this._stringToBytearray(settings.ssid),
          mode: 'infrastructure',
          hidden: settings.hidden,
          powersave: 2,
          'mac-address-randomization': 1, // never according to man pages
          // Jeff complained that in some gateways this wasn't true. It could be due to balena's settings
          // os.network.wifi.randomMacAddressScan should be set to false
        };

        conObject.connection = {
          type: '802-11-wireless',
          uuid: uuidv4(),
          'interface-name': settings.interfaceName,
          id: settings.name || 'WirelessConnection',
          autoconnect: true,
        };

        if (settings.passkey != undefined && settings.passkey != '') {
          conObject['802-11-wireless-security'] = {
            'key-mgmt': 'wpa-psk',
            'auth-alg': 'open',
            psk: settings.passkey,
          };
        }

        // set defaults for dns1 and dns2
        if (settings.connectivityType == enums.UI_SELECTED_CONNECTION_TYPE.WIRELESS_STATIC_IP4) {
          if (settings.dns1 == undefined || settings.dns1 == '') {
            settings.dns1 = '8.8.8.8';
          }
          if (settings.dns2 == undefined || settings.dns2 == '') {
            settings.dns2 = '8.8.4.4';
          }
        }

        switch (settings.connectivityType) {
        case enums.UI_SELECTED_CONNECTION_TYPE.WIRELESS_DHCP_SHARED_IP4_IP6:
          conObject.ipv4 = {
            method: 'auto',
          };
          conObject.ipv6 = {
            method: 'auto',
          };
          break;
        case enums.UI_SELECTED_CONNECTION_TYPE.WIRELESS_DHCP_IP4:
          conObject.ipv4 = {
            method: 'auto',
            'route-metric': 150,
          };
          conObject.ipv6 = {
            method: 'ignore',
          };
          break;
        case enums.UI_SELECTED_CONNECTION_TYPE.WIRELESS_DHCP_IP6:
          conObject.ipv4 = {
            method: 'ignore',
          };
          conObject.ipv6 = {
            method: 'auto',
          };
          break;
        case enums.UI_SELECTED_CONNECTION_TYPE.WIRELESS_STATIC_IP4:
          conObject.ipv4 = {
            addresses: [[this._ipToInt(settings.ip), this._subnetToCidr(settings.subnet), this._ipToInt(settings.gateway)]],
            dns: [this._ipToInt(settings.dns1), this._ipToInt(settings.dns2)],
            method: 'manual',
            'route-metric': 150,
          };
          conObject.ipv6 = {
            method: 'ignore',
          };
          break;
        default:
          logger.error('Unexpected connectivity type');
        }

        // / get the settings interface
        this.bus.getInterface(enums.services.NetworkManager, enums.paths.Settings, enums.interfaces.Settings, (err, xinterface) => {
          if (err) {
            logger.error('Something went wrong when getting the settings interface.', err);
            reject(err);
          }
          // / add the newly created connection to network manager settings
          xinterface.AddConnection(conObject, {}, (error, result) => {
            if (error) {
              logger.error('Something went wrong when creating the connection.');
              reject(error);
            }
            resolve(result);
          });
        });

      }
    });
  }

  // / DeleteConnection - returns success if connection at path was sucessfully deleted
  DeleteConnection(connectionPath) {
    return new Promise((resolve, reject) => {
      this.bus.getInterface(enums.services.NetworkManager, connectionPath, enums.interfaces.SettingsConnection, (err, xinterface) => {
        if (err) {
          reject(err);
        }
        xinterface.Delete((error, success) => {
          if (error) {
            reject(error);
          }
          resolve('Connection successfully deleted.');
        });
      });
    });
  }

  // / stoopid nodejs
  UpdateDeviceStatus(startTime, devicePath, reject, resolve) {
    this._getDeviceState(devicePath)
      .then(state => {
        logger.debug(`State: ${state}`);
        if (state == 100) {
          resolve('Connection successfully activated.');
          return;
        }
        if ((new Date() - startTime) / 1000 > ACTIVATION_TIMEOUT) {
          reject('Connection activation timed out');
          return;
        }
        setTimeout(() => {
          this.UpdateDeviceStatus(startTime, devicePath, reject, resolve);
        }, 1000);
      }).catch(err => {
        reject('Connection activation threw an exception');

      });
  }

  // / Activates a connection and binds the connection to a device.  returns message string in promise
  ActivateConnection(connectionPath, devicePath) {
    return new Promise((resolve, reject) => {
      this.bus.getInterface(enums.services.NetworkManager, enums.paths.NetworkManager, enums.interfaces.NetworkManager, (err, xinterface) => {
        if (err) {
          reject(err);
        }
        xinterface.ActivateConnection(connectionPath, devicePath, '/', (error, activeConnectionPath) => {
          if (error) {
            reject(error);
          }
          const startTime = new Date();
          // logger.debug("Calling UpdateDeviceStatus");

          this.UpdateDeviceStatus(startTime, devicePath, reject, resolve);
        });
      });
    });
  }

  CreateHotspotConnection(hotspotObject) {
    return new Promise((resolve, reject) => {

      const conObject = {
        '802-11-wireless': '',
        connection: '',
        ipv4: '',
        ipv6: '',
      };

      conObject['802-11-wireless'] = {
        ssid: this._stringToBytearray(hotspotObject.ssid),
        mode: 'ap',
        hidden: hotspotObject.hidden,
        band: 'bg',
        channel: hotspotObject.channel,
        'mac-address-randomization': 1,
        powersave: 2,
      };

      conObject.connection = {
        type: '802-11-wireless',
        uuid: uuidv4(),
        'interface-name': hotspotObject.ifaceName,
        id: hotspotObject.name,
      };

      // method needs to set to shared for a bridged connection
      // When set to shared networkmanager runs its own instance of dnsmasq. We don't need to run it ourselves
      conObject.ipv4 = {
        addresses: [[this._ipToInt(hotspotObject.ip), this._subnetToCidr(hotspotObject.subnet), this._ipToInt(hotspotObject.gateway)]],
        method: 'manual',
      };

      conObject.ipv6 = {
        method: 'disabled',
      };

      if (hotspotObject.passkey !== undefined
          && hotspotObject.passkey !== ''
          && hotspotObject.passkey !== null) {
        conObject['802-11-wireless-security'] = {
          proto: ['rsn'],
          'key-mgmt': 'wpa-psk',
          'auth-alg': 'open',
          pairwise: ['ccmp'],
          group: ['ccmp'],
          psk: hotspotObject.passkey,
        };
      }

      // logger.debug(JSON.stringify(conObject, null, 2));

      // / get the settings interface
      this.bus.getInterface(enums.services.NetworkManager, enums.paths.Settings, enums.interfaces.Settings, (err, xinterface) => {
        if (err) {
          logger.error('Something went wrong when getting the settings interface.', err);
          reject(err);
        }

        // / add the newly created connection to network manager settings
        xinterface.AddConnection(conObject, {}, (error, result) => {
          if (error) {
            logger.error('Something went wrong when creating the connection.', error);
            reject(error);
          }
          resolve(result);
        });
      });
    });
  }


  CreateSharedHotspotConnection(hotspotObject) {
    return new Promise((resolve, reject) => {

      const conObject = {
        '802-11-wireless': '',
        connection: '',
        ipv4: '',
        ipv6: '',
      };

      conObject['802-11-wireless'] = {
        ssid: this._stringToBytearray(hotspotObject.ssid),
        mode: 'ap',
        hidden: hotspotObject.hidden,
        band: 'bg',
        channel: hotspotObject.channel,
        'mac-address-randomization': 1,
        powersave: 2,
      };

      conObject.connection = {
        type: '802-11-wireless',
        uuid: uuidv4(),
        'interface-name': hotspotObject.ifaceName,
        id: hotspotObject.name,
      };

      // method needs to set to shared for a bridged connection
      // When set to shared networkmanager runs its own instance of dnsmasq. We don't need to run it ourselves
      conObject.ipv4 = {
        addresses: [[this._ipToInt(hotspotObject.ip), this._subnetToCidr(hotspotObject.subnet), this._ipToInt(hotspotObject.gateway)]],
        method: 'shared',
      };

      conObject.ipv6 = {
        method: 'disabled',
      };

      if (hotspotObject.passkey !== undefined
          && hotspotObject.passkey !== ''
          && hotspotObject.passkey !== null) {
        conObject['802-11-wireless-security'] = {
          proto: ['rsn'],
          'key-mgmt': 'wpa-psk',
          'auth-alg': 'open',
          pairwise: ['ccmp'],
          group: ['ccmp'],
          psk: hotspotObject.passkey,
        };
      }

      // logger.debug(JSON.stringify(conObject, null, 2));

      // / get the settings interface
      this.bus.getInterface(enums.services.NetworkManager, enums.paths.Settings, enums.interfaces.Settings, (err, xinterface) => {
        if (err) {
          logger.error('Something went wrong when getting the settings interface.', err);
          reject(err);
        }

        // / add the newly created connection to network manager settings
        xinterface.AddConnection(conObject, {}, (error, result) => {
          if (error) {
            logger.error('Something went wrong when creating the connection.', error);
            reject(error);
          }
          resolve(result);
        });
      });
    });
  }

  CreateCellularConnection() {
    return new Promise((resolve, reject) => {
      const conObject = {
        gsm: '',
        connection: '',
        ipv4: '',
        ipv6: '',
      };

      conObject.gsm = {
        apn: 'vzwinternet',
      };

      conObject.connection = {
        id: 'verizon',
        type: 'gsm',
        autoconnect: true,
        'interface-name': 'cdc-wdm0',
        uuid: uuidv4(),
      };

      conObject.ipv4 = {
        method: 'auto',
        'route-metric': 200,
      };

      conObject.ipv6 = {
        method: 'ignore',
      };

      // / get the settings interface
      this.bus.getInterface(enums.services.NetworkManager, enums.paths.Settings, enums.interfaces.Settings, (err, xinterface) => {
        if (err) {
          logger.error('Something went wrong when getting the settings interface.', err);
          reject(err);
        }

        // / add the newly created connection to network manager settings
        xinterface.AddConnection(conObject, {}, (error, result) => {
          if (error) {
            logger.error('Something went wrong when creating the connection.', error);
            reject(error);
          }
          resolve(result);
        });
      });

    });
  }


  // //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////MODEM MANAGER CALLS
  // Don't know what they were going for with this one
  ScanForAvailableModems() {
    return new Promise((resolve, reject) => {
      this.bus.getInterface(enums.services.ModemManager, enums.paths.ModemManager, enums.interfaces.ModemManager, (err, xinterface) => {
        if (err) {
          logger.error('Something went wrong when getting the interface.', err);
          reject(err);
        }

        xinterface.ScanDevices(error => {
          if (error) {
            logger.error('Something went wrong when starting the modem scan!', error);
            reject(error);
          }
          resolve();
        });
      });
    });
  }

  // https://dbus.freedesktop.org/doc/dbus-specification.html#standard-interfaces-objectmanager
  ListAvailableModems() {
    return new Promise((resolve, reject) => {
      this.bus.getInterface(enums.services.ModemManager, enums.paths.ModemManager, enums.interfaces.ObjectManager, (err, xinterface) => {
        if (err) {
          logger.error('Something went wrong when getting the interface.', err);
          reject(err);
        }
        xinterface.GetManagedObjects((error, modemObjects) => {
          if (error) {
            logger.error('Something went wrong when starting the modem scan!', error);
            reject(error);
          }
          resolve(modemObjects);
        });
      });
    });
  }

}


module.exports = {
  NetworkConnectManager,
};
