const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'bali_arcade',
    password: '123', // use your actual DB password
    port: 5432,
});

async function importData() {
    try {
        await client.connect();
        console.log('✅ Connected to database');

        const dataPath = path.join(__dirname, 'database', 'ground_floor.json');
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

        for (const feature of data.features) {
            const props = feature.properties;

            const query = `
                INSERT INTO mall.stores
                    (store_id, name, type, floor_id, category, status, geometry_type, coordinates)
                VALUES
                    ($1, $2, $3, (SELECT id FROM mall.floors WHERE floor_number = 0), $4, $5, $6, $7)
                ON CONFLICT (store_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    type = EXCLUDED.type,
                    floor_id = EXCLUDED.floor_id,
                    category = EXCLUDED.category,
                    status = EXCLUDED.status,
                    geometry_type = EXCLUDED.geometry_type,
                    coordinates = EXCLUDED.coordinates
                RETURNING id
            `;

            const values = [
                props.id,
                props.name,
                props.type || 'shop',
                props.category || 'retail',
                props.status || 'active',
                feature.geometry.type,
                JSON.stringify(feature.geometry.coordinates),
            ];

            await client.query(query, values);
            console.log(`✅ Imported: ${props.name}`);
        }

        console.log('✅ All data imported successfully!');
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await client.end();
    }
}

importData();