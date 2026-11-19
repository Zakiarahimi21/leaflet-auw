// Small, dependency-free input validation helpers.
const COMMON_PASSWORDS = new Set([
    'password', 'password1', 'password123', 'passw0rd', 'qwerty123', 'letmein123', 'welcome123',
    'admin123', 'admin1234', 'iloveyou1', '1234567890', 'baliarcade', 'baliarcade1'
]);

function cleanText(value, max = 255) {
    if (value === undefined || value === null) return null;
    const text = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
    return text ? text.slice(0, max) : null;
}

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\-.\s0-9]{6,30}$/;

function validateUsername(value) {
    return USERNAME_RE.test(String(value || '')) ? null : 'Username must be 3-30 characters: letters, numbers, dot, dash or underscore.';
}
function validateEmail(value) {
    const email = String(value || '');
    return email.length <= 100 && EMAIL_RE.test(email) ? null : 'Enter a valid email address.';
}
function validatePhone(value) {
    return !value || PHONE_RE.test(String(value)) ? null : 'Enter a valid phone number.';
}

// Returns an error message, or null when the password is acceptable.
function validatePassword(password, { username = '', email = '' } = {}) {
    const value = String(password || '');
    if (value.length < 10) return 'Password must be at least 10 characters.';
    if (Buffer.byteLength(value, 'utf8') > 72) return 'Password is too long (72 bytes maximum).';
    if (!/[a-z]/.test(value) || !/[A-Z]/.test(value)) return 'Password needs both upper and lower case letters.';
    if (!/\d/.test(value)) return 'Password needs at least one number.';
    if (!/[^A-Za-z0-9]/.test(value)) return 'Password needs at least one symbol (for example ! @ # $).';
    const lower = value.toLowerCase();
    if (COMMON_PASSWORDS.has(lower)) return 'That password is too common.';
    if (username && lower.includes(String(username).toLowerCase())) return 'Password must not contain your username.';
    const emailName = String(email).split('@')[0].toLowerCase();
    if (emailName.length >= 4 && lower.includes(emailName)) return 'Password must not contain your email name.';
    return null;
}

// Only small raster images, stored as data URLs. SVG is rejected on purpose (script injection risk).
const IMAGE_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
function validateImage(dataUrl, maxBytes = 1.5 * 1024 * 1024) {
    if (!IMAGE_RE.test(String(dataUrl || ''))) return 'Image must be a PNG, JPEG, WEBP or GIF file.';
    const approxBytes = Math.floor((String(dataUrl).length * 3) / 4);
    return approxBytes > maxBytes ? 'Image is larger than 1.5 MB.' : null;
}

function validateUrl(value) {
    if (!value) return null;
    try {
        const url = new URL(String(value));
        return ['http:', 'https:'].includes(url.protocol) ? null : 'Website must start with http:// or https://';
    } catch {
        return 'Enter a valid website address.';
    }
}

function isStoreNumber(value) {
    return /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,49}$/.test(String(value || ''));
}

module.exports = { cleanText, validateUsername, validateEmail, validatePhone, validatePassword, validateImage, validateUrl, isStoreNumber };
