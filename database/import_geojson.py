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

print(" Connected to PostgreSQL")

# --------------------------------------------------
# LOAD GEOJSON
# --------------------------------------------------

with open(JSON_FILE, "r", encoding="utf-8") as file:
    data = json.load(file)

features = data["features"]
print(f" Found {len(features)} total features in ground_floor.json")

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
    # Try floor_number = 0 fallback
    cursor.execute("SELECT id FROM floors WHERE floor_number = 0;")
    floor_result = cursor.fetchone()
    if floor_result is None:
        raise Exception("Ground floor was not found in the floors table.")

floor_id = floor_result[0]
print(f" Using floor_id: {floor_id}")

# --------------------------------------------------
# IMPORT / SYNC FEATURES WITHOUT DUPLICATES
# --------------------------------------------------

stores_updated = 0
stores_added = 0
duplicates_removed = 0
features_updated = 0
features_added = 0

for feature in features:
    properties = feature.get("properties", {})
    geometry = feature.get("geometry")

    if geometry is None:
        print(f" Skipping feature without geometry: {properties.get('name')}")
        continue

    name = properties.get("name")
    feature_type = properties.get("type", "shop")
    category = properties.get("category", "retail")
    status = properties.get("status", "active")

    # Convert GeoJSON geometry to WKT
    shapely_geom = shape(geometry)
    wkt = shapely_geom.wkt

    # ----------------------------------------------
    # SHOPS -> public.stores
    # ----------------------------------------------
    if feature_type == "shop":
        store_number = name

        # Find existing store(s) with this store_number
        cursor.execute("""
            SELECT id, name
            FROM public.stores
            WHERE floor_id = %s AND store_number = %s
            ORDER BY id ASC;
        """, (floor_id, store_number))
        existing_rows = cursor.fetchall()

        if existing_rows:
            # Keep the primary row (earliest id, preserves custom names like "Hannah fashion")
            primary_id, primary_name = existing_rows[0]

            cursor.execute("""
                UPDATE public.stores
                SET geom = ST_SetSRID(ST_GeomFromText(%s), 0),
                    store_type = COALESCE(store_type, %s)
                WHERE id = %s;
            """, (wkt, category, primary_id))
            stores_updated += 1

            # Delete any duplicate rows if they exist
            if len(existing_rows) > 1:
                duplicate_ids = [row[0] for row in existing_rows[1:]]
                cursor.execute("""
                    DELETE FROM public.stores
                    WHERE id = ANY(%s);
                """, (duplicate_ids,))
                duplicates_removed += len(duplicate_ids)
                print(f"   Cleaned up {len(duplicate_ids)} duplicate(s) for store [{store_number}]")
        else:
            # Insert if it didn't exist
            cursor.execute("""
                INSERT INTO public.stores (
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
                    ST_SetSRID(ST_GeomFromText(%s), 0)
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
    # FACILITIES (Toilets, Lifts, Escalators, etc.)
    # ----------------------------------------------
    else:
        cursor.execute("""
            SELECT id
            FROM public.map_features
            WHERE floor_id = %s AND name = %s
            ORDER BY id ASC;
        """, (floor_id, name))
        existing_feats = cursor.fetchall()

        if existing_feats:
            primary_id = existing_feats[0][0]
            cursor.execute("""
                UPDATE public.map_features
                SET geom = ST_SetSRID(ST_GeomFromText(%s), 0),
                    feature_type = %s,
                    description = %s
                WHERE id = %s;
            """, (wkt, feature_type, status, primary_id))
            features_updated += 1

            if len(existing_feats) > 1:
                duplicate_ids = [row[0] for row in existing_feats[1:]]
                cursor.execute("""
                    DELETE FROM public.map_features
                    WHERE id = ANY(%s);
                """, (duplicate_ids,))
                duplicates_removed += len(duplicate_ids)
        else:
            cursor.execute("""
                INSERT INTO public.map_features (
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
                    ST_SetSRID(ST_GeomFromText(%s), 0)
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
# SYNC mall.stores TABLE IF IT EXISTS (OPTIONAL)
# --------------------------------------------------
cursor.execute("SELECT to_regclass('mall.stores');")
if cursor.fetchone()[0] is not None:
    cursor.execute("SELECT id FROM mall.floors WHERE floor_number IN (0, 1) LIMIT 1;")
    mall_floor = cursor.fetchone()
    if mall_floor:
        mall_floor_id = mall_floor[0]
        for feature in features:
            props = feature.get("properties", {})
            f_geom = feature.get("geometry")
            if not f_geom:
                continue
            f_id = props.get("id") or props.get("name")
            f_name = props.get("name")
            f_type = props.get("type", "shop")
            f_cat = props.get("category", "retail")
            f_stat = props.get("status", "active")
            cursor.execute("""
                INSERT INTO mall.stores (
                    store_id, name, type, floor_id, category, status, geometry_type, coordinates
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (store_id) DO UPDATE SET
                    geometry_type = EXCLUDED.geometry_type,
                    coordinates = EXCLUDED.coordinates;
            """, (
                f_id, f_name, f_type, mall_floor_id, f_cat, f_stat,
                f_geom.get("type", "Polygon"), json.dumps(f_geom.get("coordinates"))
            ))

# --------------------------------------------------
# COMMIT AND CLOSE
# --------------------------------------------------

conn.commit()

print("\n" + "=" * 50)
print("              DATABASE IMPORT COMPLETE")
print("=" * 50)
print(f" Stores updated with new geometry : {stores_updated}")
print(f" New stores inserted              : {stores_added}")
print(f" Facilities updated (lifts/etc.)  : {features_updated}")
print(f" New facilities inserted          : {features_added}")
if duplicates_removed > 0:
    print(f" Duplicate rows cleaned up        : {duplicates_removed}")
print("=" * 50)
print(" All custom store names and metadata were safely preserved!")
print("=" * 50)

cursor.close()
conn.close()
print(" Database connection closed.")