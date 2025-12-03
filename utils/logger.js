const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Determine if running as packaged executable
const isPackaged = typeof process.pkg !== 'undefined';

// Create logs directory in the executable's directory when packaged
const logsDir = isPackaged 
    ? path.join(path.dirname(process.execPath), 'logs')
    : path.join(__dirname, '..', 'logs');

// Create logs directory if it doesn't exist
if (!fs.existsSync(logsDir)) {
    try {
        fs.mkdirSync(logsDir, { recursive: true });
    } catch (error) {
        console.warn('Could not create logs directory:', error.message);
        console.warn('Logs will only be written to console');
    }
}

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
        let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        
        // Add metadata if present
        if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta)}`;
        }
        
        // Add stack trace for errors
        if (stack) {
            log += `\n${stack}`;
        }
        
        return log;
    })
);

// Create logger instance
const transports = [];
const exceptionHandlers = [];
const rejectionHandlers = [];

// Try to add file transports if logs directory exists
const logsAvailable = fs.existsSync(logsDir);

if (logsAvailable) {
    try {
        transports.push(
            new winston.transports.File({
                filename: path.join(logsDir, 'error.log'),
                level: 'error',
                maxsize: 5242880, // 5MB
                maxFiles: 5
            }),
            new winston.transports.File({
                filename: path.join(logsDir, 'combined.log'),
                maxsize: 5242880, // 5MB
                maxFiles: 5
            })
        );
        
        exceptionHandlers.push(
            new winston.transports.File({
                filename: path.join(logsDir, 'exceptions.log')
            })
        );
        
        rejectionHandlers.push(
            new winston.transports.File({
                filename: path.join(logsDir, 'rejections.log')
            })
        );
    } catch (error) {
        console.warn('Could not initialize file logging:', error.message);
    }
}

// Always add console transport
transports.push(
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    })
);

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'talenom-gl-client' },
    transports: transports,
    exceptionHandlers: exceptionHandlers.length > 0 ? exceptionHandlers : undefined,
    rejectionHandlers: rejectionHandlers.length > 0 ? rejectionHandlers : undefined
});

// Add helper methods
logger.request = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
        
        logger.log(logLevel, 'HTTP Request', {
            method: req.method,
            url: req.originalUrl || req.url,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userAgent: req.get('User-Agent'),
            ip: req.ip || req.connection.remoteAddress
        });
    });
    
    if (next) next();
};

logger.apiCall = (method, url, status, duration, error) => {
    const logLevel = status >= 400 ? 'warn' : 'info';
    
    logger.log(logLevel, 'API Call', {
        method,
        url,
        statusCode: status,
        duration: `${duration}ms`,
        error: error ? error.message : undefined
    });
};

module.exports = logger;