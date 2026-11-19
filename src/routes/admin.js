// Administrator API. Every route requires a signed-in admin.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const sec = require('../security');
const v = require('../validators');
const stores = require('../services/stores');

const router = express.Router();
router.use(sec.requireAuth, sec.requireRole('admin'));

const USER_SELECT = `
    SELECT u.id, u.username, u.email, u.role, u.status, u.full_name AS "fullName", u.phone,
           u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt",
           (u.locked_until IS NOT NULL AND u.locked_until > NOW()) AS locked,
           COALESCE((SELECT json_agg(o.store_number ORDER BY o.store_number) FROM mall.shop_owners o WHERE o.user_id = u.id), '[]') AS "storeIds"
      FROM mall.users u`;

const generatePassword = () => {
    // 16 chars that always satisfy the password policy.
    const pick = set => set[crypto.randomInt(set.length)];
    const chars = [pick('ABCDEFGHJKLMNPQRSTUVWXYZ'), pick('abcdefghijkmnopqrstuvwxyz'), pick('23456789'), pick('!@#$%^&*?')];
    const all = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*?';
    while (chars.length < 16) chars.push(pick(all));
    return chars.sort(() => crypto.randomInt(3) - 1).join('');
};

async function setOwners(client, userId, storeIds) {
    const unique = [...new Set(storeIds.map(String))];
    if (unique.length) {
        const { rows } = await client.query('SELECT store_number FROM public.stores WHERE store_number = ANY($1::text[])', [unique]);
        if (rows.length !== unique.length) { const e = new Error('One of the store numbers does not exist.'); e.status = 400; throw e; }
    }
    await client.query('DELETE FROM mall.shop_owners WHERE user_id = $1', [userId]);
    for (const storeNumber of unique) {
        await client.query('INSERT INTO mall.shop_owners (user_id, store_number) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, storeNumber]);
    }
    return unique;
}

// ---- Overview ------------------------------------------------------------
router.get('/overview', async (req, res) => {
    const [counts, byCategory, signups, recent] = await Promise.all([
        db.query(`
            SELECT
              (SELECT COUNT(*) FROM mall.users WHERE role = 'visitor')::int    AS visitors,
              (SELECT COUNT(*) FROM mall.users WHERE role = 'shopkeeper')::int AS shopkeepers,
              (SELECT COUNT(*) FROM mall.users WHERE role = 'admin')::int      AS admins,
              (SELECT COUNT(*) FROM mall.users WHERE status = 'suspended')::int AS suspended,
              (SELECT COUNT(*) FROM public.stores)::int                         AS stores,
              (SELECT COUNT(DISTINCT store_number) FROM mall.shop_owners)::int  AS owned_stores,
              (SELECT COUNT(*) FROM mall.store_claims WHERE status = 'pending')::int AS pending_claims,
              (SELECT COUNT(*) FROM mall.offers WHERE is_active)::int           AS active_offers,
              (SELECT COUNT(*) FROM mall.favorites)::int                        AS favorites,
              (SELECT COUNT(*) FROM mall.audit_log WHERE action = 'login.failed' AND created_at > NOW() - INTERVAL '24 hours')::int AS failed_logins_24h`),
        db.query(`SELECT COALESCE(store_type, 'retail') AS category, COUNT(*)::int AS count FROM public.stores GROUP BY 1 ORDER BY 2 DESC`),
        db.query(`
            SELECT to_char(d::date, 'Mon DD') AS day, COALESCE(c.count, 0)::int AS count
              FROM generate_series(NOW()::date - 6, NOW()::date, '1 day') d
              LEFT JOIN (SELECT created_at::date AS day, COUNT(*) FROM mall.users GROUP BY 1) c ON c.day = d::date
             ORDER BY d`),
        db.query(`SELECT id, username, action, target, ip, created_at AS "createdAt" FROM mall.audit_log ORDER BY id DESC LIMIT 8`)
    ]);
    res.json({ counts: counts.rows[0], byCategory: byCategory.rows, signups: signups.rows, recentActivity: recent.rows });
});

// ---- Users ---------------------------------------------------------------
router.get('/users', async (req, res) => {
    const params = [];
    const where = [];
    if (['admin', 'shopkeeper', 'visitor'].includes(req.query.role)) { params.push(req.query.role); where.push(`u.role = $${params.length}`); }
    if (['active', 'suspended'].includes(req.query.status)) { params.push(req.query.status); where.push(`u.status = $${params.length}`); }
    if (req.query.q) { params.push(`%${String(req.query.q).slice(0, 60)}%`); where.push(`(u.username ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`); }
    const { rows } = await db.query(`${USER_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY u.id DESC LIMIT 500`, params);
    res.json({ users: rows });
});

router.post('/users', async (req, res) => {
    const body = req.body || {};
    const role = body.role;
    if (!['shopkeeper', 'visitor'].includes(role)) {
        return res.status(400).json({ error: 'Only shopkeeper or visitor accounts can be created here. Admins are created from the command line.' });
    }
    const username = v.cleanText(body.username, 30), email = v.cleanText(body.email, 100);
    const fullName = v.cleanText(body.fullName, 100), phone = v.cleanText(body.phone, 30);
    const problem = v.validateUsername(username) || v.validateEmail(email) || v.validatePhone(phone)
        || (!fullName ? 'Full name is required.' : null) || v.validatePassword(body.password, { username, email });
    if (problem) return res.status(400).json({ error: problem });
    const passwordHash = await sec.hashPassword(body.password);
    try {
        const user = await db.withTransaction(async client => {
            const { rows } = await client.query(`
                INSERT INTO mall.users (username, email, password_hash, role, full_name, phone, password_changed_at)
                VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING id`, [username, email, passwordHash, role, fullName, phone]);
            if (role === 'shopkeeper' && Array.isArray(body.storeIds)) await setOwners(client, rows[0].id, body.storeIds);
            return rows[0];
        });
        await sec.audit(req, 'admin.user.create', `${role}:${username}`);
        const { rows } = await db.query(`${USER_SELECT} WHERE u.id = $1`, [user.id]);
        res.status(201).json({ user: rows[0] });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'That username or email is already registered.' });
        throw error;
    }
});

