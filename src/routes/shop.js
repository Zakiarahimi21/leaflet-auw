// Shopkeeper API. A shopkeeper only ever sees and edits the stores an admin has assigned to them.
const express = require('express');
const db = require('../db');
const sec = require('../security');
const v = require('../validators');
const stores = require('../services/stores');

const router = express.Router();
router.use(sec.requireAuth, sec.requireRole('shopkeeper'));

async function ownedStoreNumber(req, res, identifier) {
    const storeNumber = await stores.resolveStoreNumber(identifier);
    if (!storeNumber || !(await stores.userOwnsStore(req.user.id, storeNumber))) {
        // Same answer for "does not exist" and "not yours" so store numbers cannot be probed.
        res.status(403).json({ error: 'You can only manage your own shops.' });
        return null;
    }
    return storeNumber;
}

router.get('/overview', async (req, res) => {
    const mine = await stores.listStores({ ownerId: req.user.id });
    const { rows } = await db.query(`SELECT COUNT(*)::int AS pending FROM mall.store_claims WHERE user_id = $1 AND status = 'pending'`, [req.user.id]);
    res.json({
        stats: {
            shops: mine.length,
            activeOffers: mine.reduce((sum, s) => sum + s.active_offers, 0),
            favorites: mine.reduce((sum, s) => sum + s.favorites, 0),
            pendingClaims: rows[0].pending
        },
        stores: mine
    });
});

router.get('/stores', async (req, res) => res.json({ stores: await stores.listStores({ ownerId: req.user.id }) }));

router.put('/stores/:storeNumber', async (req, res) => {
    const storeNumber = await ownedStoreNumber(req, res, req.params.storeNumber); if (!storeNumber) return;
    const { data, error } = stores.parseStoreInput(req.body || {});
    if (error) return res.status(400).json({ error });
    const store = await stores.updateStore(storeNumber, data, req.user.id);
    await sec.audit(req, 'shop.update', storeNumber, { fields: Object.keys(data) });
    res.json({ store });
});

// ---- Offers --------------------------------------------------------------
const OFFER_SELECT = `
    SELECT x.id, x.store_number AS "storeNumber", s.name AS "storeName", x.title, x.description, x.discount_text AS "discountText",
           x.starts_on AS "startsOn", x.ends_on AS "endsOn", x.is_active AS "isActive"
      FROM mall.offers x JOIN public.stores s ON s.store_number = x.store_number`;

function parseOffer(body) {
    const title = v.cleanText(body.title, 120);
    if (!title) return { error: 'Offer title is required.' };
    const dateOk = value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
    const startsOn = body.startsOn || null, endsOn = body.endsOn || null;
    if (!dateOk(startsOn) || !dateOk(endsOn)) return { error: 'Dates must look like 2026-12-31.' };
    if (startsOn && endsOn && endsOn < startsOn) return { error: 'The end date must be after the start date.' };
    return { data: { title, description: v.cleanText(body.description, 500), discountText: v.cleanText(body.discountText, 40), startsOn, endsOn, isActive: body.isActive !== false } };
}

router.get('/offers', async (req, res) => {
    const { rows } = await db.query(`${OFFER_SELECT}
        WHERE x.store_number IN (SELECT store_number FROM mall.shop_owners WHERE user_id = $1) ORDER BY x.id DESC`, [req.user.id]);
    res.json({ offers: rows });
});

router.post('/offers', async (req, res) => {
    const storeNumber = await ownedStoreNumber(req, res, req.body?.storeNumber); if (!storeNumber) return;
    const { data, error } = parseOffer(req.body || {});
    if (error) return res.status(400).json({ error });
    const { rows } = await db.query(`
        INSERT INTO mall.offers (store_number, title, description, discount_text, starts_on, ends_on, is_active, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [storeNumber, data.title, data.description, data.discountText, data.startsOn, data.endsOn, data.isActive, req.user.id]);
    await sec.audit(req, 'shop.offer.create', storeNumber, { title: data.title });
    res.status(201).json({ offer: (await db.query(`${OFFER_SELECT} WHERE x.id = $1`, [rows[0].id])).rows[0] });
});

async function ownedOffer(req, res) {
    const { rows } = await db.query('SELECT id, store_number FROM mall.offers WHERE id = $1', [parseInt(req.params.id, 10) || 0]);
    if (!rows[0] || !(await stores.userOwnsStore(req.user.id, rows[0].store_number))) {
        res.status(403).json({ error: 'You can only manage offers of your own shops.' });
        return null;
    }
    return rows[0];
}

router.put('/offers/:id', async (req, res) => {
    const offer = await ownedOffer(req, res); if (!offer) return;
    const { data, error } = parseOffer(req.body || {});
    if (error) return res.status(400).json({ error });
    await db.query(`UPDATE mall.offers SET title=$2, description=$3, discount_text=$4, starts_on=$5, ends_on=$6, is_active=$7 WHERE id=$1`,
        [offer.id, data.title, data.description, data.discountText, data.startsOn, data.endsOn, data.isActive]);
    await sec.audit(req, 'shop.offer.update', offer.store_number, { id: offer.id });
    res.json({ offer: (await db.query(`${OFFER_SELECT} WHERE x.id = $1`, [offer.id])).rows[0] });
});

router.delete('/offers/:id', async (req, res) => {
    const offer = await ownedOffer(req, res); if (!offer) return;
    await db.query('DELETE FROM mall.offers WHERE id = $1', [offer.id]);
    await sec.audit(req, 'shop.offer.delete', offer.store_number, { id: offer.id });
    res.json({ success: true });
});

// ---- Requests for additional shops --------------------------------------
router.get('/claims', async (req, res) => {
    const { rows } = await db.query(`
        SELECT c.id, c.store_number AS "storeNumber", s.name AS "storeName", c.status, c.message, c.created_at AS "createdAt"
          FROM mall.store_claims c LEFT JOIN public.stores s ON s.store_number = c.store_number
         WHERE c.user_id = $1 ORDER BY c.id DESC LIMIT 50`, [req.user.id]);
    res.json({ claims: rows });
});

router.post('/claims', async (req, res) => {
    const storeNumber = await stores.resolveStoreNumber(req.body?.storeNumber);
    if (!storeNumber) return res.status(400).json({ error: 'Choose a shop from the list.' });
    if (await stores.userOwnsStore(req.user.id, storeNumber)) return res.status(409).json({ error: 'You already manage this shop.' });
    try {
        await db.query('INSERT INTO mall.store_claims (user_id, store_number, message) VALUES ($1,$2,$3)',
            [req.user.id, storeNumber, v.cleanText(req.body?.message, 300)]);
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'You already have a pending request for this shop.' });
        throw error;
    }
    await sec.audit(req, 'shop.claim.request', storeNumber);
    res.status(201).json({ success: true });
});

module.exports = router;
