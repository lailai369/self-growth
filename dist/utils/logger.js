const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = process.env.YUNLAILAI_LOG_LEVEL || 'info';
function log(level, message, meta) {
    if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel])
        return;
    const timestamp = new Date().toISOString();
    const prefix = `[yunlailai] ${timestamp} [${level.toUpperCase()}]`;
    if (level === 'error') {
        console.error(prefix, message, meta || '');
    }
    else if (level === 'warn') {
        console.warn(prefix, message, meta || '');
    }
    else {
        console.log(prefix, message, meta || '');
    }
}
export const logger = {
    debug: (msg, meta) => log('debug', msg, meta),
    info: (msg, meta) => log('info', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
};
//# sourceMappingURL=logger.js.map