import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logFile = path.join(__dirname, 'direct_log.txt');

// Hook console.log
const originalLog = console.log;
const originalError = console.error;

console.log = function (...args) {
    const message = args.map(arg => String(arg)).join(' ');
    fs.appendFileSync(logFile, message + '\n');
    originalLog.apply(console, args);
};

console.error = function (...args) {
    const message = args.map(arg => String(arg)).join(' ');
    fs.appendFileSync(logFile, 'ERROR: ' + message + '\n');
    originalError.apply(console, args);
};

function log(message) {
    console.log(message);
}

async function run() {
    try {
        log('Importing bulk-update.js...');
        const { processUpdateCsvFile } = await import('./bulk-update.js');
        log('Import successful.');

        const csvPath = path.join(__dirname, 'posts.csv');
        log(`Running bulk update with: ${csvPath}`);
        await processUpdateCsvFile(csvPath);
        log('Bulk update completed.');
    } catch (error) {
        log(`Error running bulk update: ${error.message}`);
    }
}

run();
