// Sign-up, login, logout and own-account endpoints.
const express = require('express');
const db = require('../db');
const config = require('../config');
const sec = require('../security');
const v = require('../validators');

const router = express.Router();

async function storeIdsFor(userId, role) {
    if (role !== 'shopkeeper') return [];
    const { rows } = await db.query('SELECT store_number FROM mall.shop_owners WHERE user_id = $1 ORDER BY store_number', [userId]);
    return rows.map(row => String(row.store_number));
}

async function toPublicUser(row) {
    return {
        id: row.id, username: row.username, email: row.email, role: row.role,
        fullName: row.full_name || '', phone: row.phone || '',
        storeIds: await storeIdsFor(row.id, row.role)
    };
}

const HOME = { admin: '/admin.html', shopkeeper: '/shopkeeper.html', visitor: '/visitor.html' };

// ---- Sign up (visitors and shopkeepers only) ---------------------------
router.post('/signup', sec.signupLimiter, async (req, res) => {
    const body = req.body || {};
    // Administrators can never be created from the public internet.
    if (body.role === 'admin') {
        await sec.audit(req, 'signup.blocked_admin', null, { username: v.cleanText(body.username, 50) }, {});
        return res.status(403).json({ error: 'Administrator accounts cannot be created through sign-up.' });
    }
    const role = body.role;
    if (!['visitor', 'shopkeeper'].includes(role)) return res.status(400).json({ error: 'Choose visitor or shopkeeper.' });

    const username = v.cleanText(body.username, 30);
    const email = v.cleanText(body.email, 100);
    const fullName = v.cleanText(body.fullName, 100);
    const phone = v.cleanText(body.phone, 30);
    const problem = v.validateUsername(username) || v.validateEmail(email) || v.validatePhone(phone)
        || (!fullName ? 'Full name is required.' : null) || v.validatePassword(body.password, { username, email });
    if (problem) return res.status(400).json({ error: problem });

    let storeNumbers = [];
    if (role === 'shopkeeper') {
        storeNumbers = [...new Set((Array.isArray(body.storeNumbers) ? body.storeNumbers : []).map(n => String(n).trim()))].filter(Boolean);
        if (storeNumbers.length === 0) return res.status(400).json({ error: 'Select the shop you operate so an administrator can verify it.' });
        if (storeNumbers.length > 5) return res.status(400).json({ error: 'You can request at most 5 shops at sign-up.' });
        const { rows } = await db.query('SELECT store_number FROM public.stores WHERE store_number = ANY($1::text[])', [storeNumbers]);
        if (rows.length !== storeNumbers.length) return res.status(400).json({ error: 'One of the selected shops does not exist.' });
    }

    const passwordHash = await sec.hashPassword(body.password);
    try {
        const user = await db.withTransaction(async client => {
            const { rows } = await client.query(`
                INSERT INTO mall.users (username, email, password_hash, role, full_name, phone, password_changed_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                RETURNING id, username, email, role, full_name, phone, token_version`,
                [username, email, passwordHash, role, fullName, phone]);
            for (const storeNumber of storeNumbers) {
                await client.query(`INSERT INTO mall.store_claims (user_id, store_number, message) VALUES ($1, $2, $3)`,
                    [rows[0].id, storeNumber, 'Requested at sign-up']);
            }
            return rows[0];
        });
        await sec.audit(req, 'signup', `${role}:${username}`, { storeNumbers }, user);
        sec.issueSession(res, user);
        res.status(201).json({ user: await toPublicUser(user), redirect: HOME[role] });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'That username or email is already registered.' });
        throw error;
    }
});

