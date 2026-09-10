/* eslint-disable no-console */
const winston = require('winston');
require('winston-daily-rotate-file');

// TODO: Resolve issue with logging Error objects correctly.
function replaceBuffers(name, value) {
  if (value == null) {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('hex');
  }

  if (value instanceof Object && value.type === 'Buffer') {
    return Buffer.from(value.data).toString('hex');
  }

  return value;
}

const consoleFormat = winston.format.printf(info => {
  const { level, message, timestamp, ...meta } = info;

  let data;
  const symbols = Object.getOwnPropertySymbols(meta);
  if (symbols.length > 2) {
    const y = meta[symbols[1]];
    if (y[0] instanceof Buffer) {
      // The step below is needed in case buffers are passed directly to the logger as the meta object itself, not wrapped inside an object.
      data = Buffer.from(y[0]).toString('hex');
    } else {
      data = JSON.stringify(y[0], replaceBuffers, 2);
    }
  }

  // The step below is needed in case buffers are passed directly to the logger as the message.
  const msg = replaceBuffers(null, message);

  return `[network-config] ${timestamp} - ${level.toUpperCase()} - ${msg} ${data ? ` - ${data}` : ''}`;
});

const consoleTransport = new winston.transports.Console({
  level: process.env.LOG_CONSOLE_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'hh:mm:ss A' }),
    winston.format.simple(),
    consoleFormat,
  ),
  prettyPrint: true,
  colorize: true,
});

const logger = winston.createLogger({
  transports: [
    consoleTransport,
  ],
});

const enableFileLogging = process.env.LOG_FILE_ENABLE === 'true';
if (enableFileLogging) {
  console.log('File logging is enabled.');
  const fileTransportOptions = {
    // Standard options
    level: process.env.LOG_FILE_LEVEL || 'warn',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),

    // Daily-rotate-file transport specific options
    datePattern: 'YYYY-MM-DD',
    filename: 'network-config_%DATE%.log',
    dirname: '/data/logs/network-config',
    zippedArchive: false,
    maxSize: '20m',
    maxFiles: '7d',
  };

  const rotateFileTransport = new winston.transports.DailyRotateFile(fileTransportOptions);
  rotateFileTransport.on('rotate', (oldFilename, newFilename) => {
    // logging this event just for fun!
    console.log(`Rotating Log file!  Old filename: ${oldFilename}. New filename: ${newFilename}.`);
  });

  console.log('Adding Daily Rotate File transport to logging.');
  logger.add(rotateFileTransport);
}

module.exports = {
  logger,
};
