// Saved shops ("favourites") for any signed-in user, mainly visitors.
const express = require('express');
const db = require('../db');
const sec = require('../security');
const stores = require('../services/stores');

const router = express.Router();
router.use(sec.requireAuth);

router.get('/', async (req, res) => {
    const { rows } = await db.query(`
        SELECT s.store_number, s.name, COALESCE(s.store_type,'retail') AS category, s.image_url,
               COALESCE(p.open_status,'open') AS open_status, COALESCE(p.opening_hours,'') AS opening_hours,
               (SELECT COUNT(*) FROM mall.offers x WHERE x.store_number = s.store_number AND x.is_active
                   AND (x.starts_on IS NULL OR x.starts_on <= CURRENT_DATE) AND (x.ends_on IS NULL OR x.ends_on >= CURRENT_DATE))::int AS active_offers,
               f.created_at AS saved_at
          FROM mall.favorites f JOIN public.stores s ON s.store_number = f.store_number
          LEFT JOIN mall.shop_profiles p ON p.store_number = s.store_number
         WHERE f.user_id = $1 ORDER BY f.created_at DESC`, [req.user.id]);
    res.json({ favorites: rows });
});

router.put('/:storeNumber', async (req, res) => {
    const storeNumber = await stores.resolveStoreNumber(req.params.storeNumber);
    if (!storeNumber) return res.status(404).json({ error: 'Store not found' });
    await db.query('INSERT INTO mall.favorites (user_id, store_number) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, storeNumber]);
    res.json({ saved: true });
});

router.delete('/:storeNumber', async (req, res) => {
    await db.query('DELETE FROM mall.favorites WHERE user_id = $1 AND store_number = $2', [req.user.id, String(req.params.storeNumber)]);
    res.json({ saved: false });
});

module.exports = router;