async function loadManagedUser(req, res) {
    const { rows } = await db.query('SELECT id, username, role FROM mall.users WHERE id = $1', [parseInt(req.params.id, 10) || 0]);
    if (!rows[0]) { res.status(404).json({ error: 'User not found' }); return null; }
    if (rows[0].role === 'admin') { res.status(400).json({ error: 'Administrator accounts are managed from the command line only.' }); return null; }
    return rows[0];
}

router.put('/users/:id', async (req, res) => {
    const target = await loadManagedUser(req, res); if (!target) return;
    const body = req.body || {};
    const email = v.cleanText(body.email, 100), fullName = v.cleanText(body.fullName, 100), phone = v.cleanText(body.phone, 30);
    const problem = v.validateEmail(email) || v.validatePhone(phone) || (!fullName ? 'Full name is required.' : null)
        || (!['active', 'suspended'].includes(body.status) ? 'Invalid status.' : null);
    if (problem) return res.status(400).json({ error: problem });
    try {
        await db.withTransaction(async client => {
            // Suspending bumps token_version so existing sessions stop working immediately.
            await client.query(`
                UPDATE mall.users SET email = $2, full_name = $3, phone = $4, status = $5::varchar, updated_at = NOW(),
                       token_version = token_version + CASE WHEN $5::text = 'suspended' AND status <> 'suspended' THEN 1 ELSE 0 END,
                       failed_attempts = CASE WHEN $5::text = 'active' THEN 0 ELSE failed_attempts END,
                       locked_until = CASE WHEN $5::text = 'active' THEN NULL ELSE locked_until END
                 WHERE id = $1`, [target.id, email, fullName, phone, body.status]);
            if (target.role === 'shopkeeper' && Array.isArray(body.storeIds)) await setOwners(client, target.id, body.storeIds);
        });
        await sec.audit(req, 'admin.user.update', target.username, { status: body.status });
        const { rows } = await db.query(`${USER_SELECT} WHERE u.id = $1`, [target.id]);
        res.json({ user: rows[0] });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        if (error.code === '23505') return res.status(409).json({ error: 'That email is already in use.' });
        throw error;
    }
});

router.post('/users/:id/reset-password', async (req, res) => {
    const target = await loadManagedUser(req, res); if (!target) return;
    const temporaryPassword = generatePassword();
    await db.query(`
        UPDATE mall.users SET password_hash = $2, token_version = token_version + 1, failed_attempts = 0, locked_until = NULL,
               password_changed_at = NOW(), updated_at = NOW() WHERE id = $1`, [target.id, await sec.hashPassword(temporaryPassword)]);
    await sec.audit(req, 'admin.user.reset_password', target.username);
    // Shown once. It is never stored in readable form.
    res.json({ temporaryPassword });
});

router.delete('/users/:id', async (req, res) => {
    const target = await loadManagedUser(req, res); if (!target) return;
    await db.query('DELETE FROM mall.users WHERE id = $1', [target.id]);
    await sec.audit(req, 'admin.user.delete', target.username);
    res.json({ success: true });
});

// ---- Stores --------------------------------------------------------------
router.get('/stores', async (req, res) => {
    res.json({ stores: await stores.listStores({ search: String(req.query.q || '').slice(0, 60) }) });
});

router.put('/stores/:storeNumber', async (req, res) => {
    const storeNumber = await stores.resolveStoreNumber(req.params.storeNumber);
    if (!storeNumber) return res.status(404).json({ error: 'Store not found' });
    const { data, error } = stores.parseStoreInput(req.body || {});
    if (error) return res.status(400).json({ error });
    const updated = await stores.updateStore(storeNumber, data, req.user.id);
    await sec.audit(req, 'admin.store.update', storeNumber, { fields: Object.keys(data) });
    res.json({ store: updated });
});

