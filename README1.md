# BALI - ARCADE Team Notes

## Project

Vanilla HTML, CSS, JavaScript, Leaflet, Express, PostgreSQL, and GeoJSON. The application displays the indoor mall floor plan and store/facility locations.

## Run Locally

From the project folder:

```powershell
npm install
node server-pg.js
```

Open http://localhost:3000.

## PostgreSQL Setup

PostgreSQL must be running locally on port `5432`.

The current database settings are in `server-pg.js`:

- User: `postgres`
- Database: `bali_arcade`
- Host: `localhost`
- Port: `5432`

Create the database schema once:

```powershell
$env:PGPASSWORD = "123"
psql -h localhost -U postgres -d bali_arcade -f database/schema.sql
```

Import the GeoJSON stores:

```powershell
node import_data.js
```

Do not run these commands from `C:\Users\Lenovo`; run them from the repository folder.

## Frontend Files

- `index.html`: page structure, header, sidebar, floor selector, map panel, details panel, and dialogs.
- `style.css`: cream/black visual design and responsive layout.
- `map-canvas.js`: Leaflet map, GeoJSON loading, search, category filters, selection, nearby stores, map controls, and local store edits.
- `first_floor.png`: existing floor-plan image. Do not replace it.
- `icons/`: approved SVG category and facility icons.

## Map Flow

1. Express serves the frontend files.
2. `map-canvas.js` loads `/api/map/0`.
3. The API returns GeoJSON from PostgreSQL.
4. Leaflet overlays the GeoJSON on `first_floor.png` using `L.CRS.Simple`.
5. Clicking a feature opens its details and calculates nearby features from map geometry.

Do not change map coordinates, image bounds, GeoJSON geometry, or floor numbering without coordinating with the database owner.

## API Routes

- `GET /api/health`: server and database status.
- `GET /api/floors`: available database floors.
- `GET /api/map/:floor`: GeoJSON map data for a floor.
- `GET /api/stores?floor=0`: stores for a floor.
- `GET /api/stores/:id`: one store by ID.
- `GET /api/search?q=keyword`: database search.
- `GET /api/categories`: category counts.
- `GET /api/stats`: database statistics.

## Team Guidelines

- Frontend teammates: primarily edit `index.html`, `style.css`, and `map-canvas.js`.
- PostgreSQL teammates: edit `database/schema.sql`, import scripts, and server queries carefully. Preserve existing columns and geometry.
- Map/data teammates: validate `database/ground_floor.json` and `first_floor.png` before changing coordinates.
- Backend teammates: preserve the existing API response formats so the frontend continues to work.
- Do not migrate the project to React, Vue, Tailwind, or another framework.
- Do not commit passwords, local `.env` files, or generated database data.

## Quick Checks

```powershell
node --check map-canvas.js
node --check server-pg.js
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod http://localhost:3000/api/map/0
```
