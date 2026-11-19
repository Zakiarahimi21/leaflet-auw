# BALI - ARCADE | Indoor Mall Map

AUW internship project mapping spaces in Bangladesh: an interactive indoor mall floor map built with **Leaflet.js**, **Node.js (Express 5)** and **PostgreSQL/PostGIS**, now with **secure role-based accounts and dashboards**.

| Role | How they get an account | What they can do |
|---|---|---|
| **Visitor** | Signs up at `/login.html` | Browse the map, save favourite shops, see running deals |
| **Shopkeeper** | Signs up and picks their shop; an admin must approve | Edit only their own shop (details, hours, photo, status), publish offers, request more shops |
| **Admin** | **Cannot sign up.** Created from the command line only | Everything: users, shops, requests, offers, security log |

---

## Quick start

### 1. Prerequisites
Node.js 18+ (22 recommended), PostgreSQL with the PostGIS extension, and pgAdmin or `psql`.

### 2. Install
```bash
npm install
```

### 3. Create the database
```bash
psql -U postgres -c "CREATE DATABASE bali_arcade;"
psql -U postgres -d bali_arcade -f database/bali_arcade.sql
```
(Or restore `database/bali_arcade.sql` through pgAdmin's Query Tool.)

### 4. Configure `.env`
```bash
cp .env.example .env
```
Open `.env` and fill in at least:

```dotenv
JWT_SECRET=<64+ random characters>      # node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
DB_PASSWORD=<your postgres password>
ADMIN_USERNAME=admin
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=<a strong password>
```
The server refuses to start if `JWT_SECRET` is missing or shorter than 32 characters. `.env` is git-ignored — never commit it.

### 5. Add the account tables and create the admin
```bash
npm run db:migrate     # roles, dashboards, audit log (safe to run repeatedly)
npm run seed:admin     # creates/resets the admin from ADMIN_* in .env
```
Admin passwords must pass the same policy as everyone else (10+ characters, upper + lower case, number, symbol).

### 6. Run
```bash
npm start
```
Open **http://localhost:3000**. You should see `✅ Connected to PostgreSQL`.

> Always open the site through the Node server (`http://localhost:3000`). Opening files with VS Code Live Server will not work, because the session cookie only works on the server's own origin.

---

## Pages

| URL | Who | Purpose |
|---|---|---|
| `/` | everyone | The interactive map. Shop details show hours, contact info and offers; signed-in users can save shops. |
| `/login.html` | everyone | Sign in / create account (visitor or shopkeeper). |
| `/visitor.html` | visitor | Saved shops, mall-wide deals, account settings. |
| `/shopkeeper.html` | shopkeeper | Overview and stats, my shops, offers, access requests, account. |
| `/admin.html` | admin | Overview and charts, users, shops, shop requests, offers, security log, account. |

After login, people are sent to their own dashboard automatically. A dashboard of another role redirects away, and the API enforces the same rules on the server.

### Shopkeeper approval flow
1. The shopkeeper signs up and chooses their shop (e.g. `S-30`).
2. A *pending request* appears in **Admin → Shop requests**.
3. The admin checks that the person really runs the shop and clicks **Approve**.
4. Only then can the shopkeeper edit that shop. Until then every edit is rejected with `403`.

Admins can also create shopkeepers directly (**Users → Add user**) and reassign owners (**Shops → Edit**).

---

## Security design

- **Passwords**: bcrypt (cost 12); policy of 10+ chars with upper/lower/number/symbol, no username or common passwords. Hashes never leave the server.
- **Admin accounts cannot be registered.** The sign-up endpoint rejects `role: admin` (and logs it). The admin API cannot create admins either; only `npm run seed:admin` can.
- **Sessions**: signed JWT in an **HttpOnly, SameSite=Strict** cookie (`Secure` in production). No token is ever readable by page JavaScript or stored in `localStorage`.
- **Instant revocation**: every user has a `token_version`. Changing a password, an admin reset, or a suspension invalidates all existing sessions immediately.
- **Brute-force defence**: failed sign-ins are rate limited per IP, and an account locks for 15 minutes after 5 wrong passwords. Unknown usernames take the same time as wrong passwords, and error messages are generic.
- **CSRF**: SameSite cookies plus a required `X-Requested-With` header and an `Origin` check on every write; JSON-only bodies.
- **Authorisation on the server**: every route checks the role, and shopkeepers are checked against `shop_owners` for every shop or offer they touch.
- **Headers**: Helmet with a strict Content-Security-Policy (no inline scripts), `frame-ancestors 'none'`, HSTS in production.
- **Input safety**: parameterised SQL everywhere, validated fields, images limited to PNG/JPEG/WEBP/GIF under 1.5 MB (SVG is refused), website links must be `http(s)`, all dashboard output is HTML-escaped.
- **Only `public/` is served.** Previously the whole project folder was exposed, including `.env`. That is fixed and covered by tests.
- **Errors**: details go to the server log; browsers only see a generic message. CORS `*` was removed.
- **Audit trail**: sign-ins, failures, lockouts, admin actions and edits are stored in `mall.audit_log` and shown in the admin *Security log*.

### Before going live
- Set `NODE_ENV=production` and serve over **HTTPS** (nginx, Caddy or your host). This enables `Secure` cookies and HSTS.
- Set `TRUST_PROXY=1` when behind one reverse proxy so rate limits see real client IPs.
- Use a strong, unique `DB_PASSWORD` and a dedicated DB user with only the rights the app needs, not the `postgres` superuser.
- Back up the database regularly (see below).

---

## Project structure
```
server-pg.js            Express app: security headers, routing, error handling
src/
  config.js             Environment settings (fails fast on a weak JWT secret)
  db.js                 PostgreSQL pool + transactions
  security.js           Sessions, roles, CSRF guard, rate limits, audit log
  validators.js         Input and password validation
  services/stores.js    Store queries/updates shared by map, shop and admin
  routes/
    auth.js             Sign up, login, logout, profile, password change
    admin.js            Admin API (users, shops, requests, offers, audit)
    shop.js             Shopkeeper API (own shops, offers, requests)
    visitor.js          Saved shops
    public.js           Map data, search, shop details, offers, map store editing
public/                 Everything the browser can load
  index.html, map-canvas.js, style.css, icons/, first_floor.png    (the map)
  login.html, admin.html, shopkeeper.html, visitor.html
  css/ (common, auth, dashboard)   js/ (api, dash, login, admin, shopkeeper, visitor)
database/
  bali_arcade.sql       Base data (shops, geometry)
  auth.sql              Account/dashboard schema (idempotent)
  migrate.js            Applies auth.sql without needing psql
  seed_admin.js         Creates/resets the admin account
tests/smoke.test.js     60 end-to-end security and feature checks
```

## API overview

All write requests need `Content-Type: application/json` and the header `X-Requested-With: XMLHttpRequest` (the site's own pages send both).

| Group | Endpoints |
|---|---|
| Public | `GET /api/health`, `/api/floors`, `/api/map/:floor`, `/api/stores`, `/api/search?q=`, `/api/categories`, `/api/stats`, `/api/public/stores`, `/api/public/stores/:number`, `/api/public/offers` |
| Auth | `POST /api/auth/signup` · `POST /api/auth/login` · `POST /api/auth/logout` · `GET/PUT /api/auth/me` · `PUT /api/auth/password` |
| Favourites (any signed-in user) | `GET /api/favorites` · `PUT/DELETE /api/favorites/:storeNumber` |
| Shopkeeper | `GET /api/shop/overview`, `/stores`, `/offers`, `/claims` · `PUT /api/shop/stores/:n` · `POST/PUT/DELETE /api/shop/offers[/:id]` · `POST /api/shop/claims` |
| Admin | `GET /api/admin/overview`, `/users`, `/stores`, `/claims`, `/offers`, `/audit` · `POST/PUT/DELETE /api/admin/users[/:id]` · `POST /api/admin/users/:id/reset-password` · `PUT /api/admin/stores/:n[/owners]` · `POST /api/admin/claims/:id/approve\|reject` · `PUT/DELETE /api/admin/offers/:id` |
| Map editing | `PUT /api/stores/:id` (admin, or the shopkeeper who owns the shop) |

## Tests
With the server running (restart it with a higher limit so repeated test runs are not rate limited):
```bash
LOGIN_RATE_MAX=1000 npm start     # terminal 1
npm test                          # terminal 2
```
The tests create throw-away visitor/shopkeeper accounts and a few offers in your database; they use the admin from `.env`. Use a development database.

## Database backup
```bash
pg_dump -U postgres -d bali_arcade -F p -f database/bali_arcade.sql
```
Note: a dump includes user accounts and password hashes. Do not commit a dump that contains real users.

## Upgrading from the previous version
- Web files moved into `public/`. Update any deployment paths.
- The old login pop-up and "Manage users" dialog on the map were replaced by `/login.html` and the dashboards.
- Run `npm run db:migrate` once; existing `admin`/`shopkeeper` accounts keep working. Shopkeeper accounts must now meet the password policy only when they next change their password.
- Passwords are no longer accepted with fewer than 10 characters for new accounts.
- `cors` is no longer used; the API is same-origin only.
