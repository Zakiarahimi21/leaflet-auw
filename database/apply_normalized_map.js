const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const jsonFilePath = path.join(__dirname, 'ground_floor.json');
const snapDistance = 6;

console.log("==================================================");
console.log("       APPLYING NORMALIZED MAP GEOMETRIES         ");
console.log("==================================================");

// --------------------------------------------------
// 1. NORMALIZE & STRAIGHTEN GEOJSON IN MEMORY
// --------------------------------------------------

const data = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

const points = data.features.flatMap(feature => {
    if (!feature.geometry || !feature.geometry.coordinates) return [];
    const coordinates = feature.geometry.coordinates.flat(Infinity);
    const result = [];
    for (let index = 0; index < coordinates.length; index += 2) {
        result.push([coordinates[index], coordinates[index + 1]]);
    }
    return result;
});

function buildLines(axis) {
    const values = points.map(point => point[axis]).sort((a, b) => a - b);
    const lines = [];
    for (const value of values) {
        const line = lines[lines.length - 1];
        if (!line || value - line[line.length - 1] > snapDistance) {
            lines.push([value]);
        } else {
            line.push(value);
        }
    }
    return lines.map(line => line.reduce((sum, value) => sum + value, 0) / line.length);
}

const lines = [buildLines(0), buildLines(1)];

function snap(value, axis) {
    let closest = value;
    let distance = snapDistance;
    for (const line of lines[axis]) {
        const difference = Math.abs(value - line);
        if (difference < distance) {
            closest = line;
            distance = difference;
        }
    }
    return Number(closest.toFixed(3));
}

function normalizeCoordinates(coordinates) {
    if (typeof coordinates[0] === 'number') {
        return [snap(coordinates[0], 0), snap(coordinates[1], 1)];
    }
    return coordinates.map(normalizeCoordinates);
}

function straightenRing(ring) {
    for (let index = 0; index < ring.length - 1; index += 1) {
        const start = ring[index];
        const end = ring[index + 1];
        const width = Math.abs(end[0] - start[0]);
        const height = Math.abs(end[1] - start[1]);
        if (height <= width * 0.18) {
            end[1] = start[1];
        } else if (width <= height * 0.18) {
            end[0] = start[0];
        }
    }
    ring[ring.length - 1] = [...ring[0]];
}

for (const feature of data.features) {
    if (!feature.geometry || !feature.geometry.coordinates) continue;
    feature.geometry.coordinates = normalizeCoordinates(feature.geometry.coordinates);
    if (feature.geometry.type === 'Polygon') {
        const ring = feature.geometry.coordinates[0];
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
        straightenRing(ring);
    }
}

// Save normalized JSON file
fs.writeFileSync(jsonFilePath, `${JSON.stringify(data, null, 2)}\n`);
console.log("✅ Geometry normalized and straightened in ground_floor.json");

// --------------------------------------------------
// 2. CONNECT TO DATABASE & UPDATE GEOMETRIES
// --------------------------------------------------

const client = new Client({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'bali_arcade',
    password: process.env.DB_PASSWORD || '123',
    port: process.env.DB_PORT || 5432,
});

async function updateDatabase() {
    try {
        await client.connect();
        console.log("✅ Connected to PostgreSQL database");

        // 2.1 Remove duplicate store rows (keep only IDs 1-31)
        const dupResult = await client.query(`
            DELETE FROM public.stores
            WHERE id >= 32;
        `);
        if (dupResult.rowCount > 0) {
            console.log(`🧹 Removed ${dupResult.rowCount} duplicate store rows (cleaned IDs 32+)`);
        }

        let storesUpdated = 0;
        let facilitiesUpdated = 0;

        for (const feature of data.features) {
            const props = feature.properties || {};
            const geom = feature.geometry;
            if (!geom) continue;

            const name = props.name;
            const type = props.type || 'shop';
            const geomJson = JSON.stringify(geom);

            if (type === 'shop') {
                // Update public.stores using PostGIS ST_GeomFromGeoJSON
                // Keeps custom store names (like "hannah store") intact!
                const res = await client.query(`
                    UPDATE public.stores
                    SET geom = ST_SetSRID(ST_GeomFromGeoJSON($1), 0)
                    WHERE store_number = $2;
                `, [geomJson, name]);

                if (res.rowCount > 0) {
                    storesUpdated += res.rowCount;
                }

                // Also update mall.stores coordinates
                try {
                    await client.query(`
                        UPDATE mall.stores
                        SET coordinates = $1::jsonb,
                            geometry_type = $2
                        WHERE store_id = $3 OR name = $3;
                    `, [JSON.stringify(geom.coordinates), geom.type, name]);
                } catch (e) {
                    // optional
                }
            } else {
                // Facilities: update public.map_features
                try {
                    const res = await client.query(`
                        UPDATE public.map_features
                        SET geom = ST_SetSRID(ST_GeomFromGeoJSON($1), 0)
                        WHERE name = $2;
                    `, [geomJson, name]);
                    if (res.rowCount > 0) {
                        facilitiesUpdated += res.rowCount;
                    }
                } catch (e) {
                    // optional
                }
            }
        }

        console.log("==================================================");
        console.log(`🏪 Stores updated with straight normalized lines : ${storesUpdated}`);
        console.log(`🗺️ Facilities updated                             : ${facilitiesUpdated}`);
        console.log("==================================================");
        console.log("✨ All 2-line duplicates removed! The map will now show only single, clean normalized outlines.");
        console.log("==================================================");

    } catch (err) {
        console.error("❌ Database update error:", err.message);
    } finally {
        await client.end();
        console.log("✅ Database connection closed.");
    }
}

updateDatabase();

