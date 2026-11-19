// Shared store logic used by the map, the shopkeeper dashboard and the admin dashboard.
const db = require('../db');
const { cleanText, validateImage, validateUrl, validatePhone, validateEmail } = require('../validators');

const STORE_COLUMNS = `
    s.id, s.store_number, s.name, COALESCE(s.store_type, 'retail') AS category, s.image_url,
    COALESCE(p.description, '')   AS description,
    COALESCE(p.opening_hours, '') AS opening_hours,
    COALESCE(p.phone, '')         AS phone,
    COALESCE(p.email, '')         AS email,
    COALESCE(p.website, '')       AS website,
    COALESCE(p.products, s.products, '') AS products,
    COALESCE(p.open_status, 'open') AS open_status,
    p.updated_at`;

const STORE_FROM = `FROM public.stores s LEFT JOIN mall.shop_profiles p ON p.store_number = s.store_number`;

// Accepts the store number or the numeric row id (the map sends either).
async function resolveStoreNumber(identifier, client = db) {
    const text = String(identifier ?? '').trim();
    if (!text) return null;
    const numeric = /^\d+$/.test(text) ? parseInt(text, 10) : null;
    const { rows } = await client.query(
        'SELECT store_number FROM public.stores WHERE store_number = $1 OR id = $2 LIMIT 1', [text, numeric]);
    return rows[0]?.store_number ?? null;
}

async function userOwnsStore(userId, storeNumber, client = db) {
    const { rowCount } = await client.query(
        'SELECT 1 FROM mall.shop_owners WHERE user_id = $1 AND store_number = $2', [userId, storeNumber]);
    return rowCount > 0;
}

async function listStores({ search = '', ownerId = null, limit = 500 } = {}) {
    const params = [];
    const where = [];
    if (search) { params.push(`%${search}%`); where.push(`(s.name ILIKE $${params.length} OR s.store_number ILIKE $${params.length} OR s.store_type ILIKE $${params.length})`); }
    if (ownerId) { params.push(ownerId); where.push(`EXISTS (SELECT 1 FROM mall.shop_owners o WHERE o.store_number = s.store_number AND o.user_id = $${params.length})`); }
    params.push(limit);
    const { rows } = await db.query(`
        SELECT ${STORE_COLUMNS},
               COALESCE((SELECT json_agg(u.username ORDER BY u.username)
                           FROM mall.shop_owners o JOIN mall.users u ON u.id = o.user_id
                          WHERE o.store_number = s.store_number), '[]') AS owners,
               (SELECT COUNT(*) FROM mall.favorites f WHERE f.store_number = s.store_number)::int AS favorites,
               (SELECT COUNT(*) FROM mall.offers  x WHERE x.store_number = s.store_number AND x.is_active)::int AS active_offers
          ${STORE_FROM}
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY s.store_number
         LIMIT $${params.length}`, params);
    return rows;
}

// Validates and normalises the editable fields. `data` only contains the fields that were sent.
function parseStoreInput(body) {
    const data = {};
    if (body.name !== undefined) {
        data.name = cleanText(body.name, 120);
        if (!data.name) return { error: 'Store name cannot be empty' };
    }
    if (body.category !== undefined) data.category = cleanText(body.category, 100);
    if (body.description !== undefined) data.description = cleanText(body.description, 1500);
    if (body.opening_hours !== undefined) data.opening_hours = cleanText(body.opening_hours, 200);
    if (body.products !== undefined) data.products = cleanText(body.products, 600);
    if (body.phone !== undefined) {
        data.phone = cleanText(body.phone, 30);
        const problem = validatePhone(data.phone); if (problem) return { error: problem };
    }
    if (body.email !== undefined) {
        data.email = cleanText(body.email, 100);
        if (data.email) { const problem = validateEmail(data.email); if (problem) return { error: problem }; }
    }
    if (body.website !== undefined) {
        data.website = cleanText(body.website, 255);
        const problem = validateUrl(data.website); if (problem) return { error: problem };
    }
    if (body.open_status !== undefined) {
        if (!['open', 'closed', 'renovation'].includes(body.open_status)) return { error: 'Invalid shop status' };
        data.open_status = body.open_status;
    }
    if (body.remove_image === true) data.remove_image = true;
    if (body.image_url) {
        const problem = validateImage(body.image_url);
        if (problem) return { error: problem };
        data.image_url = String(body.image_url);
    }
    return { data };
}

async function updateStore(storeNumber, data, userId) {
    return db.withTransaction(async client => {
        if (data.name !== undefined || data.category !== undefined || data.image_url !== undefined || data.remove_image) {
            await client.query(`
                UPDATE public.stores
                   SET name       = COALESCE($2, name),
                       store_type = COALESCE($3, store_type),
                       image_url  = CASE WHEN $4 THEN NULL ELSE COALESCE($5, image_url) END
                 WHERE store_number = $1`,
                [storeNumber, data.name ?? null, data.category ?? null, Boolean(data.remove_image), data.image_url ?? null]);
            // The older mall.stores copy is kept in sync when it exists.
            await client.query(`
                UPDATE mall.stores
                   SET name = COALESCE($2, name), category = COALESCE($3, category),
                       image_url = CASE WHEN $4 THEN NULL ELSE COALESCE($5, image_url) END
                 WHERE store_id = $1`,
                [storeNumber, data.name ?? null, data.category ?? null, Boolean(data.remove_image), data.image_url ?? null]);
        }
        const profileFields = ['description', 'opening_hours', 'phone', 'email', 'website', 'products', 'open_status'];
        if (profileFields.some(field => data[field] !== undefined)) {
            await client.query(`
                INSERT INTO mall.shop_profiles (store_number, description, opening_hours, phone, email, website, products, open_status, updated_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'open'), $9)
                ON CONFLICT (store_number) DO UPDATE SET
                    description   = CASE WHEN $10 THEN EXCLUDED.description   ELSE mall.shop_profiles.description END,
                    opening_hours = CASE WHEN $11 THEN EXCLUDED.opening_hours ELSE mall.shop_profiles.opening_hours END,
                    phone         = CASE WHEN $12 THEN EXCLUDED.phone         ELSE mall.shop_profiles.phone END,
                    email         = CASE WHEN $13 THEN EXCLUDED.email         ELSE mall.shop_profiles.email END,
                    website       = CASE WHEN $14 THEN EXCLUDED.website       ELSE mall.shop_profiles.website END,
                    products      = CASE WHEN $15 THEN EXCLUDED.products      ELSE mall.shop_profiles.products END,
                    open_status   = COALESCE($8, mall.shop_profiles.open_status),
                    updated_by    = $9, updated_at = NOW()`,
                [storeNumber, data.description ?? null, data.opening_hours ?? null, data.phone ?? null, data.email ?? null,
                 data.website ?? null, data.products ?? null, data.open_status ?? null, userId,
                 data.description !== undefined, data.opening_hours !== undefined, data.phone !== undefined,
                 data.email !== undefined, data.website !== undefined, data.products !== undefined]);
        }
        const { rows } = await client.query(`SELECT ${STORE_COLUMNS} ${STORE_FROM} WHERE s.store_number = $1`, [storeNumber]);
        return rows[0];
    });
}

module.exports = { resolveStoreNumber, userOwnsStore, listStores, parseStoreInput, updateStore };
