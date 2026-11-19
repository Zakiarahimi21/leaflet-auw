// Applies database/auth.sql using the app's own DB settings (no psql needed).
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('../src/config');

(async () => {
    const client = new Client(config.db);
    try {
        await client.connect();
        await client.query(fs.readFileSync(path.join(__dirname, 'auth.sql'), 'utf8'));
        console.log('Migration applied: roles, dashboards and audit tables are ready.');
    } catch (error) {
        console.error('Migration failed:', error.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
})();
