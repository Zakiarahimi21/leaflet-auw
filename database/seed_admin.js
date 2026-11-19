// Creates (or resets) the one administrator account. Admins can NOT sign up on the website.
//   node database/seed_admin.js --username admin --email you@example.com --password "Str0ng!Passw0rd"
// or set ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD in .env
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
const config = require('../src/config');
const { validatePassword, validateUsername, validateEmail } = require('../src/validators');

function readArg(name) {
    const prefix = `--${name}=`;
    const inline = process.argv.find(arg => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : null;
}

(async () => {
    const username = readArg('username') || process.env.ADMIN_USERNAME;
    const password = readArg('password') || process.env.ADMIN_PASSWORD;
    const email = readArg('email') || process.env.ADMIN_EMAIL || `${username}@admin.local`;
    if (!username || !password) {
        console.error('Missing admin credentials. Set ADMIN_USERNAME and ADMIN_PASSWORD in .env or pass --username and --password.');
        process.exit(1);
    }
    const problem = validateUsername(username) || validateEmail(email) || validatePassword(password, { username, email });
    if (problem) { console.error('Rejected:', problem); process.exit(1); }

    const client = new Client(config.db);
    try {
        await client.connect();
        const hash = await bcrypt.hash(password, config.bcryptRounds);
        await client.query(`
            INSERT INTO mall.users (username, email, password_hash, role, status, full_name, password_changed_at)
            VALUES ($1, $2, $3, 'admin', 'active', 'Administrator', NOW())
            ON CONFLICT (lower(username)) DO UPDATE SET
                password_hash = EXCLUDED.password_hash, role = 'admin', status = 'active',
                failed_attempts = 0, locked_until = NULL, token_version = mall.users.token_version + 1,
                password_changed_at = NOW(), updated_at = NOW()`, [username, email, hash]);
        console.log(`Admin "${username}" is ready. Sign in at /login.html`);
    } catch (error) {
        console.error('Failed to seed admin user:', error.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
})();
