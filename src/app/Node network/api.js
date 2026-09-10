const unirest = require('unirest');
const { logger } = require('./logger');

function getUri() {
  // Hard-coding the FEATHERS_PORT for at least one release to avoid the need to manually change the port in the Balena env var settings
  // const port = process.env.NODE_ENV === undefined ? 3030 : 8085;
  const port = 8085;
  return `http://127.0.0.1:${port}/api/v1`;
}

function getUrl() {
  // Hard-coding the FEATHERS_PORT for at least one release to avoid the need to manually change the port in the Balena env var settings
  // const port = process.env.NODE_ENV === undefined ? 3030 : 8085;
  const port = 8085;
  return `http://127.0.0.1:${port}`;
}

function getUnauthHeaders() {
  return {
    'access-control-allow-origin': '*',
    accept: 'application/json',
    'content-type': 'application/json',
  };
}

let feathersToken = null;
function getAuthHeaders() {
  const headers = getUnauthHeaders();
  headers.authorization = `Bearer ${feathersToken}`;
  return headers;
}

function isFailure(response) {
  return response.error || response.statusCode < 200 || response.statusCode > 299 || !response.body;
}

function logAndReject(errMsg, response, rejectCallback, meta) {
  // eslint-disable-next-line no-param-reassign
  meta = meta || {};
  meta.response = response;
  logger.error(errMsg, meta);
  rejectCallback(Error(errMsg));
}

function authenticate(username, password) {
  return new Promise((resolve, reject) => {
    logger.debug('Authenticating to Feathers...', { username });
    unirest.post(`${getUri()}/authentication`)
      .headers(getUnauthHeaders())
      .send({
        email: username,
        password,
      })
      .end(response => {
        // Special case for logging since this response contains an accessToken (which is sensitive data)
        logger.silly('Received response.', {
          statusCode: response.statusCode,
          hasBody: response.body != null,
        });
        if (isFailure(response)) {
          logAndReject('Failed to authenticate to Feathers!', response, reject, { username, hasPassword: password != null });
        } else {
          logger.debug('Authenticated to Feathers.');
          feathersToken = response.body.accessToken;
          resolve();
        }
      });
  });
}

function getGatewayState() {
  return new Promise((resolve, reject) => {
    logger.debug('Getting default gateway states from feathers api...');
    unirest.get(`${getUri()}/gatewayStates`)
      .headers(getAuthHeaders())
      .send()
      .end(response => {
        if (isFailure(response)) {
          logAndReject('Failed to get default gateway states from feathers api.', response, reject);
        } else {
          resolve(response.body);
        }
      });
  });
}

function getFailoverSettings() {
  return new Promise((resolve, reject) => {
    logger.debug('Getting failover settings from feathers api...');
    unirest.get(`${getUri()}/settings`)
      .headers(getAuthHeaders())
      .send()
      .end(response => {
        if (isFailure(response) || !response.body.settings[0].failover) {
          logAndReject('Failed to get failover settings from feathers api.', response, reject);
        } else {
          resolve(response.body.settings[0].failover);
        }
      });
  });
}

function saveGatewayState(ssid, pass, oid) {
  return new Promise((resolve, reject) => {
    logger.debug('Getting bonded hotspot config from feathers api...');
    unirest.patch(`${getUri()}/gatewayStates?_id=${oid}`)
      .headers(getAuthHeaders())
      .send({
        gatewayState: {
          ssid,
          passKey: pass,
        },
      })
      .end(response => {
        if (isFailure(response) || !response.body.gatewayState || response.body.gatewayState.length === 0) {
          logAndReject('Failed to get bonded hotspot config from feathers api.', response, reject);
        } else {
          resolve(response.body.gatewayState[0]);
        }
      });
  });
}

module.exports = {
  getUrl,
  authenticate,
  getGatewayState,
  saveGatewayState,
  getFailoverSettings,
};