// Replace the owners of one store.
router.put('/stores/:storeNumber/owners', async (req, res) => {
    const storeNumber = await stores.resolveStoreNumber(req.params.storeNumber);
    if (!storeNumber) return res.status(404).json({ error: 'Store not found' });
    const userIds = (Array.isArray(req.body?.userIds) ? req.body.userIds : []).map(Number).filter(Number.isInteger);
    try {
        await db.withTransaction(async client => {
            if (userIds.length) {
                const { rows } = await client.query(`SELECT id FROM mall.users WHERE id = ANY($1::int[]) AND role = 'shopkeeper'`, [userIds]);
                if (rows.length !== new Set(userIds).size) { const e = new Error('Only shopkeeper accounts can own a store.'); e.status = 400; throw e; }
            }
            await client.query('DELETE FROM mall.shop_owners WHERE store_number = $1', [storeNumber]);
            for (const id of new Set(userIds)) await client.query('INSERT INTO mall.shop_owners (user_id, store_number) VALUES ($1,$2)', [id, storeNumber]);
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        throw error;
    }
    await sec.audit(req, 'admin.store.owners', storeNumber, { userIds });
    res.json({ success: true });
});

// ---- Ownership claims ----------------------------------------------------
router.get('/claims', async (req, res) => {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
    const { rows } = await db.query(`
        SELECT c.id, c.store_number AS "storeNumber", s.name AS "storeName", c.message, c.status, c.created_at AS "createdAt",
               u.id AS "userId", u.username, u.email, u.full_name AS "fullName"
          FROM mall.store_claims c JOIN mall.users u ON u.id = c.user_id LEFT JOIN public.stores s ON s.store_number = c.store_number
         WHERE c.status = $1 ORDER BY c.created_at DESC LIMIT 200`, [status]);
    res.json({ claims: rows });
});

router.post('/claims/:id/:decision', async (req, res) => {
    if (!['approve', 'reject'].includes(req.params.decision)) return res.status(404).json({ error: 'Not found' });
    const approve = req.params.decision === 'approve';
    const result = await db.withTransaction(async client => {
        const { rows } = await client.query(
            `SELECT id, user_id, store_number FROM mall.store_claims WHERE id = $1 AND status = 'pending' FOR UPDATE`, [parseInt(req.params.id, 10) || 0]);
        if (!rows[0]) return null;
        await client.query(`UPDATE mall.store_claims SET status = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $1`,
            [rows[0].id, approve ? 'approved' : 'rejected', req.user.id]);
        if (approve) await client.query('INSERT INTO mall.shop_owners (user_id, store_number) VALUES ($1,$2) ON CONFLICT DO NOTHING', [rows[0].user_id, rows[0].store_number]);
        return rows[0];
    });
    if (!result) return res.status(404).json({ error: 'Pending request not found' });
    await sec.audit(req, `admin.claim.${approve ? 'approve' : 'reject'}`, result.store_number, { userId: result.user_id });
    res.json({ success: true });
});

// ---- Offers moderation ---------------------------------------------------
router.get('/offers', async (req, res) => {
    const { rows } = await db.query(`
        SELECT x.id, x.store_number AS "storeNumber", s.name AS "storeName", x.title, x.description, x.discount_text AS "discountText",
               x.starts_on AS "startsOn", x.ends_on AS "endsOn", x.is_active AS "isActive"
          FROM mall.offers x LEFT JOIN public.stores s ON s.store_number = x.store_number ORDER BY x.id DESC LIMIT 300`);
    res.json({ offers: rows });
});
router.put('/offers/:id', async (req, res) => {
    const { rowCount } = await db.query('UPDATE mall.offers SET is_active = $2 WHERE id = $1', [parseInt(req.params.id, 10) || 0, Boolean(req.body?.isActive)]);
    if (!rowCount) return res.status(404).json({ error: 'Offer not found' });
    await sec.audit(req, 'admin.offer.toggle', req.params.id, { isActive: Boolean(req.body?.isActive) });
    res.json({ success: true });
});
router.delete('/offers/:id', async (req, res) => {
    const { rowCount } = await db.query('DELETE FROM mall.offers WHERE id = $1', [parseInt(req.params.id, 10) || 0]);
    if (!rowCount) return res.status(404).json({ error: 'Offer not found' });
    await sec.audit(req, 'admin.offer.delete', req.params.id);
    res.json({ success: true });
});

// ---- Audit trail ---------------------------------------------------------
router.get('/audit', async (req, res) => {
    const params = [];
    let where = '';
    if (req.query.q) { params.push(`%${String(req.query.q).slice(0, 60)}%`); where = `WHERE action ILIKE $1 OR username ILIKE $1 OR target ILIKE $1`; }
    const { rows } = await db.query(`
        SELECT id, username, action, target, details, ip, created_at AS "createdAt" FROM mall.audit_log ${where} ORDER BY id DESC LIMIT 200`, params);
    res.json({ entries: rows });
});

module.exports = router;
