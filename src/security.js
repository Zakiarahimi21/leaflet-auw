// Authentication, authorisation and request-hardening middleware.
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const db = require('./db');

const COOKIE_NAME = 'bali_session';

// A real hash used to keep response time equal when the account does not exist.
const DUMMY_HASH = bcrypt.hashSync('timing-attack-protection', config.bcryptRounds);

function cookieOptions() {
    return {
        httpOnly: true,                 // not readable by JavaScript -> XSS cannot steal the session
        sameSite: 'strict',             // never sent on cross-site requests -> CSRF protection
        secure: config.cookieSecure,
        path: '/',
        maxAge: config.sessionHours * 3600 * 1000
    };
}

function issueSession(res, user) {
    const token = jwt.sign({ uid: user.id, tv: user.token_version }, config.jwtSecret, {
        expiresIn: `${config.sessionHours}h`,
        algorithm: 'HS256'
    });
    res.cookie(COOKIE_NAME, token, cookieOptions());
}

function clearSession(res) {
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
}

// Loads the user behind the session cookie. Rejects revoked tokens and suspended accounts.
async function requireAuth(req, res, next) {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    try {
        const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
        const { rows } = await db.query(
            `SELECT id, username, email, role, status, full_name, phone, token_version
               FROM mall.users WHERE id = $1`, [payload.uid]);
        const user = rows[0];
        if (!user || user.token_version !== payload.tv) {
            clearSession(res);
            return res.status(401).json({ error: 'Session expired. Please sign in again.' });
        }
        if (user.status !== 'active') {
            clearSession(res);
            return res.status(403).json({ error: 'This account is suspended. Contact the mall administrator.' });
        }
        req.user = user;
        next();
    } catch {
        clearSession(res);
        res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
}

const requireRole = (...roles) => (req, res, next) =>
    req.user && roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have access to this resource' });

// Cross-site request forgery guard for every state-changing request.
// SameSite=Strict already blocks the cookie; this adds a second independent layer.
function csrfGuard(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
        return res.status(403).json({ error: 'Blocked: missing request header' });
    }
    const origin = req.get('Origin');
    if (origin) {
        try {
            if (new URL(origin).host !== req.get('Host')) return res.status(403).json({ error: 'Blocked: cross-origin request' });
        } catch {
            return res.status(403).json({ error: 'Blocked: bad origin' });
        }
    }
    next();
}

// Only accept JSON bodies on write requests (prevents form-encoded CSRF tricks).
function requireJson(req, res, next) {
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.headers['content-length'] !== '0' && !req.is('application/json')) {
        return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
    next();
}

const limiterOptions = (windowMinutes, max, message, extra = {}) => ({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    ...extra
});
// Only FAILED attempts count against the sign-in and password-change budgets.
const loginLimiter    = rateLimit(limiterOptions(15, config.loginRateMax, 'Too many sign-in attempts. Try again in a few minutes.', { skipSuccessfulRequests: true }));
const passwordLimiter = rateLimit(limiterOptions(15, 10, 'Too many password attempts. Try again in a few minutes.', { skipSuccessfulRequests: true }));
const signupLimiter   = rateLimit(limiterOptions(60, 10, 'Too many sign-up attempts. Try again later.'));
const apiLimiter      = rateLimit(limiterOptions(1, 300, 'Too many requests. Slow down.'));

// Writes one row to the audit trail. Never throws: auditing must not break a request.
async function audit(req, action, target = null, details = null, actor = null) {
    try {
        const user = actor || req.user || {};
        await db.query(
            'INSERT INTO mall.audit_log (user_id, username, action, target, details, ip) VALUES ($1,$2,$3,$4,$5,$6)',
            [user.id || null, user.username || null, action, target, details ? JSON.stringify(details) : null, req.ip]
        );
    } catch (error) {
        console.error('Audit log failed:', error.message);
    }
}

const hashPassword = password => bcrypt.hash(String(password), config.bcryptRounds);
const comparePassword = (password, hash) => bcrypt.compare(String(password || ''), hash || DUMMY_HASH);

module.exports = {
    COOKIE_NAME, issueSession, clearSession, requireAuth, requireRole, csrfGuard, requireJson,
    loginLimiter, passwordLimiter, signupLimiter, apiLimiter, audit, hashPassword, comparePassword
};
