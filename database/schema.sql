-- Run this file once with:
-- psql -h localhost -U postgres -d bali_arcade -f database/schema.sql

-- Put the mall tables in their own namespace.
CREATE SCHEMA IF NOT EXISTS mall;

-- Each store belongs to one floor.
CREATE TABLE IF NOT EXISTS mall.floors (
    id SERIAL PRIMARY KEY,
    floor_number INTEGER NOT NULL UNIQUE,
    floor_name TEXT NOT NULL
);

-- Store locations are saved as the JSON coordinate arrays from ground_floor.json.
CREATE TABLE IF NOT EXISTS mall.stores (
    id SERIAL PRIMARY KEY,
    store_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'shop',
    floor_id INTEGER NOT NULL REFERENCES mall.floors(id),
    category TEXT NOT NULL DEFAULT 'retail',
    status TEXT NOT NULL DEFAULT 'active',
    geometry_type TEXT NOT NULL DEFAULT 'Polygon',
    coordinates JSONB NOT NULL
);

-- Add this column when upgrading a database made with an older schema.
ALTER TABLE mall.stores
ADD COLUMN IF NOT EXISTS geometry_type TEXT NOT NULL DEFAULT 'Polygon';

-- The importer looks for floor number 0.
INSERT INTO mall.floors (floor_number, floor_name)
VALUES (0, 'Ground Floor')
ON CONFLICT (floor_number) DO NOTHING;