// Public map data (no login needed) + shop details, offers and the store-edit endpoint used by the map.
const express = require('express');
const db = require('../db');
const sec = require('../security');
const stores = require('../services/stores');

const router = express.Router();

const ACTIVE_OFFER = `x.is_active AND (x.starts_on IS NULL OR x.starts_on <= CURRENT_DATE) AND (x.ends_on IS NULL OR x.ends_on >= CURRENT_DATE)`;

// ============ MAP & SEARCH (original endpoints) ============
// 1. Health Check
router.get('/health', async (req, res) => {
    try {
        const result = await db.query('SELECT NOW()');
        res.json({ status: 'ok', timestamp: new Date().toISOString(), database: 'connected' });
    } catch (error) {
        res.status(500).json({ status: 'error' });
    }
});

// 2. Get all floors
router.get('/floors', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT * FROM mall.floors ORDER BY floor_number
        `);
        res.json({
            floors: result.rows.map(f => f.floor_number),
            current: 'ground',
            count: result.rows.length
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 3. Get specific floor data (GeoJSON for map)
router.get('/map/:floor', async (req, res) => {
    try {
        const floorNumber = parseInt(req.params.floor);

        if (isNaN(floorNumber)) {
            return res.status(400).json({
                error: "Invalid floor number"
            });
        }

        let geojson = null;

        // 1. Try public.stores (PostGIS geometry)
        try {
            const publicResult = await db.query(`
                SELECT
                    s.id,
                    s.store_number,
                    s.name,
                    COALESCE(s.store_type, 'retail') AS category,
                    s.image_url,
                    'shop' AS type,
                    ST_AsGeoJSON(s.geom)::json AS geometry
                FROM public.stores s
                WHERE s.geom IS NOT NULL
                ORDER BY s.id
            `);

            if (publicResult.rows.length > 0) {
                let facilities = [];
                try {
                    const featResult = await db.query(`
                        SELECT
                            id,
                            name,
                            feature_type AS type,
                            COALESCE(feature_type, 'facility') AS category,
                            ST_AsGeoJSON(geom)::json AS geometry
                        FROM public.map_features
                        WHERE geom IS NOT NULL
                        ORDER BY id
                    `);
                    facilities = featResult.rows;
                } catch (e) {
                    // map_features optional
                }

                const allFeatures = [
                    ...publicResult.rows.map(s => ({
                        type: "Feature",
                        properties: {
                            id: s.id,
                            store_id: s.store_number,
                            name: s.name,
                            type: s.type,
                                    category: s.category,
                            image_url: s.image_url,
                            status: "active",
                            floor_number: floorNumber,
                            floor_name: "Ground Floor"
                        },
                        geometry: s.geometry
                    })),
                    ...facilities.map(f => ({
                        type: "Feature",
                        properties: {
                            id: f.id,
                            name: f.name,
                            type: f.type,
                            category: f.category,
                            status: "active",
                            floor_number: floorNumber,
                            floor_name: "Ground Floor"
                        },
                        geometry: f.geometry
                    }))
                ];

                geojson = {
                    type: "FeatureCollection",
                    features: allFeatures
                };
            }
        } catch (postgisError) {
            // Fallback to mall.stores if public.stores is not available
        }

        // 2. Fallback to mall.stores
        if (!geojson) {
            const result = await db.query(`
                SELECT
                    s.id,
                    s.store_id,
                    s.name,
                    s.type,
                    s.category,
                    s.status,
                    s.image_url,
                    s.geometry_type,
                    s.coordinates,
                    f.floor_number,
                    f.floor_name
                FROM mall.stores s
                JOIN mall.floors f
                    ON s.floor_id = f.id
                WHERE f.floor_number = $1
            `, [floorNumber]);

            geojson = {
                type: "FeatureCollection",
                features: result.rows.map(store => ({
                    type: "Feature",
                    properties: {
                        id: store.id,
                        store_id: store.store_id,
                        name: store.name,
                        type: store.type,
                        category: store.category,
                        image_url: store.image_url,
                        status: store.status,
                        floor_number: store.floor_number,
                        floor_name: store.floor_name
                    },
                    geometry: {
                        type: store.geometry_type,
                        coordinates: store.coordinates
                    }
                }))
            };
        }

        res.json(geojson);

    } catch (error) {
        console.error("Map API error:", error);

        res.status(500).json({ error: 'Internal server error' });
    }
});

// 4. Get all stores with filters
router.get('/stores', async (req, res) => {
try {
    const floorNumber = parseInt(req.query.floor);

        if (isNaN(floorNumber)) {
            return res.status(400).json({
                error: "Invalid floor number"
            });
        }

        const result = await db.query(`
            SELECT
                s.id,
                s.store_id,
                s.name,
                s.type,
                s.category,
                s.status,
                s.geometry_type,
                s.coordinates,
                f.floor_number,
                f.floor_name
            FROM mall.stores s
            JOIN mall.floors f
                ON s.floor_id = f.id
            WHERE f.floor_number = $1
        `, [floorNumber]);

        const geojson = {
            type: "FeatureCollection",
            features: result.rows.map(feature => ({
                type: "Feature",
                properties: {
                    id: feature.id,
                    store_id: feature.store_id,
                    name: feature.name,
                    type: feature.type,
                    category: feature.category,
                    status: feature.status,
                    floor_number: feature.floor_number,
                    floor_name: feature.floor_name
                },
                geometry: {
                    type: feature.geometry_type,
                    coordinates: feature.coordinates
                }
            }))
        };

        res.json(geojson);

    } catch (error) {
        console.error("Map features API error:", error);

        res.status(500).json({ error: 'Internal server error' });
    }
});

// 5. Get specific store by ID
router.get('/stores/:id', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                s.*,
                f.floor_name
            FROM mall.stores s
            JOIN mall.floors f ON s.floor_id = f.id
            WHERE s.store_id = $1
        `, [req.params.id]);
        
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: `Store '${req.params.id}' not found` });
        }
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 6. Search stores
router.get('/search', async (req, res) => {
    try {
        const { q, floor } = req.query;
        
        if (!q || q.length < 2) {
            return res.status(400).json({ 
                error: 'Search query must be at least 2 characters' 
            });
        }
        
        let sql = `
            SELECT 
                s.*,
                f.floor_name
            FROM mall.stores s
            JOIN mall.floors f ON s.floor_id = f.id
            WHERE 
                s.name ILIKE $1 OR 
                s.store_id ILIKE $1 OR
                s.category ILIKE $1 OR
                s.type ILIKE $1
        `;
        const params = [`%${q}%`];
        
        if (floor) {
            sql += ` AND f.floor_number = $2`;
            params.push(parseInt(floor));
        }
        
        sql += ' ORDER BY s.name';
        
        const result = await db.query(sql, params);
        res.json({
            query: q,
            total: result.rows.length,
            results: result.rows
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 7. Get categories
router.get('/categories', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT category AS name, COUNT(*) AS store_count
            FROM mall.stores
            GROUP BY category
            ORDER BY category
        `);
        res.json({
            categories: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 8. Get statistics
router.get('/stats', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM mall.floors) as total_floors,
                (SELECT COUNT(*) FROM mall.stores) as total_stores,
                (SELECT COUNT(*) FROM mall.stores WHERE status = 'active') as active_stores,
                (SELECT COUNT(*) FROM mall.stores WHERE status = 'vacant') as vacant_stores,
                (SELECT COUNT(*) FROM mall.stores WHERE status = 'under-renovation') as renovation_stores
        `);
        
        // Get stores by type
        const byType = await db.query(`
            SELECT type, COUNT(*) FROM mall.stores GROUP BY type
        `);
        
        // Get stores by floor
        const byFloor = await db.query(`
            SELECT f.floor_name, COUNT(s.id) 
            FROM mall.floors f
            LEFT JOIN mall.stores s ON f.id = s.floor_id
            GROUP BY f.id, f.floor_name
            ORDER BY f.floor_number
        `);
        
        res.json({
            ...result.rows[0],
            by_type: byType.rows,
            by_floor: byFloor.rows
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});


// ============ PUBLIC SHOP INFORMATION ============
// Lightweight list used by the sign-up form and the map search.
router.get('/public/stores', async (req, res) => {
    const { rows } = await db.query(`SELECT store_number, name, COALESCE(store_type, 'retail') AS category FROM public.stores ORDER BY store_number`);
    res.json({ stores: rows });
});

// Details panel on the map: profile + running offers.
router.get('/public/stores/:storeNumber', async (req, res) => {
    const storeNumber = await stores.resolveStoreNumber(req.params.storeNumber);
    if (!storeNumber) return res.status(404).json({ error: 'Store not found' });
    const [store, offers] = await Promise.all([
        db.query(`SELECT s.store_number, s.name, COALESCE(s.store_type,'retail') AS category, s.image_url,
                         COALESCE(p.description,'') AS description, COALESCE(p.opening_hours,'') AS opening_hours,
                         COALESCE(p.phone,'') AS phone, COALESCE(p.email,'') AS email, COALESCE(p.website,'') AS website,
                         COALESCE(p.products, s.products, '') AS products, COALESCE(p.open_status,'open') AS open_status
                    FROM public.stores s LEFT JOIN mall.shop_profiles p ON p.store_number = s.store_number
                   WHERE s.store_number = $1`, [storeNumber]),
        db.query(`SELECT x.id, x.title, x.description, x.discount_text, x.ends_on FROM mall.offers x
                   WHERE x.store_number = $1 AND ${ACTIVE_OFFER} ORDER BY x.id DESC`, [storeNumber])
    ]);
    res.json({ store: store.rows[0], offers: offers.rows });
});

// All running offers in the mall (shown on the visitor dashboard).
router.get('/public/offers', async (req, res) => {
    const { rows } = await db.query(`
        SELECT x.id, x.store_number, s.name AS store_name, x.title, x.description, x.discount_text, x.ends_on
          FROM mall.offers x JOIN public.stores s ON s.store_number = x.store_number
         WHERE ${ACTIVE_OFFER} ORDER BY x.id DESC LIMIT 100`);
    res.json({ offers: rows });
});

// ============ STORE EDIT FROM THE MAP (admin or the owning shopkeeper) ============
async function handleStoreUpdate(req, res) {
    const storeNumber = await stores.resolveStoreNumber(req.params.id)
        ?? await stores.resolveStoreNumber(req.body?.store_number) ?? await stores.resolveStoreNumber(req.body?.id);
    if (!storeNumber) return res.status(404).json({ error: 'Store not found' });
    if (req.user.role === 'shopkeeper' && !(await stores.userOwnsStore(req.user.id, storeNumber))) {
        return res.status(403).json({ error: 'You can only edit your own store' });
    }
    const { data, error } = stores.parseStoreInput(req.body || {});
    if (error) return res.status(400).json({ error });
    const store = await stores.updateStore(storeNumber, data, req.user.id);
    await sec.audit(req, 'store.update', storeNumber, { fields: Object.keys(data), via: 'map' });
    res.json({ success: true, message: 'Store updated', store, rowsUpdated: 1 });
}
const canEditStores = [sec.requireAuth, sec.requireRole('admin', 'shopkeeper')];
router.put('/stores/:id', ...canEditStores, handleStoreUpdate);
router.post('/stores/:id', ...canEditStores, handleStoreUpdate);

module.exports = router;
