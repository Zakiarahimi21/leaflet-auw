// server-pg.js - BALI ARCADE API + static site (hardened)
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./src/config');
const db = require('./src/db');
const sec = require('./src/security');

const app = express();
app.disable('x-powered-by');
// Set TRUST_PROXY=1 when running behind nginx / a cloud load balancer so rate limits see the real client IP.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

// ---- Security headers (CSP blocks injected scripts; frames are denied) ----
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://unpkg.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'blob:', 'https://unpkg.com'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: config.cookieSecure ? [] : null
        }
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.cookieSecure ? { maxAge: 15552000, includeSubDomains: true } : false
}));

app.use(express.json({ limit: '3mb' }));      // images are limited to 1.5 MB before base64
app.use(cookieParser());

// Only the "public" folder is served. Source code, .env and database files are never reachable.
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', dotfiles: 'ignore', maxAge: config.isProduction ? '1h' : 0 }));

// ---- API ----
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', sec.apiLimiter, sec.csrfGuard, sec.requireJson);
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/shop', require('./src/routes/shop'));
app.use('/api/favorites', require('./src/routes/visitor'));
app.use('/api', require('./src/routes/public'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ---- Error handling: details go to the server log, never to the browser ----
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}:`, error);
    res.status(500).json({ error: 'Something went wrong on the server' });
});

const server = app.listen(config.port, '0.0.0.0', async () => {
    try {
        await db.query('SELECT 1');
        console.log('✅ Connected to PostgreSQL');
    } catch (error) {
        console.error('❌ Database connection error:', error.message);
    }
    console.log(`\n🚀 Bali Arcade server is RUNNING!  →  http://localhost:${config.port}`);
    console.log(`   Login page:  /login.html   |   Admin: /admin.html   |   Shopkeeper: /shopkeeper.html   |   Visitor: /visitor.html\n`);
}).on('error', error => {
    if (error.code === 'EADDRINUSE') console.error(`\n❌ Port ${config.port} is already in use. Stop the other process or set PORT in .env.\n`);
    else console.error('Server error:', error);
    process.exit(1);
});

const shutdown = () => server.close(() => db.pool.end().then(() => process.exit(0)));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
