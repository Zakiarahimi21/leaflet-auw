const bcrypt = require('bcryptjs');
const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

function readArg(name) {
    const equalsPrefix = `--${name}=`;
    const equalsArgument = process.argv.find(arg => arg.startsWith(equalsPrefix));
    if (equalsArgument) return equalsArgument.slice(equalsPrefix.length);

    const argumentIndex = process.argv.indexOf(`--${name}`);
    return argumentIndex >= 0 ? process.argv[argumentIndex + 1] : null;
}

async function seedAdmin() {
    const username = readArg('username') || process.env.ADMIN_USERNAME;
    const password = readArg('password') || process.env.ADMIN_PASSWORD;

    if (!username || !password) {
        console.error('Missing admin credentials. Set ADMIN_USERNAME and ADMIN_PASSWORD in .env or pass --username and --password.');
        process.exit(1);
    }

    const client = new Client({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'bali_arcade',
        password: process.env.DB_PASSWORD || '123',
        port: Number(process.env.DB_PORT || 5432)
    });

    try {
        await client.connect();
        const passwordHash = await bcrypt.hash(password, 10);
        await client.query(`
            INSERT INTO mall.users (username, email, password_hash, role)
            VALUES ($1, $2, $3, 'admin')
            ON CONFLICT (username) DO UPDATE SET
                password_hash = EXCLUDED.password_hash,
                role = 'admin',
                updated_at = CURRENT_TIMESTAMP
        `, [username, `${username}@admin.local`, passwordHash]);

        console.log(`Admin user "${username}" created or updated successfully.`);
    } catch (error) {
        console.error('Failed to seed admin user:', error.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

seedAdmin();
