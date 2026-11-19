(async () => {
    const user = await BALI.requireRole('admin');
    if (!user) return;
    const { api, esc, fmtDate, fmtDateTime, initials, toast } = BALI;
    const { modal, confirmBox, storePicker, storeFormHtml, bindStoreForm, accountView, statusBadge, stat, debounce } = BALI.dash;
    let shell;

    const refreshClaimCount = async () => {
        try { const { claims } = await api('/admin/claims?status=pending'); shell.setCount('claims', claims.length); } catch { /* badge only */ }
    };

    // ---------------- Overview ----------------
    async function overview(el) {
        const { counts: c, byCategory, signups, recentActivity } = await api('/admin/overview');
        const maxSignup = Math.max(1, ...signups.map(s => s.count)), maxCat = Math.max(1, ...byCategory.map(s => s.count));
        el.innerHTML = `
            <div class="page-head"><div><h1>Overview</h1><p>What is happening across the mall right now.</p></div></div>
            <div class="stats">
                ${stat('Shops on the map', c.stores, `${c.owned_stores} have an owner · ${c.stores - c.owned_stores} unassigned`)}
                ${stat('Shopkeepers', c.shopkeepers)}
                ${stat('Visitors', c.visitors)}
                ${stat('Pending shop requests', c.pending_claims, c.pending_claims ? 'Waiting for your review' : 'All clear', c.pending_claims ? 'alert-stat' : '')}
                ${stat('Running offers', c.active_offers)}
                ${stat('Saved favourites', c.favorites)}
                ${stat('Suspended accounts', c.suspended)}
                ${stat('Failed logins (24h)', c.failed_logins_24h, c.failed_logins_24h > 20 ? 'Unusually high' : 'Normal', c.failed_logins_24h > 20 ? 'alert-stat' : '')}
            </div>
            <div class="grid-2">
                <section class="card"><h2>New accounts — last 7 days</h2><div class="bars">${signups.map(s => `<div title="${s.count}"><span>${s.count}</span><i style="height:${Math.round((s.count / maxSignup) * 100)}%"></i><span>${esc(s.day.split(' ')[1])}</span></div>`).join('')}</div></section>
                <section class="card"><h2>Shops by category</h2>${byCategory.map(x => `<div class="hbar"><span>${esc(x.category)}</span><span class="track"><i style="width:${Math.round((x.count / maxCat) * 100)}%"></i></span><b>${x.count}</b></div>`).join('')}</section>
            </div>
            <section class="card" style="margin-top:16px"><h2>Recent activity</h2><ul class="activity">${recentActivity.length ? recentActivity.map(a => `<li><span><b>${esc(a.username || 'anonymous')}</b> · ${esc(a.action)}${a.target ? ' · ' + esc(a.target) : ''}</span><small>${fmtDateTime(a.createdAt)}</small></li>`).join('') : '<li>No activity yet.</li>'}</ul></section>`;
        shell.setCount('claims', c.pending_claims);
    }

    // ---------------- Users ----------------
    async function users(el) {
        const { stores } = await api('/public/stores');
        el.innerHTML = `
            <div class="page-head"><div><h1>Users</h1><p>Visitors, shopkeepers and administrators.</p></div><button class="btn" id="add-user" type="button">+ Add user</button></div>
            <div class="toolbar">
                <input type="search" id="q" placeholder="Search name, username or email…" aria-label="Search users">
                <select id="f-role" aria-label="Role"><option value="">All roles</option><option value="admin">Admins</option><option value="shopkeeper">Shopkeepers</option><option value="visitor">Visitors</option></select>
                <select id="f-status" aria-label="Status"><option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
            </div>
            <div class="table-wrap"><table class="data"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Shops</th><th>Last sign-in</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>`;
        let list = [];
        const rows = el.querySelector('#rows');
        const load = async () => {
            const params = new URLSearchParams({ q: el.querySelector('#q').value, role: el.querySelector('#f-role').value, status: el.querySelector('#f-status').value });
            list = (await api('/admin/users?' + params)).users;
            rows.innerHTML = list.length ? list.map(u => `<tr>
                <td><div class="who"><span class="avatar">${esc(initials(u))}</span><div><b>${esc(u.fullName || u.username)}</b><small>@${esc(u.username)} · ${esc(u.email)}</small></div></div></td>
                <td><span class="badge ${u.role === 'admin' ? 'badge-dark' : ''}">${esc(u.role)}</span></td>
                <td>${statusBadge(u.status)}${u.locked ? ' <span class="badge badge-warn">locked</span>' : ''}</td>
                <td>${u.role === 'shopkeeper' ? (u.storeIds.length ? esc(u.storeIds.join(', ')) : '<span style="color:var(--soft)">none yet</span>') : '—'}</td>
                <td>${fmtDateTime(u.lastLoginAt)}</td>
                <td class="actions">${u.role === 'admin' ? '<span style="color:var(--soft);font-size:12px">Managed via CLI</span>' :
                    `<button class="btn btn-ghost btn-sm" data-edit="${u.id}">Edit</button><button class="btn btn-ghost btn-sm" data-reset="${u.id}">Reset password</button><button class="btn btn-danger btn-sm" data-del="${u.id}">Delete</button>`}</td></tr>`).join('')
                : '<tr><td colspan="6" class="empty">No users match these filters.</td></tr>';
        };
        el.querySelector('#q').addEventListener('input', debounce(load));
        el.querySelectorAll('select').forEach(s => s.addEventListener('change', load));

        const userForm = (u = null) => `
            ${u ? `<p style="margin:0;color:var(--soft);font-size:13px">Username: <b>@${esc(u.username)}</b></p>` : `
            <div class="field-row"><label class="field">Role<select name="role"><option value="shopkeeper">Shopkeeper</option><option value="visitor">Visitor</option></select></label>
            <label class="field">Username<input name="username" required minlength="3" maxlength="30" autocomplete="off"></label></div>`}
            <div class="field-row"><label class="field">Full name<input name="fullName" required maxlength="100" value="${esc(u?.fullName)}"></label>
            <label class="field">Phone<input name="phone" maxlength="30" value="${esc(u?.phone)}"></label></div>
            <label class="field">Email<input name="email" type="email" required maxlength="100" value="${esc(u?.email)}"></label>
            ${u ? `<label class="field">Status<select name="status"><option value="active" ${u.status === 'active' ? 'selected' : ''}>Active</option><option value="suspended" ${u.status === 'suspended' ? 'selected' : ''}>Suspended — cannot sign in</option></select></label>` :
            `<label class="field">Initial password<input name="password" type="password" autocomplete="new-password" required maxlength="72"><span class="meter" data-meter data-level="0"><span></span><span></span><span></span><span></span></span><ul class="rules" data-rules></ul></label>`}
            <div class="field" data-picker-field>Assigned shops</div>`;

        const openForm = u => {
            const isNew = !u;
            let picker;
            modal({ eyebrow: 'Account', title: isNew ? 'Add user' : 'Edit user', body: userForm(u), submitLabel: isNew ? 'Create user' : 'Save changes',
                onReady: (form) => {
                    picker = storePicker(stores, u?.storeIds || []);
                    form.querySelector('[data-picker-field]').appendChild(picker);
                    if (isNew) {
                        BALI.attachPasswordMeter(form.querySelector('[name=password]'), form.querySelector('[data-meter]'), form.querySelector('[data-rules]'));
                        const role = form.querySelector('[name=role]');
                        role.addEventListener('change', () => { form.querySelector('[data-picker-field]').hidden = role.value !== 'shopkeeper'; });
                    } else form.querySelector('[data-picker-field]').hidden = u.role !== 'shopkeeper';
                },
                onSubmit: async (form, close) => {
                    const data = Object.fromEntries(new FormData(form));
                    if (isNew) await api('/admin/users', { method: 'POST', body: { ...data, storeIds: data.role === 'shopkeeper' ? picker.values() : [] } });
                    else await api(`/admin/users/${u.id}`, { method: 'PUT', body: { ...data, storeIds: u.role === 'shopkeeper' ? picker.values() : undefined } });
                    close(); toast(isNew ? 'User created' : 'User updated'); load();
                } });
        };
        el.querySelector('#add-user').addEventListener('click', () => openForm());
        rows.addEventListener('click', async event => {
            const b = event.target.closest('button'); if (!b) return;
            const u = list.find(x => String(x.id) === (b.dataset.edit || b.dataset.reset || b.dataset.del));
            if (b.dataset.edit) openForm(u);
            if (b.dataset.reset && await confirmBox(`Create a temporary password for ${u.username}? They will be signed out everywhere.`, { okLabel: 'Reset password' })) {
                try {
                    const { temporaryPassword } = await api(`/admin/users/${u.id}/reset-password`, { method: 'POST' });
                    modal({ eyebrow: 'Temporary password', title: u.username, cancelLabel: 'Done',
                        body: `<div class="alert alert-info">Share this password privately. It is shown only once — ask the user to change it after signing in.</div><div class="secret">${esc(temporaryPassword)}</div>` });
                } catch (error) { toast(error.message, 'error'); }
            }
            if (b.dataset.del && await confirmBox(`Permanently delete ${u.username}? Their saved shops and requests are removed too.`, { okLabel: 'Delete user', danger: true })) {
                try { await api(`/admin/users/${u.id}`, { method: 'DELETE' }); toast('User deleted'); load(); } catch (error) { toast(error.message, 'error'); }
            }
        });
        await load();
    }

    // ---------------- Stores ----------------
    async function stores(el) {
        el.innerHTML = `
            <div class="page-head"><div><h1>Shops</h1><p>Edit shop details, status and owners.</p></div></div>
            <div class="toolbar"><input type="search" id="q" placeholder="Search by number, name or category…" aria-label="Search shops"></div>
            <div class="table-wrap"><table class="data"><thead><tr><th>Shop</th><th>Category</th><th>Status</th><th>Owners</th><th>♥</th><th>Offers</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>`;
        let list = [];
        const rows = el.querySelector('#rows');
        const load = async () => {
            list = (await api('/admin/stores?q=' + encodeURIComponent(el.querySelector('#q').value))).stores;
            rows.innerHTML = list.length ? list.map(s => `<tr>
                <td><b>${esc(s.store_number)}</b>${s.name !== s.store_number ? `<br><small style="color:var(--soft)">${esc(s.name)}</small>` : ''}</td>
                <td>${esc(s.category)}</td><td>${statusBadge(s.open_status)}</td>
                <td>${s.owners.length ? esc(s.owners.join(', ')) : '<span style="color:var(--soft)">unassigned</span>'}</td>
                <td>${s.favorites}</td><td>${s.active_offers}</td>
                <td class="actions"><button class="btn btn-ghost btn-sm" data-edit="${esc(s.store_number)}">Edit</button></td></tr>`).join('')
                : '<tr><td colspan="7" class="empty">No shops found.</td></tr>';
        };
        el.querySelector('#q').addEventListener('input', debounce(load));
        rows.addEventListener('click', async event => {
            const b = event.target.closest('[data-edit]'); if (!b) return;
            const s = list.find(x => x.store_number === b.dataset.edit);
            const { users: keepers } = await api('/admin/users?role=shopkeeper');
            let read;
            modal({ eyebrow: `Shop ${s.store_number}`, title: 'Edit shop', submitLabel: 'Save shop',
                body: storeFormHtml(s, list.map(x => x.category)) + `<div class="field">Owners (shopkeepers)<div class="picker"><div class="picker-list" data-owners>${keepers.length ? keepers.map(k => `<label><input type="checkbox" value="${k.id}" ${s.owners.includes(k.username) ? 'checked' : ''}>${esc(k.fullName || k.username)}</label>`).join('') : '<span class="hint">No shopkeeper accounts yet.</span>'}</div></div></div>`,
                onReady: form => { read = bindStoreForm(form, s); },
                onSubmit: async (form, close) => {
                    await api(`/admin/stores/${encodeURIComponent(s.store_number)}`, { method: 'PUT', body: read() });
                    await api(`/admin/stores/${encodeURIComponent(s.store_number)}/owners`, { method: 'PUT', body: { userIds: [...form.querySelectorAll('[data-owners] input:checked')].map(i => Number(i.value)) } });
                    close(); toast('Shop saved'); load();
                } });
        });
        await load();
    }

    // ---------------- Requests ----------------
    async function claims(el) {
        const render = async status => {
            const { claims: list } = await api('/admin/claims?status=' + status);
            el.querySelector('#claims').innerHTML = list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Applicant</th><th>Shop</th><th>Message</th><th>Requested</th><th></th></tr></thead><tbody>${list.map(c => `<tr>
                <td><b>${esc(c.fullName || c.username)}</b><br><small style="color:var(--soft)">@${esc(c.username)} · ${esc(c.email)}</small></td>
                <td><b>${esc(c.storeNumber)}</b>${c.storeName && c.storeName !== c.storeNumber ? '<br><small>' + esc(c.storeName) + '</small>' : ''}</td>
                <td>${esc(c.message || '—')}</td><td>${fmtDate(c.createdAt)}</td>
                <td class="actions">${status === 'pending' ? `<button class="btn btn-sm" data-act="approve" data-id="${c.id}">Approve</button><button class="btn btn-danger btn-sm" data-act="reject" data-id="${c.id}">Reject</button>` : statusBadge(status)}</td></tr>`).join('')}</tbody></table></div>`
                : `<div class="card empty">No ${status} requests.</div>`;
            if (status === 'pending') shell.setCount('claims', list.length);
        };
        el.innerHTML = `<div class="page-head"><div><h1>Shop requests</h1><p>Shopkeepers ask for access to a shop. Check they really run it, then approve.</p></div></div>
            <div class="toolbar"><select id="status" aria-label="Status"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div><div id="claims"></div>`;
        el.querySelector('#status').addEventListener('change', e => render(e.target.value));
        el.querySelector('#claims').addEventListener('click', async event => {
            const b = event.target.closest('[data-act]'); if (!b) return;
            try { await api(`/admin/claims/${b.dataset.id}/${b.dataset.act}`, { method: 'POST' }); toast(b.dataset.act === 'approve' ? 'Access granted' : 'Request rejected'); render(el.querySelector('#status').value); }
            catch (error) { toast(error.message, 'error'); }
        });
        await render('pending');
    }

    // ---------------- Offers ----------------
    async function offers(el) {
        const render = async () => {
            const { offers: list } = await api('/admin/offers');
            el.querySelector('#list').innerHTML = list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Offer</th><th>Shop</th><th>Valid</th><th>Status</th><th></th></tr></thead><tbody>${list.map(o => `<tr>
                <td><b>${esc(o.title)}</b>${o.discountText ? ` <span class="discount">${esc(o.discountText)}</span>` : ''}<br><small style="color:var(--soft)">${esc(o.description || '')}</small></td>
                <td>${esc(o.storeNumber)}</td><td>${o.startsOn ? fmtDate(o.startsOn) : 'now'} → ${o.endsOn ? fmtDate(o.endsOn) : 'open-ended'}</td>
                <td>${statusBadge(o.isActive ? 'active' : 'suspended').replace('suspended', 'hidden')}</td>
                <td class="actions"><button class="btn btn-ghost btn-sm" data-toggle="${o.id}" data-on="${o.isActive}">${o.isActive ? 'Hide' : 'Show'}</button><button class="btn btn-danger btn-sm" data-del="${o.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="card empty">No offers have been posted yet.</div>';
        };
        el.innerHTML = `<div class="page-head"><div><h1>Offers</h1><p>Moderate promotions posted by shopkeepers.</p></div></div><div id="list"></div>`;
        el.querySelector('#list').addEventListener('click', async event => {
            const b = event.target.closest('button'); if (!b) return;
            try {
                if (b.dataset.toggle) await api(`/admin/offers/${b.dataset.toggle}`, { method: 'PUT', body: { isActive: b.dataset.on !== 'true' } });
                else if (await confirmBox('Delete this offer permanently?', { okLabel: 'Delete', danger: true })) await api(`/admin/offers/${b.dataset.del}`, { method: 'DELETE' }); else return;
                render();
            } catch (error) { toast(error.message, 'error'); }
        });
        await render();
    }

    // ---------------- Audit ----------------
    async function audit(el) {
        el.innerHTML = `<div class="page-head"><div><h1>Security log</h1><p>Every sign-in, failed attempt and administrative change.</p></div></div>
            <div class="toolbar"><input type="search" id="q" placeholder="Filter by action, user or target (e.g. login.failed)…" aria-label="Filter log"></div>
            <div class="table-wrap"><table class="data"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Target</th><th>IP</th></tr></thead><tbody id="rows"></tbody></table></div>`;
        const load = async () => {
            const { entries } = await api('/admin/audit?q=' + encodeURIComponent(el.querySelector('#q').value));
            el.querySelector('#rows').innerHTML = entries.length ? entries.map(e => `<tr><td>${fmtDateTime(e.createdAt)}</td><td>${esc(e.username || '—')}</td>
                <td><span class="badge ${/failed|blocked|suspend|delete/.test(e.action) ? 'badge-bad' : ''}">${esc(e.action)}</span></td><td>${esc(e.target || '')}</td><td>${esc(e.ip || '')}</td></tr>`).join('')
                : '<tr><td colspan="5" class="empty">Nothing logged yet.</td></tr>';
        };
        el.querySelector('#q').addEventListener('input', debounce(load));
        await load();
    }

    shell = BALI.dash.start({ user, roleLabel: 'Administrator', views: [
        { id: 'overview', label: 'Overview', icon: '◧', render: overview },
        { id: 'users', label: 'Users', icon: '☺', render: users },
        { id: 'shops', label: 'Shops', icon: '▢', render: stores },
        { id: 'claims', label: 'Shop requests', icon: '✓', render: claims },
        { id: 'offers', label: 'Offers', icon: '%', render: offers },
        { id: 'audit', label: 'Security log', icon: '⚑', render: audit },
        { id: 'account', label: 'My account', icon: '⚙', render: el => accountView(el, user) }
    ] });
    refreshClaimCount();
})();
