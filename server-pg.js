// server-pg.js - API with PostgreSQL
const express = require('express');
const cors = require('cors');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('Fatal: JWT_SECRET is missing. Set JWT_SECRET in .env before starting the server.');
    process.exit(1);
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

const app = express();
app.use(express.static(__dirname));
const PORT = 3000;

// Database connection
const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'bali_arcade',
    password: '123', // CHANGE THIS!
    port: 5432,
});

// Connect to database
client.connect()
    .then(() => console.log('✅ Connected to PostgreSQL'))
    .catch(err => console.error('❌ Database connection error:', err));

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '8mb' }));

// ============ AUTHENTICATION ============
const requireAuth = async (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const payload = jwt.verify(authorization.slice(7), JWT_SECRET);
        const result = await client.query(
            'SELECT id, username, role FROM mall.users WHERE id = $1',
            [payload.userId]
        );
        if (result.rowCount === 0) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        req.user = { id: result.rows[0].id, username: result.rows[0].username, role: result.rows[0].role };
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Not allowed' });
    }
    next();
};

const requireStoreAccess = async (req, res, next) => {
    try {
        const idParam = req.params.id;
        const bodyStoreNumber = req.body && req.body.store_number;
        const bodyId = req.body && req.body.id;
        const numericId = /^\d+$/.test(String(bodyId || idParam)) ? parseInt(String(bodyId || idParam), 10) : null;

        let result = await client.query(`
            SELECT store_number::text AS store_number FROM public.stores
            WHERE ($1::integer IS NOT NULL AND id = $1)
               OR store_number = $2 OR store_number = $3 LIMIT 1
        `, [numericId, idParam, bodyStoreNumber == null ? null : String(bodyStoreNumber)]);
        let storeNumber = result.rows[0]?.store_number;
        if (!storeNumber) {
            result = await client.query(`
                SELECT store_id::text AS store_number FROM mall.stores
                WHERE store_id = $1 OR store_id = $2 LIMIT 1
            `, [idParam, bodyStoreNumber == null ? '' : String(bodyStoreNumber)]);
            storeNumber = result.rows[0]?.store_number;
        }
        if (!storeNumber) return res.status(404).json({ error: 'Store not found' });
        if (req.user.role === 'admin') return next();

        result = await client.query(
            'SELECT 1 FROM mall.shop_owners WHERE user_id = $1 AND store_number = $2',
            [req.user.id, storeNumber]
        );
        if (result.rowCount === 0) {
            return res.status(403).json({ error: 'You can only edit your own store' });
        }
        next();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await client.query(
            'SELECT id, username, password_hash, role FROM mall.users WHERE username = $1',
            [username]
        );
        const user = result.rows[0];
        const validPassword = user && user.password_hash
            ? await bcrypt.compare(password || '', user.password_hash)
            : false;
        if (!user || !validPassword) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        const owners = user.role === 'admin' ? null : await client.query(
            'SELECT store_number FROM mall.shop_owners WHERE user_id = $1 ORDER BY store_number',
            [user.id]
        );
        const storeIds = user.role === 'admin' ? [] : owners.rows.map(row => String(row.store_number));
        const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        res.json({ token, user: { id: user.id, username: user.username, role: user.role, storeIds } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
        const profile = await client.query(
            'SELECT id, username, email, role FROM mall.users WHERE id = $1',
            [req.user.id]
        );
        if (profile.rowCount === 0) return res.status(401).json({ error: 'Invalid or expired token' });
        const owners = profile.rows[0].role === 'admin' ? null : await client.query(
            'SELECT store_number FROM mall.shop_owners WHERE user_id = $1 ORDER BY store_number',
            [req.user.id]
        );
        const storeIds = profile.rows[0].role === 'admin' ? [] : owners.rows.map(row => String(row.store_number));
        res.json({ user: { id: profile.rows[0].id, username: profile.rows[0].username, email: profile.rows[0].email, role: profile.rows[0].role, storeIds } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/auth/me', requireAuth, async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !String(username).trim()) {
        return res.status(400).json({ error: 'username is required' });
    }
    if (password && String(password).length < 8) {
        return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    try {
        await client.query('BEGIN');
        const cleanUsername = String(username).trim();
        const cleanEmail = String(email || '').trim() || null;
        if (password) {
            const passwordHash = await bcrypt.hash(String(password), 10);
            await client.query(`
                UPDATE mall.users
                SET username = $1, email = $2, password_hash = $3, updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
            `, [cleanUsername, cleanEmail, passwordHash, req.user.id]);
        } else {
            await client.query(`
                UPDATE mall.users
                SET username = $1, email = $2, updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [cleanUsername, cleanEmail, req.user.id]);
        }
        await client.query('COMMIT');

        req.user.username = cleanUsername;
        const owners = req.user.role === 'admin' ? [] : (await client.query(
            'SELECT store_number FROM mall.shop_owners WHERE user_id = $1 ORDER BY store_number',
            [req.user.id]
        )).rows.map(row => String(row.store_number));
        res.json({ user: { id: req.user.id, username: cleanUsername, email: cleanEmail, role: req.user.role, storeIds: owners } });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') return res.status(409).json({ error: 'Username or email already exists' });
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
    const { username, email, password, storeIds = [] } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
    if (String(password).length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
    if (!Array.isArray(storeIds)) return res.status(400).json({ error: 'storeIds must be an array' });
    try {
        const passwordHash = await bcrypt.hash(String(password), 10);
        await client.query('BEGIN');
        const cleanUsername = String(username).trim();
        const cleanEmail = String(email || '').trim() || `${cleanUsername}@shopkeeper.local`;
        const result = await client.query(`
            INSERT INTO mall.users (username, email, password_hash, role)
            VALUES ($1, $2, $3, 'shopkeeper') RETURNING id, username, email, role
        `, [cleanUsername, cleanEmail, passwordHash]);
        const user = result.rows[0];
        for (const storeId of new Set(storeIds.map(String))) {
            await client.query(
                'INSERT INTO mall.shop_owners (user_id, store_number) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [user.id, storeId]
            );
        }
        await client.query('COMMIT');
        res.status(201).json({
            user: { id: user.id, username: user.username, email: user.email, role: user.role, storeIds: [...new Set(storeIds.map(String))] }
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') return res.status(409).json({ error: 'Username already exists' });
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const result = await client.query(`
            SELECT u.id, u.username, u.email, u.role,
                   COALESCE(json_agg(o.store_number ORDER BY o.store_number)
                            FILTER (WHERE o.store_number IS NOT NULL), '[]') AS "storeIds"
            FROM mall.users u LEFT JOIN mall.shop_owners o ON o.user_id = u.id
            GROUP BY u.id, u.username, u.email, u.role ORDER BY u.id
        `);
        res.json({ users: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const { username, email, password, storeIds = [] } = req.body;
    if (!username || !String(username).trim()) {
        return res.status(400).json({ error: 'username is required' });
    }
    if (password && String(password).length < 8) {
        return res.status(400).json({ error: 'password must be at least 8 characters' });
    }
    if (!Array.isArray(storeIds)) {
        return res.status(400).json({ error: 'storeIds must be an array' });
    }

    try {
        const userResult = await client.query(
            'SELECT id, role FROM mall.users WHERE id = $1',
            [req.params.id]
        );
        if (userResult.rowCount === 0) return res.status(404).json({ error: 'User not found' });
        if (userResult.rows[0].role !== 'shopkeeper') {
            return res.status(400).json({ error: 'User is not a shopkeeper' });
        }

        await client.query('BEGIN');
        const cleanUsername = String(username).trim();
        const cleanEmail = String(email || '').trim() || `${cleanUsername}@shopkeeper.local`;
        if (password) {
            const passwordHash = await bcrypt.hash(String(password), 10);
            await client.query(`
                UPDATE mall.users
                SET username = $1, email = $2, password_hash = $3, updated_at = CURRENT_TIMESTAMP
                WHERE id = $4 AND role = 'shopkeeper'
            `, [cleanUsername, cleanEmail, passwordHash, req.params.id]);
        } else {
            await client.query(`
                UPDATE mall.users
                SET username = $1, email = $2, updated_at = CURRENT_TIMESTAMP
                WHERE id = $3 AND role = 'shopkeeper'
            `, [cleanUsername, cleanEmail, req.params.id]);
        }
        await client.query('DELETE FROM mall.shop_owners WHERE user_id = $1', [req.params.id]);
        for (const storeId of new Set(storeIds.map(String))) {
            await client.query(`
                INSERT INTO mall.shop_owners (user_id, store_number)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
            `, [req.params.id, storeId]);
        }
        await client.query('COMMIT');
        res.json({
            success: true,
            user: { id: Number(req.params.id), username: cleanUsername, email: cleanEmail, role: 'shopkeeper', storeIds: [...new Set(storeIds.map(String))] }
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') return res.status(409).json({ error: 'Username or email already exists' });
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/users/:id/stores', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { storeIds = [] } = req.body;
        if (!Array.isArray(storeIds)) return res.status(400).json({ error: 'storeIds must be an array' });
        const userResult = await client.query('SELECT id, role FROM mall.users WHERE id = $1', [req.params.id]);
        if (userResult.rowCount === 0) return res.status(404).json({ error: 'User not found' });
        if (userResult.rows[0].role !== 'shopkeeper') return res.status(400).json({ error: 'User is not a shopkeeper' });
        await client.query('BEGIN');
        await client.query('DELETE FROM mall.shop_owners WHERE user_id = $1', [req.params.id]);
        for (const storeId of new Set(storeIds.map(String))) {
            await client.query(
                'INSERT INTO mall.shop_owners (user_id, store_number) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [req.params.id, storeId]
            );
        }
        await client.query('COMMIT');
        res.json({ userId: Number(req.params.id), storeIds: [...new Set(storeIds.map(String))] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const userId = Number(req.params.id);
        if (userId === req.user.id) return res.status(400).json({ error: 'You cannot delete your own admin account' });
        const userResult = await client.query('SELECT id, role FROM mall.users WHERE id = $1', [userId]);
        if (userResult.rowCount === 0) return res.status(404).json({ error: 'User not found' });
        if (userResult.rows[0].role !== 'shopkeeper') {
            return res.status(400).json({ error: 'Only shopkeeper accounts can be deleted' });
        }
        await client.query('DELETE FROM mall.users WHERE id = $1', [userId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Log every incoming request so we can see what the frontend is sending
app.use((req, res, next) => {
    console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// ============ API ENDPOINTS ============

// 1. Health Check
app.get('/api/health', async (req, res) => {
    try {
        const result = await client.query('SELECT NOW()');
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: 'connected',
            time: result.rows[0].now
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// 2. Get all floors
app.get('/api/floors', async (req, res) => {
    try {
        const result = await client.query(`
            SELECT * FROM mall.floors ORDER BY floor_number
        `);
        res.json({
            floors: result.rows.map(f => f.floor_number),
            current: 'ground',
            count: result.rows.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Get specific floor data (GeoJSON for map)
app.get('/api/map/:floor', async (req, res) => {
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
            const publicResult = await client.query(`
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
                    const featResult = await client.query(`
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
            const result = await client.query(`
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

        res.status(500).json({
            error: error.message
        });
    }
});

// 4. Get all stores with filters
app.get('/api/stores', async (req, res) => {
try {
    const floorNumber = parseInt(req.query.floor);

        if (isNaN(floorNumber)) {
            return res.status(400).json({
                error: "Invalid floor number"
            });
        }

        const result = await client.query(`
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

        res.status(500).json({
            error: error.message
        });
    }
});

// 5. Get specific store by ID
app.get('/api/stores/:id', async (req, res) => {
    try {
        const result = await client.query(`
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
        res.status(500).json({ error: error.message });
    }
});

// 5.1 Update specific store in PostgreSQL (supports both PUT and POST)
const handleStoreUpdate = async (req, res) => {
    try {
        const idParam = req.params.id;
        const { name, category, image_url: imageUrl, remove_image: removeImage, id: bodyId, store_number: bodyStoreNumber } = req.body;
        const cleanCategory = category;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Store name cannot be empty" });
        }

        const cleanName = name.trim();
        const roleSafeCategory = cleanCategory ? String(cleanCategory).trim() : null;
        let rowsUpdated = 0;
        let updatedStore = null;

        // 1. Update public.stores
        try {
            const numId = /^\d+$/.test(idParam) ? parseInt(idParam) : (/^\d+$/.test(String(bodyId)) ? parseInt(bodyId) : -1);
            const storeNum = String(bodyStoreNumber || idParam);

            const query = `
                UPDATE public.stores
                SET name = $1,
                    store_type = COALESCE($2, store_type),
                    image_url = CASE WHEN $6 THEN NULL ELSE COALESCE($7, image_url) END
                WHERE id = $3
                   OR store_number = $4
                   OR store_number = $5
                RETURNING id, store_number, name, store_type;
            `;
            const params = [cleanName, roleSafeCategory, numId, storeNum, idParam, Boolean(removeImage), imageUrl ? String(imageUrl) : null];

            const result = await client.query(query, params);
            rowsUpdated += result.rowCount;
            if (result.rowCount > 0) {
                updatedStore = result.rows[0];
                console.log(`💾 [POSTGRESQL] Successfully saved store name: "${updatedStore.name}" (Store #: ${updatedStore.store_number}, ID: ${updatedStore.id})`);
            }
        } catch (dbErr) {
            console.error("public.stores update error:", dbErr.message);
        }

        // 2. Also sync mall.stores if it exists
        try {
            await client.query(`
                UPDATE mall.stores
                SET name = $1,
                    category = COALESCE($2, category),
                    image_url = CASE WHEN $5 THEN NULL ELSE COALESCE($6, image_url) END
                WHERE store_id = $3 OR store_id = $4
            `, [cleanName, roleSafeCategory, idParam, String(bodyStoreNumber || ''), Boolean(removeImage), imageUrl ? String(imageUrl) : null]);
        } catch (mallErr) {
            // Optional table
        }

        if (rowsUpdated > 0) {
            res.json({
                success: true,
                message: "Store successfully updated in PostgreSQL database",
                store: updatedStore,
                rowsUpdated
            });
        } else {
            console.warn(`⚠️ [POSTGRESQL] No store found matching ID/number '${idParam}'`);
            res.json({
                success: false,
                message: `Store '${idParam}' not found in database to update`,
                rowsUpdated: 0
            });
        }
    } catch (error) {
        console.error("Store update error:", error);
        res.status(500).json({ error: error.message });
    }
};

app.put('/api/stores/:id', requireAuth, requireStoreAccess, handleStoreUpdate);
app.post('/api/stores/:id', requireAuth, requireStoreAccess, handleStoreUpdate);

// 6. Search stores
app.get('/api/search', async (req, res) => {
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
        
        const result = await client.query(sql, params);
        res.json({
            query: q,
            total: result.rows.length,
            results: result.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 7. Get categories
app.get('/api/categories', async (req, res) => {
    try {
        const result = await client.query(`
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
        res.status(500).json({ error: error.message });
    }
});

// 8. Get statistics
app.get('/api/stats', async (req, res) => {
    try {
        const result = await client.query(`
            SELECT 
                (SELECT COUNT(*) FROM mall.floors) as total_floors,
                (SELECT COUNT(*) FROM mall.stores) as total_stores,
                (SELECT COUNT(*) FROM mall.stores WHERE status = 'active') as active_stores,
                (SELECT COUNT(*) FROM mall.stores WHERE status = 'vacant') as vacant_stores,
                (SELECT COUNT(*) FROM mall.stores WHERE status = 'under-renovation') as renovation_stores
        `);
        
        // Get stores by type
        const byType = await client.query(`
            SELECT type, COUNT(*) FROM mall.stores GROUP BY type
        `);
        
        // Get stores by floor
        const byFloor = await client.query(`
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
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Bali Arcade API Server (PostgreSQL) is RUNNING!`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`📋 Available Endpoints:`);
    console.log(`   GET  /api/health`);
    console.log(`   GET  /api/floors`);
    console.log(`   GET  /api/map/:floor       (GeoJSON)`);
    console.log(`   GET  /api/stores`);
    console.log(`   POST /api/auth/login`);
    console.log(`   GET  /api/auth/me          (auth required)`);
    console.log(`   PUT  /api/auth/me          (auth required, own profile)`);
    console.log(`   POST /api/admin/users      (admin only)`);
    console.log(`   GET  /api/admin/users      (admin only)`);
    console.log(`   PUT  /api/admin/users/:id       (admin only, edit shopkeeper)`);
    console.log(`   PUT  /api/admin/users/:id/stores (admin only)`);
    console.log(`   DELETE /api/admin/users/:id (admin only)`);
    console.log(`   PUT  /api/stores/:id       (auth required)`);
    console.log(`   POST /api/stores/:id       (auth required)`);
    console.log(`   GET  /api/search?q=keyword`);
    console.log(`   GET  /api/categories`);
    console.log(`   GET  /api/stats\n`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ PORT ${PORT} IS ALREADY IN USE!`);
        console.error(`👉 Another process is already running on port ${PORT}.`);
        console.error(`👉 In PowerShell, run: Stop-Process -Name node -Force`);
        console.error(`👉 Then start again: node server-pg.js\n`);
    } else {
        console.error(`\n❌ Server error:`, err);
    }
});