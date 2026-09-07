import json
import psycopg2
from shapely.geometry import shape


# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

JSON_FILE = r"C:\github-repo\leaflet-auw\database\ground_floor.json"

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "bali_arcade",
    "user": "postgres",
    "password": "123"
}


# --------------------------------------------------
# CONNECT TO POSTGRESQL
# --------------------------------------------------

conn = psycopg2.connect(**DB_CONFIG)
cursor = conn.cursor()

print("✅ Connected to PostgreSQL")


# --------------------------------------------------
# LOAD GEOJSON
# --------------------------------------------------

with open(JSON_FILE, "r", encoding="utf-8") as file:
    data = json.load(file)

features = data["features"]

print(f"📍 Found {len(features)} features")


# --------------------------------------------------
# GET GROUND FLOOR ID
# --------------------------------------------------

cursor.execute("""
    SELECT id
    FROM floors
    WHERE floor_number = 1;
""")

floor_result = cursor.fetchone()

if floor_result is None:
    raise Exception("Ground floor was not found in the floors table.")

floor_id = floor_result[0]


# --------------------------------------------------
# IMPORT FEATURES
# --------------------------------------------------

stores_added = 0
features_added = 0

for feature in features:

    properties = feature.get("properties", {})
    geometry = feature.get("geometry")

    if geometry is None:
        print("⚠️ Skipping feature without geometry")
        continue

    feature_id = feature.get("id")

    name = properties.get("name")
    feature_type = properties.get("type")
    category = properties.get("category")
    status = properties.get("status")

    # Convert GeoJSON geometry to WKT
    shapely_geometry = shape(geometry)
    wkt = shapely_geometry.wkt

    # ----------------------------------------------
    # SHOPS
    # ----------------------------------------------

    if feature_type == "shop":

        store_number = name

        cursor.execute("""
            INSERT INTO stores (
                store_number,
                name,
                floor_id,
                store_type,
                is_stall,
                geom
            )
            VALUES (
                %s,
                %s,
                %s,
                %s,
                %s,
                ST_SetSRID(
                    ST_GeomFromText(%s),
                    0
                )
            );
        """, (
            store_number,
            name,
            floor_id,
            category,
            False,
            wkt
        ))

        stores_added += 1

    # ----------------------------------------------
    # OTHER MAP FEATURES
    # ----------------------------------------------

    else:

        cursor.execute("""
            INSERT INTO map_features (
                floor_id,
                name,
                feature_type,
                description,
                geom
            )
            VALUES (
                %s,
                %s,
                %s,
                %s,
                ST_SetSRID(
                    ST_GeomFromText(%s),
                    0
                )
            );
        """, (
            floor_id,
            name,
            feature_type,
            status,
            wkt
        ))

        features_added += 1


# --------------------------------------------------
# SAVE
# --------------------------------------------------

conn.commit()

print()
print("====================================")
print("        IMPORT COMPLETE")
print("====================================")
print(f"🏪 Stores added: {stores_added}")
print(f"🗺️ Map features added: {features_added}")
print(f"📍 Total features: {len(features)}")
print("====================================")


# --------------------------------------------------
# CLOSE DATABASE
# --------------------------------------------------

cursor.close()
conn.close()

print("✅ Database connection closed")