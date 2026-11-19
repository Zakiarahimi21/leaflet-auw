const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({ ...config.db, max: 10, idleTimeoutMillis: 30000 });
pool.on('error', error => console.error('Unexpected database error:', error.message));

// Runs several statements atomically.
async function withTransaction(work) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { pool, query: (text, params) => pool.query(text, params), withTransaction };
