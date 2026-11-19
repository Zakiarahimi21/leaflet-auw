(() => {
    const { api, attachPasswordMeter } = BALI;
    const $ = selector => document.querySelector(selector);

    // Already signed in? Go straight to the right dashboard.
    api('/auth/me').then(({ redirect }) => { if (redirect) location.replace(redirect); }).catch(() => {});

    // ---- Tabs ----
    function showTab(name) {
        const login = name === 'login';
        $('#tab-login').setAttribute('aria-selected', String(login));
        $('#tab-signup').setAttribute('aria-selected', String(!login));
        $('#panel-login').hidden = !login;
        $('#panel-signup').hidden = login;
        history.replaceState(null, '', login ? location.pathname : '#signup');
        if (!login) loadShops();
    }
    $('#tab-login').addEventListener('click', () => showTab('login'));
    $('#tab-signup').addEventListener('click', () => showTab('signup'));
    if (location.hash === '#signup') showTab('signup');

    // ---- Show / hide password ----
    document.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.toggle);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.textContent = show ? 'Hide' : 'Show';
        button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    }));
    $('#login-password').addEventListener('keyup', event => { $('#caps-note').hidden = !event.getModifierState?.('CapsLock'); });

    function setBusy(button, busy, label) {
        button.disabled = busy;
        button.innerHTML = busy ? '<span class="spinner" aria-hidden="true"></span> Please wait…' : label;
    }
    function showError(box, message) { box.textContent = message; box.hidden = false; box.scrollIntoView({ block: 'nearest' }); }

    // ---- Sign in ----
    $('#login-form').addEventListener('submit', async event => {
        event.preventDefault();
        const error = $('#login-error'); error.hidden = true;
        const identifier = $('#login-identifier').value.trim(), password = $('#login-password').value;
        if (!identifier || !password) return showError(error, 'Enter your username or email and your password.');
        setBusy($('#login-submit'), true);
        try {
            const { redirect } = await api('/auth/login', { method: 'POST', body: { identifier, password } });
            const next = new URLSearchParams(location.search).get('next');
            // Only allow a fixed list of local pages (prevents open-redirect abuse).
            location.href = ['/', '/index.html'].includes(next) ? next : redirect;
        } catch (err) {
            $('#login-password').value = '';
            showError(error, err.message);
            setBusy($('#login-submit'), false, 'Sign in');
        }
    });

    // ---- Sign up ----
    attachPasswordMeter($('#signup-password'), $('#signup-meter'), $('#signup-rules'));
    document.querySelectorAll('input[name="role"]').forEach(radio => radio.addEventListener('change', () => {
        const isShop = document.querySelector('input[name="role"]:checked').value === 'shopkeeper';
        $('#shop-field').hidden = !isShop;
        $('#shop-select').required = isShop;
    }));

    let shopsLoaded = false;
    async function loadShops() {
        if (shopsLoaded) return;
        try {
            const { stores } = await api('/public/stores');
            $('#shop-select').innerHTML = '<option value="">Select your shop…</option>' +
                stores.map(s => `<option value="${BALI.esc(s.store_number)}">${BALI.esc(s.store_number)}${s.name !== s.store_number ? ' — ' + BALI.esc(s.name) : ''}</option>`).join('');
            shopsLoaded = true;
        } catch { $('#shop-select').innerHTML = '<option value="">Could not load shops</option>'; }
    }

    $('#signup-form').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget, error = $('#signup-error'); error.hidden = true;
        const data = Object.fromEntries(new FormData(form));
        if (data.password !== data.confirm) return showError(error, 'The two passwords do not match.');
        if (BALI.passwordRules.some(([, test]) => !test(data.password))) return showError(error, 'Your password does not meet all the requirements yet.');
        if (data.role === 'shopkeeper' && !data.storeNumber) return showError(error, 'Select the shop you operate.');
        setBusy($('#signup-submit'), true);
        try {
            const { redirect } = await api('/auth/signup', { method: 'POST', body: {
                role: data.role, fullName: data.fullName, username: data.username, email: data.email, phone: data.phone,
                password: data.password, storeNumbers: data.role === 'shopkeeper' ? [data.storeNumber] : []
            } });
            location.href = redirect;
        } catch (err) {
            showError(error, err.message);
            setBusy($('#signup-submit'), false, 'Create account');
        }
    });
})();
