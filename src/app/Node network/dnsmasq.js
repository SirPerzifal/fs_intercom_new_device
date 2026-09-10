const { spawn } = require('child_process');
const fs = require('fs');
const { logger } = require('./logger');

class DhcpServer {
  constructor(interfaceName, gatewayIp, dhcpRange) {
    this.ps = null;
    this.configFile = `/tmp/dnsmasq-${interfaceName}.conf`;
    // lease time can be adjusted here like this:
    //    dhcp-range=${dhcpRange},12h
    // default: one hour
    this.cfg = `interface=${interfaceName}\r\naddress=/alsgateway.com/${gatewayIp}\r\ndhcp-range=${dhcpRange}\r\nbind-interfaces`;

    fs.writeFileSync(this.configFile, this.cfg);
  }

  Start() {
    return new Promise((resolve, reject) => {
      try {
        logger.debug('Starting DNSMASQ...');

        const path = '/var/lib/misc/dnsmasq.leases';

        if (fs.existsSync(path)) {
          fs.truncateSync(path);
        }

        // -h : no hosts
        // -k : keep in foreground
        // -C : conf file
        // -K : dhcp-authoritative
        // -8 : log file - give it a file path
        this.ps = spawn('dnsmasq', ['-h', '-k', '-C', this.configFile]);
        this.ps.stdout.pipe(process.stdout);
        this.ps.stderr.pipe(process.stderr);

        logger.debug('DNSMASQ started.');
        resolve();
      } catch (error) {
        logger.error('DNSMASQ did not start.', error);
        reject(error);
      }
    });
  }

  Stop() {
    return new Promise((resolve, reject) => {
      try {
        logger.debug('Stopping DNSMASQ...');

        process.kill(this.ps.pid);

        logger.debug('DNSMASQ stopped.');
        resolve();
      } catch (error) {
        logger.error('DNSMASQ did not stop.', error);
        reject(error);
      }
    });
  }
}

module.exports = {
  DhcpServer,
};