// ---- Login (all roles) --------------------------------------------------
router.post('/login', sec.loginLimiter, async (req, res) => {
    const identifier = v.cleanText(req.body?.identifier ?? req.body?.username, 100);
    const password = req.body?.password;
    if (!identifier || typeof password !== 'string' || !password) {
        return res.status(400).json({ error: 'Enter your username or email and your password.' });
    }

    const { rows } = await db.query(`
        SELECT id, username, email, role, status, full_name, phone, password_hash, token_version, locked_until
          FROM mall.users WHERE lower(username) = lower($1) OR lower(email) = lower($1) LIMIT 1`, [identifier]);
    const user = rows[0];

    if (user?.locked_until && new Date(user.locked_until) > new Date()) {
        const minutes = Math.max(1, Math.ceil((new Date(user.locked_until) - Date.now()) / 60000));
        return res.status(429).json({ error: `Too many failed attempts. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.` });
    }

    // Always run bcrypt so response time does not reveal whether the account exists.
    const valid = await sec.comparePassword(password, user?.password_hash);
    if (!user || !valid) {
        if (user) {
            const { rows: updated } = await db.query(`
                UPDATE mall.users
                   SET failed_attempts = failed_attempts + 1,
                       locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN NOW() + ($3 || ' minutes')::interval ELSE locked_until END
                 WHERE id = $1 RETURNING failed_attempts`, [user.id, config.maxFailedLogins, String(config.lockMinutes)]);
            await sec.audit(req, 'login.failed', user.username, { attempts: updated[0].failed_attempts }, {});
        } else {
            await sec.audit(req, 'login.failed', identifier.slice(0, 60), { unknownAccount: true }, {});
        }
        return res.status(401).json({ error: 'Incorrect username/email or password.' });
    }
    if (user.status !== 'active') {
        await sec.audit(req, 'login.suspended', user.username, null, user);
        return res.status(403).json({ error: 'This account is suspended. Contact the mall administrator.' });
    }

    await db.query('UPDATE mall.users SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1', [user.id]);
    await sec.audit(req, 'login', user.username, null, user);
    sec.issueSession(res, user);
    res.json({ user: await toPublicUser(user), redirect: HOME[user.role] });
});

router.post('/logout', (req, res) => {
    sec.clearSession(res);
    res.json({ success: true });
});

// ---- Own account --------------------------------------------------------
router.get('/me', sec.requireAuth, async (req, res) => {
    res.json({ user: await toPublicUser(req.user), redirect: HOME[req.user.role] });
});

router.put('/me', sec.requireAuth, async (req, res) => {
    const email = v.cleanText(req.body?.email, 100);
    const fullName = v.cleanText(req.body?.fullName, 100);
    const phone = v.cleanText(req.body?.phone, 30);
    const problem = v.validateEmail(email) || v.validatePhone(phone) || (!fullName ? 'Full name is required.' : null);
    if (problem) return res.status(400).json({ error: problem });
    try {
        const { rows } = await db.query(`
            UPDATE mall.users SET email = $2, full_name = $3, phone = $4, updated_at = NOW() WHERE id = $1
            RETURNING id, username, email, role, full_name, phone`, [req.user.id, email, fullName, phone]);
        await sec.audit(req, 'profile.update', req.user.username);
        res.json({ user: await toPublicUser(rows[0]) });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'That email is already in use.' });
        throw error;
    }
});

router.put('/password', sec.requireAuth, sec.passwordLimiter, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const { rows } = await db.query('SELECT password_hash FROM mall.users WHERE id = $1', [req.user.id]);
    if (!(await sec.comparePassword(currentPassword, rows[0]?.password_hash))) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    const problem = v.validatePassword(newPassword, req.user);
    if (problem) return res.status(400).json({ error: problem });
    if (currentPassword === newPassword) return res.status(400).json({ error: 'Choose a password you have not used just now.' });

    // Bumping token_version signs out every other device that still holds an old session.
    const updated = await db.query(`
        UPDATE mall.users SET password_hash = $2, token_version = token_version + 1, password_changed_at = NOW(), updated_at = NOW()
         WHERE id = $1 RETURNING id, token_version`, [req.user.id, await sec.hashPassword(newPassword)]);
    sec.issueSession(res, updated.rows[0]);
    await sec.audit(req, 'password.change', req.user.username);
    res.json({ success: true });
});

module.exports = router;
module.exports.toPublicUser = toPublicUser;
