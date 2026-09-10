const http = require('http');
const express = require('express');
const createGracefulShutdownMiddleware = require('express-graceful-shutdown');
const bodyParser = require('body-parser');
const { logger } = require('./logger');

class NetworkConnectServer {
  constructor(nm) {
    this.manager = nm;

    this.app = express();
    this.server = http.createServer(this.app);

    this.app.use(bodyParser.urlencoded({ extended: false }));
    this.app.use(bodyParser.json());
    this.app.use(express.static(`${__dirname}/www`));
    this.app.use(createGracefulShutdownMiddleware(this.server, { forceTimeout: 30000 }));

    this.serverPort = 8090;

    this.app.get('/', (req, res) => {
      res.sendFile('index.html');
    });

    this.app.get('/loadData', (req, res) => {
      // get all available interfaces and connections.
      let allDevices;
      let allConnections;

      this.manager.GetAllInterfaces()
        .then(devices => {
          allDevices = devices;
          return this.manager.GetAllConnections();
        })
        .then(connections => {
          allConnections = connections;
          return this.manager.GetAllActiveConnections();
        })
        .then(activeCons => {
          res.send({ allDevices, allConnections, activeConnections: activeCons });
        })
        .catch(err => {
          logger.error('An unexpected error occurred while getting interfaces and connections.', err);
          res.status(500);
        });
    });

    this.app.post('/scan', (req, res) => {
      if (req.body) {
        this.manager.RequestSsidScan(req.body.path)
          .then(() => {
            return this.manager.GetAllAccessPoints(req.body.path);
          })
          .then(results => {
            res.send(results);
          })
          .catch(error => {
            logger.error('An unexpected error occurred while requesting SSID scan.', error);
            res.status(500);
          });
      }
    });

    this.app.post('/deleteConnection', (req, res) => {
      if (req.body) {
        this.manager.DeleteConnection(req.body.path)
          .then(successMsg => {
            res.send(successMsg);
          })
          .catch(err => {
            logger.error('An unexpected error occurred while deleting the connection.', err);
            res.status(500);
          });
      }
    });

    this.app.post('/activateConnection', (req, res) => {
      if (req.body) {
        this.manager.ActivateConnection(req.body.connectionPath, req.body.devicePath)
          .then(state => {
            res.send(state);
          })
          .catch(err => {
            logger.error('An unexpected error occurred while activating the connection.', err);
            res.status(500);
          });
      }
    });

    this.app.post('/saveNewConnection', (req, res) => {
      // insert huge input validation block here, or not

      if (req.body.connectivityType <= 4) {
        this.manager.CreateNewWiredConnection(req.body)
          .then(conObject => {
            res.send({ connection: conObject });
          })
          .catch(err => {
            logger.error('An unexpected error occurred while creating new wired connection.', err);
            res.status(500);
          });
      } else {
        this.manager.CreateNewWirelessConnection(req.body)
          .then(conObject => {
            if (conObject) {
              res.send({ connection: conObject });
            }
          })
          .catch(err => {
            logger.error('An unexpected error occurred while creating new wireless connection.', err);
            res.status(500);
          });
      }
    });

    this.app.post('/exit', (req, res) => {
      res.send(true);
      // exit the hotspot server
      setTimeout(() => {
        logger.debug('Network config server has exited.');
        this.server.close();
      }, 2000);

    });
  }

  Start() {
    // start server
    return new Promise((resolve, reject) => {
      this.server.listen(this.serverPort, () => {
        logger.debug(`Network Connect server running on port ${this.serverPort}`);
        resolve();
      });
    });
  }

  Stop() {
    return new Promise((resolve, reject) => {
      this.server.close();
      resolve();
    });
  }
}

module.exports = {
  NetworkConnectServer,
};
