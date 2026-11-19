// Shared browser helpers: API calls (cookie session + CSRF header), escaping, toasts, dialogs.
window.BALI = (() => {
    async function api(path, { method = 'GET', body } = {}) {
        let response;
        try {
            response = await fetch('/api' + path, {
                method, credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body: body === undefined ? undefined : JSON.stringify(body)
            });
        } catch {
            throw Object.assign(new Error('Could not reach the server. Check your connection.'), { status: 0 });
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: response.status });
        return data;
    }

    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmtDate = value => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
    const fmtDateTime = value => value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';
    const initials = user => (user.fullName || user.username || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();

    function toast(message, type = 'ok') {
        let box = document.querySelector('.toasts');
        if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
        const item = document.createElement('div');
        item.className = 'toast' + (type === 'error' ? ' error' : '');
        item.textContent = message;
        box.appendChild(item);
        setTimeout(() => item.remove(), 4200);
    }

    // Password rules shared by the sign-up form and the password-change forms (the server enforces them too).
    const passwordRules = [
        ['10+ characters', p => p.length >= 10], ['Upper case letter', p => /[A-Z]/.test(p)],
        ['Lower case letter', p => /[a-z]/.test(p)], ['A number', p => /\d/.test(p)], ['A symbol (! @ # $)', p => /[^A-Za-z0-9]/.test(p)]
    ];
    function attachPasswordMeter(input, meter, list) {
        const update = () => {
            const value = input.value;
            const met = passwordRules.map(([, test]) => test(value));
            const score = met.filter(Boolean).length;
            meter.dataset.level = value ? String(Math.min(4, Math.max(1, score - (value.length < 10 ? 1 : 0)))) : '0';
            if (list) [...list.children].forEach((li, i) => li.classList.toggle('met', met[i]));
        };
        input.addEventListener('input', update);
        if (list) list.innerHTML = passwordRules.map(([label]) => `<li>${label}</li>`).join('');
        update();
    }

    function readImage(file, maxBytes = 1.5 * 1024 * 1024) {
        return new Promise((resolve, reject) => {
            if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return reject(new Error('Use a PNG, JPEG, WEBP or GIF image.'));
            if (file.size > maxBytes) return reject(new Error('Image must be smaller than 1.5 MB.'));
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Could not read that file.'));
            reader.readAsDataURL(file);
        });
    }

    async function logout() {
        try { await api('/auth/logout', { method: 'POST' }); } catch { /* cookie is cleared either way on next request */ }
        location.href = '/login.html';
    }

    // Guards a dashboard page: redirects away unless the signed-in user has the right role.
    async function requireRole(role) {
        try {
            const { user } = await api('/auth/me');
            if (user.role !== role) { location.replace(({ admin: '/admin.html', shopkeeper: '/shopkeeper.html', visitor: '/visitor.html' })[user.role] || '/login.html'); return null; }
            return user;
        } catch {
            location.replace('/login.html');
            return null;
        }
    }

    return { api, esc, fmtDate, fmtDateTime, initials, toast, attachPasswordMeter, readImage, logout, requireRole, passwordRules };
})();
