import json
import psycopg2
from shapely.geometry import shape

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

JSON_FILE = r"C:\github-repo\leaflet-auw\database\ground_floor.json"

DB_CONFIG = {
    "host": "localhost",
    "port": "5432",
    "database": "bali_arcade",
    "user": "postgres",
    "password": "123"
}

# --------------------------------------------------
# CONNECT TO POSTGRESQL
# --------------------------------------------------

conn = psycopg2.connect(**DB_CONFIG)
cursor = conn.cursor()

print(" Connected to PostgreSQL")

# --------------------------------------------------
# LOAD GEOJSON
# --------------------------------------------------

with open(JSON_FILE, "r", encoding="utf-8") as file:
    data = json.load(file)

features = data.get("features", [])
print(f" Found {len(features)} total features in JSON")

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
    raise Exception("Ground floor (floor_number = 1) was not found in the floors table.")

floor_id = floor_result[0]

# --------------------------------------------------
# UPDATE STORE GEOMETRIES (IDs 1-31)
# --------------------------------------------------

updated_count = 0
not_found = []

for feature in features:
    properties = feature.get("properties", {})
    geometry = feature.get("geometry")

    if feature.get("properties", {}).get("type") != "shop" or not geometry:
        continue

    shop_name = properties.get("name")
    shapely_geom = shape(geometry)
    wkt = shapely_geom.wkt

    # Find the store record in IDs 1..31
    cursor.execute("""
        SELECT id, store_number, name
        FROM public.stores
        WHERE floor_id = %s
          AND store_number = %s
          AND id <= 31;
    """, (floor_id, shop_name))

    match = cursor.fetchone()

    if match:
        store_id, store_num, store_name = match
        cursor.execute("""
            UPDATE public.stores
            SET geom = ST_SetSRID(ST_GeomFromText(%s), 0)
            WHERE id = %s;
        """, (wkt, store_id))
        print(f" Updated ID {store_id:2d}: [{store_num}] {store_name}")
        updated_count += 1
    else:
        not_found.append(shop_name)

conn.commit()

print("\n" + "=" * 45)
print(" GEOMETRY UPDATE COMPLETE")
print("=" * 45)
print(f" Stores updated: {updated_count}/31")
if not_found:
    print(f" Not matched: {not_found}")
print("=" * 45)

cursor.close()
conn.close()
print(" Database connection closed.")

