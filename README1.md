
# Hey everyone! the following are the changes i brought in the frontend.
# BALI - ARCADE front-end Notes :)

## Run the Entire Program

Requirements: Node.js 16 or newer, PostgreSQL, and the PostgreSQL command-line tools (`psql`). PostgreSQL must be running locally on port `5432`.

**Before sharing:** these role-login steps require `database/auth.sql`, `database/seed_admin.js`, and the corresponding auth routes and login UI to be included in the shared checkout. They are present in the local version this guide describes but are not yet present in the current shared workspace. The base SQL backup alone does not configure application roles.

From the project folder, install dependencies:

```powershell
npm install
```

Create the database if it does not already exist, then restore the project backup and apply the authentication tables/roles:

```powershell
psql -U postgres -c "CREATE DATABASE bali_arcade;"
psql -h localhost -U postgres -d bali_arcade -f database/bali_arcade.sql
psql -h localhost -U postgres -d bali_arcade -f database/auth.sql
```

If the database already exists, skip the `CREATE DATABASE` command. The restore command is for a fresh database. Enter your PostgreSQL password when prompted. Ensure the connection settings in `server-pg.js` match your local PostgreSQL configuration.

Import or refresh the store data:

```powershell
node import_data.js
```

Create a `.env` file in the project root. `.env` is ignored by Git; each teammate should use their own secret values:

```dotenv
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=8h
ADMIN_USERNAME=choose-an-admin-username
ADMIN_PASSWORD=choose-a-strong-admin-password
```

The admin seed script uses `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, and `DB_PORT` from `.env` if set; otherwise it uses its built-in local defaults. Set these to match the database connection used by `server-pg.js`, and do not commit `.env` or share passwords in this README.

Create or reset the admin account from the `.env` values, then start the server:

```powershell
node database/seed_admin.js
node server-pg.js
```

Keep the server terminal open and browse to [http://localhost:3000](http://localhost:3000). A successful startup reports that PostgreSQL is connected.

## Admin and Shopkeeper Login

The current local seeded admin email is `admin@admin.local`. Sign in with username `admin`; the email address is not the login name. The password is the private `ADMIN_PASSWORD` value in the local `.env` file and is intentionally not written here. To reset it, update `ADMIN_PASSWORD` in `.env` and rerun `node database/seed_admin.js`.

1. In the app, select **Login** and enter `ADMIN_USERNAME` and `ADMIN_PASSWORD` from your local `.env` to sign in as the admin.
2. Open **Manage shopkeepers**, create a username and password for each shopkeeper, and assign that account its store IDs. Shopkeeper passwords must be at least 8 characters.
3. Shopkeepers use the same **Login** form with the username and password created by the admin. Their access is limited to stores assigned to their account.

The app supports the `admin` and `shopkeeper` roles. Share account credentials with teammates through a secure channel, not through Git or this README. Do not copy the PostgreSQL password into the application login form.


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
- `POST /api/auth/login`: sign in and receive an access token and role.
- `GET /api/auth/me`, `PUT /api/auth/me`: read or update the signed-in user's profile.
- `POST /api/admin/users`, `GET /api/admin/users`, `PUT /api/admin/users/:id`, `DELETE /api/admin/users/:id`: admin-only shopkeeper management.
- `PUT /api/stores/:id`: authenticated store update, restricted to the admin or an assigned shopkeeper.

## Login and Roles

- Viewing the map does not require an application login.
- The frontend's add-store flow is wired to request an administrator password from `POST /api/admin/login` and expects a token in response.
- That login route is not implemented in `server-pg.js`, so administrator login and token-based access are not currently available.
- There are no application roles, role-specific accounts, or application login credentials configured in the database. The PostgreSQL credentials are database connection settings, not map login credentials.

Do not treat the current admin dialog as access control. Implement the login endpoint and server-side authorization for protected actions before using role-based access or publishing the app.


## Run the Entire Program

Requirements: Node.js 16 or newer, PostgreSQL, and the PostgreSQL command-line tools (`psql`). PostgreSQL must be running locally on port `5432`.

From the project folder, install dependencies:

```powershell
npm install
```

For a fresh local database, create and restore the database, then apply the authentication schema:

```powershell
psql -U postgres -c "CREATE DATABASE bali_arcade;"
psql -h localhost -U postgres -d bali_arcade -f database/bali_arcade.sql
psql -h localhost -U postgres -d bali_arcade -f database/auth.sql
```

If the database already exists, skip the create command. The restore command is for a fresh database. Enter your PostgreSQL password when prompted. Keep the database connection settings in `server-pg.js` and `database/seed_admin.js` configured for the same local PostgreSQL account.

Import or refresh the store data:

```powershell
node import_data.js
```

Create a `.env` file in the project root. `.env` is ignored by Git; each teammate should use private values:

```dotenv
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=8h
ADMIN_USERNAME=choose-an-admin-username
ADMIN_PASSWORD=choose-a-strong-admin-password
```

Create or reset the admin account from the `.env` values, then start the server:

```powershell
node database/seed_admin.js
node server-pg.js
```

Keep the server terminal open and browse to [http://localhost:3000](http://localhost:3000). A successful startup reports that PostgreSQL is connected.

## Admin and Shopkeeper Login

The current local seeded admin uses username `admin` and email `admin@admin.local`. Sign in with the username, not the email. The password is the private `ADMIN_PASSWORD` value in the local `.env` file and is intentionally not written here. To reset it, update `ADMIN_PASSWORD` in `.env` and rerun `node database/seed_admin.js`.

1. Select **Login** in the app and enter the admin username and password.
2. As admin, open **Manage shopkeepers**, create each shopkeeper's username and password, and assign that account its store IDs. Shopkeeper passwords must be at least 8 characters.
3. Shopkeepers use the same **Login** form with the credentials created by the admin. Their access is limited to stores assigned to their account.

The app supports the `admin` and `shopkeeper` roles. Share credentials through a secure channel, not through Git or this README. Do not use the PostgreSQL password as an application login password.

## Quick Checks

```powershell
node --check map-canvas.js
node --check server-pg.js
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod http://localhost:3000/api/map/0
```
