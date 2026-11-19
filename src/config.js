// Central configuration. Everything is read from .env (see .env.example).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || '';

if (JWT_SECRET.length < 32) {
    console.error('Fatal: JWT_SECRET must be set in .env and be at least 32 characters long.');
    console.error('Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    process.exit(1);
}

module.exports = {
    isProduction,
    port: Number(process.env.PORT || 3000),
    jwtSecret: JWT_SECRET,
    sessionHours: Number(process.env.SESSION_HOURS || 8),
    // Cookies are only sent over HTTPS in production. Set COOKIE_SECURE=false to test production mode on plain HTTP.
    cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,
    bcryptRounds: 12,
    maxFailedLogins: 5,
    // Failed sign-ins allowed per IP per 15 minutes (raise only for automated tests: LOGIN_RATE_MAX=1000).
    loginRateMax: Number(process.env.LOGIN_RATE_MAX || 20),
    lockMinutes: 15,
    db: {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'bali_arcade',
        password: process.env.DB_PASSWORD || '123',
        port: Number(process.env.DB_PORT || 5432)
    }
};
