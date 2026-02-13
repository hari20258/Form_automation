const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'automation_debug.log');

class Logger {
    constructor() {
        // Clear log file on start
        try {
            fs.writeFileSync(LOG_FILE, '');
        } catch (e) {
            console.error('Failed to clear log file:', e);
        }
    }

    log(message) {
        this._write(`[LOG] ${message}`);
    }

    info(message) {
        this._write(`[INFO] ${message}`);
        // Optional: Also print to console if it's high-level info?
        // User asked "instead of terminal", so we'll keep console mostly clean.
        // But we might want some feedback. 
        // For now, I'll print 'info' to console too, but 'debug' only to file.
        console.log(message);
    }

    debug(message, data = null) {
        let entry = `[DEBUG] ${message}`;
        if (data) {
            entry += `\n${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}`;
        }
        this._write(entry);
    }

    error(message, error = null) {
        let entry = `[ERROR] ${message}`;
        if (error) {
            entry += `\n${error.stack || error}`;
        }
        this._write(entry);
        console.error(message); // Errors should definitely appear in console too
    }

    _write(text) {
        // Use local time as requested
        // toLocaleString() uses system locale and timezone by default
        const timestamp = new Date().toLocaleString();
        const line = `[${timestamp}] ${text}\n`;
        fs.appendFileSync(LOG_FILE, line);
    }
}

module.exports = new Logger();
