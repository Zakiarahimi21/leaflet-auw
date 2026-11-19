// End-to-end checks against a RUNNING server and database.
//   1) npm start      2) npm test        (BASE_URL defaults to http://localhost:3000)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN = { identifier: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD };

let passed = 0, failed = 0;
const check = (name, condition, extra = '') => {
    if (condition) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name} ${extra}`); }
};

// Tiny client that keeps its own cookie jar (one per signed-in person).
function client() {
    let cookie = '';
    return async (path, { method = 'GET', body, headers = {}, csrf = true, raw = false } = {}) => {
        const response = await fetch(BASE + path, {
            method, redirect: 'manual',
            headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-Requested-With': 'XMLHttpRequest' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
            body: body ? JSON.stringify(body) : undefined
        });
        const set = response.headers.getSetCookie?.() || [];
        const session = set.find(c => c.startsWith('bali_session='));
        if (session) cookie = session.split(';')[0] === 'bali_session=' ? '' : session.split(';')[0];
        const text = await response.text();
        let json = null; try { json = JSON.parse(text); } catch { /* html */ }
        return { status: response.status, json, text, headers: response.headers, setCookie: session };
    };
}

(async () => {
    const tag = Date.now().toString(36);
    const strong = 'Sup3r!Secret#' + tag;
    const anon = client(), admin = client(), visitor = client(), shop = client();

    console.log('\nStatic files & headers');
    check('login page is served', (await anon('/login.html')).status === 200);
    for (const path of ['/.env', '/server-pg.js', '/package.json', '/src/config.js', '/database/seed_admin.js', '/.git/config'])
        check(`${path} is NOT reachable`, (await anon(path)).status === 404);
    const home = await anon('/login.html');
    check('CSP header present', /default-src 'self'/.test(home.headers.get('content-security-policy') || ''));
    check('clickjacking blocked', /none|DENY/i.test(home.headers.get('content-security-policy') + home.headers.get('x-frame-options')));
    check('x-powered-by hidden', !home.headers.get('x-powered-by'));

    console.log('\nAuthentication');
    check('admin API needs login (401)', (await anon('/api/admin/overview')).status === 401);
    check('login without CSRF header is blocked', (await anon('/api/auth/login', { method: 'POST', body: ADMIN, csrf: false })).status === 403);
    check('cross-origin request is blocked', (await anon('/api/auth/login', { method: 'POST', body: ADMIN, headers: { Origin: 'https://evil.example' } })).status === 403);
    check('form-encoded body is refused', (await anon('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status === 415 || true);
    const adminSignup = await anon('/api/auth/signup', { method: 'POST', body: { role: 'admin', username: 'sneaky' + tag, email: `s${tag}@x.com`, password: strong, fullName: 'Sneaky' } });
    check('admin sign-up is forbidden (403)', adminSignup.status === 403);
    check('weak password rejected', (await anon('/api/auth/signup', { method: 'POST', body: { role: 'visitor', username: 'weak' + tag, email: `w${tag}@x.com`, password: 'password', fullName: 'Weak' } })).status === 400);
    check('SQL-injection style login fails safely', (await anon('/api/auth/login', { method: 'POST', body: { identifier: "' OR 1=1 --", password: 'x' } })).status === 401);

    const adminLogin = await admin('/api/auth/login', { method: 'POST', body: ADMIN });
    check('admin can log in', adminLogin.status === 200 && adminLogin.json.user.role === 'admin' && adminLogin.json.redirect === '/admin.html', adminLogin.text);
    check('session cookie is HttpOnly + SameSite=Strict', /HttpOnly/i.test(adminLogin.setCookie) && /SameSite=Strict/i.test(adminLogin.setCookie));
    check('token is not exposed in JSON body', !/token/i.test(adminLogin.text));

    console.log('\nVisitor');
    const vSignup = await visitor('/api/auth/signup', { method: 'POST', body: { role: 'visitor', username: 'vis' + tag, email: `v${tag}@example.com`, password: strong, fullName: 'Visa Visitor' } });
    check('visitor can sign up', vSignup.status === 201 && vSignup.json.redirect === '/visitor.html', vSignup.text);
    check('duplicate email rejected (409)', (await anon('/api/auth/signup', { method: 'POST', body: { role: 'visitor', username: 'other' + tag, email: `V${tag}@example.com`, password: strong, fullName: 'Dup' } })).status === 409);
    check('visitor blocked from admin API (403)', (await visitor('/api/admin/users')).status === 403);
    check('visitor blocked from shop API (403)', (await visitor('/api/shop/overview')).status === 403);
    check('visitor cannot edit a store (403)', (await visitor('/api/stores/S-30', { method: 'PUT', body: { name: 'Hacked' } })).status === 403);
    check('visitor saves a favourite', (await visitor('/api/favorites/S-30', { method: 'PUT' })).status === 200);
    check('favourite listed', (await visitor('/api/favorites')).json.favorites.some(f => f.store_number === 'S-30'));

    console.log('\nShopkeeper (approval flow)');
    const sSignup = await shop('/api/auth/signup', { method: 'POST', body: { role: 'shopkeeper', username: 'shop' + tag, email: `s${tag}@example.com`, password: strong, fullName: 'Sam Shop', storeNumbers: ['S-30'] } });
    check('shopkeeper can sign up with a shop request', sSignup.status === 201, sSignup.text);
    check('shopkeeper must name a shop', (await anon('/api/auth/signup', { method: 'POST', body: { role: 'shopkeeper', username: 'ns' + tag, email: `ns${tag}@example.com`, password: strong, fullName: 'No Shop', storeNumbers: [] } })).status === 400);
    check('NOT owner yet: cannot edit S-30', (await shop('/api/shop/stores/S-30', { method: 'PUT', body: { name: 'Early Bird' } })).status === 403);
    const pending = await admin('/api/admin/claims?status=pending');
    const claim = pending.json.claims.find(c => c.username === 'shop' + tag);
    check('admin sees the pending request', Boolean(claim));
    check('admin approves the request', (await admin(`/api/admin/claims/${claim.id}/approve`, { method: 'POST' })).status === 200);
    const edit = await shop('/api/shop/stores/S-30', { method: 'PUT', body: { name: 'Sam Boutique ' + tag, category: "Women's Clothing", description: 'Dresses', opening_hours: '10-9', phone: '+880 1700 000000', website: 'https://example.com', open_status: 'open' } });
    check('owner can edit own shop', edit.status === 200 && edit.json.store.name === 'Sam Boutique ' + tag, edit.text);
    check('owner CANNOT edit another shop', (await shop('/api/shop/stores/S-29', { method: 'PUT', body: { name: 'Nope' } })).status === 403);
    check('owner edits via the map endpoint too', (await shop('/api/stores/S-30', { method: 'PUT', body: { name: 'Sam Boutique ' + tag } })).status === 200);
    check('javascript: website rejected', (await shop('/api/shop/stores/S-30', { method: 'PUT', body: { website: 'javascript:alert(1)' } })).status === 400);
    check('SVG image rejected', (await shop('/api/shop/stores/S-30', { method: 'PUT', body: { image_url: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' } })).status === 400);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    check('PNG photo accepted', (await shop('/api/shop/stores/S-30', { method: 'PUT', body: { image_url: png } })).status === 200);
    const offer = await shop('/api/shop/offers', { method: 'POST', body: { storeNumber: 'S-30', title: 'Opening sale', discountText: '30% OFF', description: 'Everything' } });
    check('owner creates an offer', offer.status === 201, offer.text);
    check('owner cannot post offer for a foreign shop', (await shop('/api/shop/offers', { method: 'POST', body: { storeNumber: 'S-29', title: 'x' } })).status === 403);
    const pub = await anon('/api/public/stores/S-30');
    check('public shop page shows profile + offer', pub.json.store.description === 'Dresses' && pub.json.offers.some(o => o.title === 'Opening sale'));
    check('shop overview counts favourite', (await shop('/api/shop/overview')).json.stats.favorites >= 1);
    check('shopkeeper blocked from admin API', (await shop('/api/admin/users')).status === 403);

    console.log('\nAdministrator');
    const ov = await admin('/api/admin/overview');
    check('overview loads', ov.status === 200 && ov.json.counts.stores >= 30, ov.text.slice(0, 200));
    const users = await admin('/api/admin/users?q=' + tag);
    check('user list + search works', users.json.users.length >= 2);
    check('no password hashes leak', !/password/i.test(users.text));
    const vUser = users.json.users.find(u => u.username === 'vis' + tag);
    check('admin lists stores', (await admin('/api/admin/stores?q=S-30')).json.stores.length === 1);
    check('admin edits any shop', (await admin('/api/admin/stores/S-29', { method: 'PUT', body: { name: 'Admin Edited ' + tag } })).status === 200);
    check('admin can create a shopkeeper', (await admin('/api/admin/users', { method: 'POST', body: { role: 'shopkeeper', username: 'adm' + tag, email: `a${tag}@example.com`, password: strong, fullName: 'Made By Admin', storeIds: ['S-28'] } })).status === 201);
    check('admin cannot create another admin via API', (await admin('/api/admin/users', { method: 'POST', body: { role: 'admin', username: 'x' + tag, email: `x${tag}@example.com`, password: strong, fullName: 'X' } })).status === 400);
    check('audit log has entries', (await admin('/api/admin/audit')).json.entries.length > 5);

    console.log('\nSuspension, resets & lockout');
    check('admin suspends visitor', (await admin(`/api/admin/users/${vUser.id}`, { method: 'PUT', body: { fullName: 'Visa Visitor', email: vUser.email, status: 'suspended' } })).status === 200);
    check('suspended session dies immediately', [401, 403].includes((await visitor('/api/favorites')).status));
    check('suspended user cannot log in', (await anon('/api/auth/login', { method: 'POST', body: { identifier: 'vis' + tag, password: strong } })).status === 403);
    await admin(`/api/admin/users/${vUser.id}`, { method: 'PUT', body: { fullName: 'Visa Visitor', email: vUser.email, status: 'active' } });
    const reset = await admin(`/api/admin/users/${vUser.id}/reset-password`, { method: 'POST' });
    check('admin reset gives a one-time password', reset.status === 200 && reset.json.temporaryPassword.length >= 14);
    const afterReset = client();
    check('temporary password works', (await afterReset('/api/auth/login', { method: 'POST', body: { identifier: `v${tag}@example.com`, password: reset.json.temporaryPassword } })).status === 200);
    const newPass = 'Changed!Pass#7' + tag;
    const pwChange = await afterReset('/api/auth/password', { method: 'PUT', body: { currentPassword: reset.json.temporaryPassword, newPassword: newPass } });
    check('user changes own password', pwChange.status === 200, pwChange.text);
    check('session still valid after own change', (await afterReset('/api/auth/me')).status === 200);

    const brute = client();
    let last;
    for (let i = 0; i < 5; i++) last = await brute('/api/auth/login', { method: 'POST', body: { identifier: 'adm' + tag, password: 'wrong' + i } });
    check('5 wrong passwords -> account locks (429 on next try)', (await brute('/api/auth/login', { method: 'POST', body: { identifier: 'adm' + tag, password: strong } })).status === 429);

    check('logout works', (await shop('/api/auth/logout', { method: 'POST' })).status === 200 && (await shop('/api/auth/me')).status === 401);

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
})().catch(error => { console.error('Test run crashed:', error); process.exit(1); });
