// Dashboard toolkit shared by the admin, shopkeeper and visitor pages.
(() => {
    const { api, esc, initials, toast, logout } = BALI;

    // ---- Shell: top bar, side navigation and hash routing ----
    function start({ user, roleLabel, views }) {
        document.body.insertAdjacentHTML('afterbegin', `
            <header class="dash-top">
                <button class="btn btn-ghost btn-sm nav-toggle" id="nav-toggle" type="button" aria-label="Open menu">☰</button>
                <a class="brand" href="/"><span class="brand-pin" aria-hidden="true">●</span><span class="hide-sm">BALI - ARCADE</span></a>
                <span class="role-pill">${esc(roleLabel)}</span>
                <span class="spacer"></span>
                <a class="btn btn-ghost btn-sm" href="/">View map</a>
                <span class="user-chip"><span class="avatar">${esc(initials(user))}</span><span class="name">${esc(user.fullName || user.username)}</span></span>
                <button class="btn btn-ghost btn-sm" id="logout-btn" type="button">Log out</button>
            </header>
            <div class="dash-body"><nav class="dash-nav" id="nav" aria-label="Dashboard"></nav><main class="dash-main" id="main" tabindex="-1"></main></div>`);
        const nav = document.getElementById('nav'), main = document.getElementById('main');
        document.getElementById('logout-btn').addEventListener('click', logout);
        document.getElementById('nav-toggle').addEventListener('click', () => nav.classList.toggle('open'));
        nav.innerHTML = views.map(view => `<button type="button" data-view="${view.id}"><span class="ico" aria-hidden="true">${view.icon}</span>${esc(view.label)}<span class="count" data-count="${view.id}" hidden></span></button>`).join('');

        let token = 0;
        async function show() {
            const id = views.some(view => view.id === location.hash.slice(1)) ? location.hash.slice(1) : views[0].id;
            nav.querySelectorAll('button').forEach(b => (b.dataset.view === id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
            nav.classList.remove('open');
            const current = ++token;
            main.innerHTML = '<p class="empty">Loading…</p>';
            try {
                const view = views.find(v => v.id === id);
                const holder = document.createElement('div');
                await view.render(holder);
                if (current === token) { main.replaceChildren(holder); main.focus({ preventScroll: true }); }
            } catch (error) {
                if (error.status === 401) return location.replace('/login.html');
                main.innerHTML = `<div class="alert alert-error">${esc(error.message)}</div>`;
            }
        }
        nav.addEventListener('click', event => {
            const button = event.target.closest('button[data-view]');
            if (!button) return;
            if (location.hash.slice(1) === button.dataset.view) show(); else location.hash = button.dataset.view;
        });
        window.addEventListener('hashchange', show);
        show();
        return { refresh: show, setCount(id, n) { const el = nav.querySelector(`[data-count="${id}"]`); if (el) { el.textContent = n; el.hidden = !n; } } };
    }

    // ---- Dialogs ----
    function modal({ eyebrow = '', title, body, submitLabel = 'Save', onSubmit, onReady, cancelLabel = 'Cancel' }) {
        const dialog = document.createElement('dialog');
        dialog.className = 'modal';
        dialog.innerHTML = `<form novalidate>
            <div class="modal-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div><button class="icon-btn" type="button" data-close aria-label="Close">×</button></div>
            <div class="alert alert-error" data-error role="alert" hidden></div>
            ${body}
            <div class="modal-actions">${cancelLabel ? `<button class="btn btn-ghost" type="button" data-close>${esc(cancelLabel)}</button>` : ''}${onSubmit ? `<button class="btn" type="submit">${esc(submitLabel)}</button>` : ''}</div>
        </form>`;
        document.body.appendChild(dialog);
        const form = dialog.querySelector('form'), errorBox = dialog.querySelector('[data-error]');
        const close = () => { dialog.close(); dialog.remove(); };
        dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
        dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (!onSubmit) return close();
            const button = form.querySelector('button[type=submit]');
            errorBox.hidden = true; button.disabled = true;
            try { await onSubmit(form, close); }
            catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; errorBox.scrollIntoView({ block: 'nearest' }); button.disabled = false; }
        });
        dialog.showModal();
        onReady?.(form, dialog);
        form.querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea')?.focus();
        return dialog;
    }

    function confirmBox(message, { okLabel = 'Confirm', danger = false, title = 'Are you sure?' } = {}) {
        return new Promise(resolve => {
            const dialog = modal({ title, body: `<p style="margin:0;color:var(--soft);line-height:1.5">${esc(message)}</p>`, submitLabel: okLabel,
                onSubmit: async (_, close) => { close(); resolve(true); } });
            if (danger) dialog.querySelector('button[type=submit]').style.background = 'var(--danger)';
            dialog.addEventListener('close', () => resolve(false));
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => resolve(false)));
        });
    }

    // ---- Checkbox list with a search box (used to pick shops) ----
    function storePicker(stores, selected = []) {
        const chosen = new Set(selected.map(String));
        const wrap = document.createElement('div');
        wrap.className = 'picker';
        wrap.innerHTML = `<input type="search" placeholder="Filter shops…" aria-label="Filter shops"><div class="picker-list"></div>`;
        const list = wrap.querySelector('.picker-list'), filter = wrap.querySelector('input');
        list.innerHTML = stores.map(s => `<label data-text="${esc((s.store_number + ' ' + s.name).toLowerCase())}"><input type="checkbox" value="${esc(s.store_number)}" ${chosen.has(String(s.store_number)) ? 'checked' : ''}>${esc(s.store_number)}${s.name && s.name !== s.store_number ? ' · ' + esc(s.name) : ''}</label>`).join('');
        filter.addEventListener('input', () => list.querySelectorAll('label').forEach(l => { l.hidden = !l.dataset.text.includes(filter.value.toLowerCase()); }));
        wrap.values = () => [...list.querySelectorAll('input:checked')].map(i => i.value);
        return wrap;
    }

    // ---- Store editing form (admin + shopkeeper) ----
    const BASE_CATEGORIES = ["Children's Clothing", "Women's Clothing", "Men's Clothing", 'Tech Store', 'Bags & Accessories', 'Food & Drinks', 'retail'];
    function storeFormHtml(store, categories = []) {
        const cats = [...new Set([...BASE_CATEGORIES, ...categories])];
        const statuses = [['open', 'Open'], ['closed', 'Closed'], ['renovation', 'Under renovation']];
        return `
            <div class="field-row">
                <label class="field">Shop name<input name="name" required maxlength="120" value="${esc(store.name)}"></label>
                <label class="field">Category<input name="category" list="cat-list" maxlength="100" value="${esc(store.category)}"><datalist id="cat-list">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
            </div>
            <label class="field">Description<textarea name="description" maxlength="1500" placeholder="What makes your shop special?">${esc(store.description)}</textarea></label>
            <div class="field-row">
                <label class="field">Opening hours<input name="opening_hours" maxlength="200" placeholder="Sat–Thu 10:00–21:00" value="${esc(store.opening_hours)}"></label>
                <label class="field">Status<select name="open_status">${statuses.map(([v, l]) => `<option value="${v}" ${store.open_status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            </div>
            <div class="field-row">
                <label class="field">Phone<input name="phone" type="tel" maxlength="30" value="${esc(store.phone)}"></label>
                <label class="field">Email<input name="email" type="email" maxlength="100" value="${esc(store.email)}"></label>
            </div>
            <label class="field">Website<input name="website" type="url" maxlength="255" placeholder="https://" value="${esc(store.website)}"></label>
            <label class="field">Products &amp; brands<input name="products" maxlength="600" placeholder="Shirts, jeans, accessories" value="${esc(store.products)}"></label>
            <div class="field">Shop photo
                <div class="img-edit"><div class="thumb" data-thumb>${store.image_url ? `<img src="${esc(store.image_url)}" alt="">` : 'No photo'}</div>
                    <div style="display:grid;gap:6px"><input type="file" data-file accept="image/png,image/jpeg,image/webp,image/gif" style="min-height:0;padding:6px"><button class="btn btn-ghost btn-sm" type="button" data-remove-photo ${store.image_url ? '' : 'hidden'}>Remove photo</button><span class="hint">PNG, JPEG, WEBP or GIF · max 1.5 MB</span></div></div>
            </div>`;
    }
    // Wires up the photo controls; returns a function that reads the form into an API payload.
    function bindStoreForm(form, store) {
        let image = null, remove = false;
        const thumb = form.querySelector('[data-thumb]'), removeBtn = form.querySelector('[data-remove-photo]');
        form.querySelector('[data-file]').addEventListener('change', async event => {
            const file = event.target.files[0]; if (!file) return;
            try { image = await BALI.readImage(file); remove = false; thumb.innerHTML = `<img src="${image}" alt="">`; removeBtn.hidden = false; }
            catch (error) { event.target.value = ''; toast(error.message, 'error'); }
        });
        removeBtn.addEventListener('click', () => { image = null; remove = true; thumb.textContent = 'No photo'; removeBtn.hidden = true; form.querySelector('[data-file]').value = ''; });
        return () => {
            const f = new FormData(form);
            const payload = {};
            for (const key of ['name', 'category', 'description', 'opening_hours', 'phone', 'email', 'website', 'products', 'open_status']) payload[key] = f.get(key) ?? '';
            if (image) payload.image_url = image; else if (remove) payload.remove_image = true;
            return payload;
        };
    }

    // ---- Account view: profile + password change (all roles) ----
    async function accountView(el, user, onProfile) {
        el.innerHTML = `
            <div class="page-head"><div><h1>My account</h1><p>Update your details and keep your password strong.</p></div></div>
            <div class="stack narrow">
                <form class="card stack" id="profile-form" novalidate>
                    <h2>Profile</h2>
                    <div class="alert alert-error" data-error hidden role="alert"></div>
                    <label class="field">Username<input value="${esc(user.username)}" disabled></label>
                    <label class="field">Full name<input name="fullName" required maxlength="100" value="${esc(user.fullName)}"></label>
                    <div class="field-row"><label class="field">Email<input name="email" type="email" required maxlength="100" value="${esc(user.email)}"></label>
                    <label class="field">Phone<input name="phone" type="tel" maxlength="30" value="${esc(user.phone)}"></label></div>
                    <div><button class="btn" type="submit">Save profile</button></div>
                </form>
                <form class="card stack" id="password-form" novalidate>
                    <h2>Change password</h2>
                    <div class="alert alert-error" data-error hidden role="alert"></div>
                    <label class="field">Current password<input name="currentPassword" type="password" autocomplete="current-password" required></label>
                    <label class="field">New password<input name="newPassword" type="password" autocomplete="new-password" required maxlength="72">
                        <span class="meter" data-meter data-level="0"><span></span><span></span><span></span><span></span></span><ul class="rules" data-rules></ul></label>
                    <label class="field">Confirm new password<input name="confirm" type="password" autocomplete="new-password" required maxlength="72"></label>
                    <p class="hint" style="margin:0;color:var(--soft);font-size:12px">Changing your password signs you out on every other device.</p>
                    <div><button class="btn" type="submit">Update password</button></div>
                </form>
            </div>`;
        BALI.attachPasswordMeter(el.querySelector('[name=newPassword]'), el.querySelector('[data-meter]'), el.querySelector('[data-rules]'));
        const bind = (form, handler) => form.addEventListener('submit', async event => {
            event.preventDefault();
            const box = form.querySelector('[data-error]'); box.hidden = true;
            try { await handler(Object.fromEntries(new FormData(form)), form); }
            catch (error) { box.textContent = error.message; box.hidden = false; }
        });
        bind(el.querySelector('#profile-form'), async data => {
            const { user: updated } = await api('/auth/me', { method: 'PUT', body: data });
            Object.assign(user, updated); onProfile?.(updated); toast('Profile saved');
        });
        bind(el.querySelector('#password-form'), async (data, form) => {
            if (data.newPassword !== data.confirm) throw new Error('The new passwords do not match.');
            await api('/auth/password', { method: 'PUT', body: { currentPassword: data.currentPassword, newPassword: data.newPassword } });
            form.reset(); form.querySelector('[data-meter]').dataset.level = '0'; toast('Password updated');
        });
    }

    const statusBadge = (status) => `<span class="badge ${{ active: 'badge-ok', open: 'badge-ok', approved: 'badge-ok', pending: 'badge-warn', renovation: 'badge-warn', suspended: 'badge-bad', closed: 'badge-bad', rejected: 'badge-bad' }[status] || ''}">${esc(status === 'renovation' ? 'renovation' : status)}</span>`;
    const stat = (label, value, sub = '', cls = '') => `<div class="stat ${cls}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>`;
    const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

    Object.assign(BALI, { dash: { start, modal, confirmBox, storePicker, storeFormHtml, bindStoreForm, accountView, statusBadge, stat, debounce } });
})();
