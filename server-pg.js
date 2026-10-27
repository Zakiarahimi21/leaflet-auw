// server-pg.js - API with PostgreSQL
const express = require('express');
const cors = require('cors');
const { Client } = require('pg');
require('dotenv').config();

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
app.use(express.json());

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
        const { name, category, id: bodyId, store_number: bodyStoreNumber } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Store name cannot be empty" });
        }

        const cleanName = name.trim();
        const cleanCategory = category ? category.trim() : null;
        let rowsUpdated = 0;
        let updatedStore = null;

        // 1. Update public.stores
        try {
            const numId = /^\d+$/.test(idParam) ? parseInt(idParam) : (/^\d+$/.test(String(bodyId)) ? parseInt(bodyId) : -1);
            const storeNum = String(bodyStoreNumber || idParam);

            const query = `
                UPDATE public.stores
                SET name = $1,
                    store_type = COALESCE($2, store_type)
                WHERE id = $3
                   OR store_number = $4
                   OR store_number = $5
                RETURNING id, store_number, name, store_type;
            `;
            const params = [cleanName, cleanCategory, numId, storeNum, idParam];

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
                SET name = $1, category = COALESCE($2, category)
                WHERE store_id = $3 OR store_id = $4
            `, [cleanName, cleanCategory, idParam, String(bodyStoreNumber || '')]);
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

app.put('/api/stores/:id', handleStoreUpdate);
app.post('/api/stores/:id', handleStoreUpdate);

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
    console.log(`   PUT  /api/stores/:id       (Save to PostgreSQL)`);
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