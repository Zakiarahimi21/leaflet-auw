(async () => {
    const user = await BALI.requireRole('shopkeeper');
    if (!user) return;
    const { api, esc, fmtDate, toast } = BALI;
    const { modal, confirmBox, storeFormHtml, bindStoreForm, accountView, statusBadge, stat } = BALI.dash;
    let shell;

    const shopCard = s => `
        <article class="shop-card">
            <div class="photo">${s.image_url ? `<img src="${esc(s.image_url)}" alt="Photo of ${esc(s.name)}">` : 'No photo yet'}</div>
            <div class="body">
                <h3>${esc(s.name)}</h3>
                <div class="meta"><span>Shop ${esc(s.store_number)}</span><span>·</span><span>${esc(s.category)}</span></div>
                <div>${statusBadge(s.open_status)}</div>
                <div class="meta"><span>♥ ${s.favorites} saved</span><span>·</span><span>${s.active_offers} running offer${s.active_offers === 1 ? '' : 's'}</span></div>
                <div class="row"><button class="btn btn-sm" data-edit="${esc(s.store_number)}">Edit shop</button><button class="btn btn-ghost btn-sm" data-offer="${esc(s.store_number)}">+ Offer</button><a class="btn btn-ghost btn-sm" href="/?store=${encodeURIComponent(s.store_number)}">On map</a></div>
            </div>
        </article>`;

    function editShop(s, after, all) {
        let read;
        modal({ eyebrow: `Shop ${s.store_number}`, title: 'Edit shop', submitLabel: 'Save changes',
            body: storeFormHtml(s, all.map(x => x.category)),
            onReady: form => { read = bindStoreForm(form, s); },
            onSubmit: async (form, close) => { await api(`/shop/stores/${encodeURIComponent(s.store_number)}`, { method: 'PUT', body: read() }); close(); toast('Shop updated'); after(); } });
    }

    function offerForm(stores, offer, after, presetStore) {
        const sel = offer?.storeNumber || presetStore || stores[0]?.store_number;
        modal({ eyebrow: 'Promotion', title: offer ? 'Edit offer' : 'New offer', submitLabel: offer ? 'Save offer' : 'Publish offer',
            body: `
            <label class="field">Shop<select name="storeNumber" ${offer ? 'disabled' : ''}>${stores.map(s => `<option value="${esc(s.store_number)}" ${s.store_number === sel ? 'selected' : ''}>${esc(s.store_number)} · ${esc(s.name)}</option>`).join('')}</select></label>
            <div class="field-row"><label class="field">Title<input name="title" required maxlength="120" value="${esc(offer?.title)}" placeholder="Winter clearance"></label>
            <label class="field">Badge <span class="hint">(e.g. 30% OFF)</span><input name="discountText" maxlength="40" value="${esc(offer?.discountText)}"></label></div>
            <label class="field">Details<textarea name="description" maxlength="500">${esc(offer?.description)}</textarea></label>
            <div class="field-row"><label class="field">Starts<input name="startsOn" type="date" value="${esc((offer?.startsOn || '').slice(0, 10))}"></label>
            <label class="field">Ends<input name="endsOn" type="date" value="${esc((offer?.endsOn || '').slice(0, 10))}"></label></div>
            <label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" name="isActive" ${offer?.isActive === false ? '' : 'checked'}> Visible to visitors</label>`,
            onSubmit: async (form, close) => {
                const f = new FormData(form);
                const body = { storeNumber: offer?.storeNumber || f.get('storeNumber'), title: f.get('title'), discountText: f.get('discountText'), description: f.get('description'),
                    startsOn: f.get('startsOn') || null, endsOn: f.get('endsOn') || null, isActive: f.has('isActive') };
                if (offer) await api(`/shop/offers/${offer.id}`, { method: 'PUT', body }); else await api('/shop/offers', { method: 'POST', body });
                close(); toast(offer ? 'Offer saved' : 'Offer published'); after();
            } });
    }

    async function overview(el) {
        const { stats, stores } = await api('/shop/overview');
        shell.setCount('claims', stats.pendingClaims);
        el.innerHTML = `<div class="page-head"><div><h1>Hello, ${esc((user.fullName || user.username).split(' ')[0])}</h1><p>Here is how your shop${stores.length === 1 ? '' : 's'} perform${stores.length === 1 ? 's' : ''}.</p></div></div>
            <div class="stats">${stat('My shops', stats.shops)}${stat('Visitors who saved my shops', stats.favorites)}${stat('Running offers', stats.activeOffers)}${stat('Pending access requests', stats.pendingClaims)}</div>
            ${stores.length ? `<div class="shop-grid" id="grid">${stores.map(shopCard).join('')}</div>` : `
            <div class="card stack"><h2>Waiting for approval</h2><p style="margin:0;color:var(--soft);line-height:1.6">${stats.pendingClaims ? 'Your request is with the mall administrator. Once they confirm that you run the shop, it will appear here and you can edit its details.' : 'You do not manage a shop yet. Send a request and an administrator will verify it.'}</p>
            <div><a class="btn" href="#claims">${stats.pendingClaims ? 'View my requests' : 'Request a shop'}</a></div></div>`}`;
        bindGrid(el, stores, () => overview(el));
    }

    function bindGrid(el, stores, after) {
        el.querySelector('#grid')?.addEventListener('click', event => {
            const b = event.target.closest('button'); if (!b) return;
            if (b.dataset.edit) editShop(stores.find(s => s.store_number === b.dataset.edit), after, stores);
            if (b.dataset.offer) offerForm(stores, null, after, b.dataset.offer);
        });
    }

    async function shops(el) {
        const { stores } = await api('/shop/stores');
        el.innerHTML = `<div class="page-head"><div><h1>My shops</h1><p>Keep your details, hours and photo up to date — visitors see this on the map.</p></div></div>
            ${stores.length ? `<div class="shop-grid" id="grid">${stores.map(shopCard).join('')}</div>` : '<div class="card empty">No approved shops yet. Request one under “Access requests”.</div>'}`;
        bindGrid(el, stores, () => shops(el));
    }

    async function offers(el) {
        const [{ offers: list }, { stores }] = await Promise.all([api('/shop/offers'), api('/shop/stores')]);
        const today = new Date().toISOString().slice(0, 10);
        el.innerHTML = `<div class="page-head"><div><h1>Offers</h1><p>Promotions appear in the shop details on the map and on visitors' dashboards.</p></div>
            <button class="btn" id="new" type="button" ${stores.length ? '' : 'disabled'}>+ New offer</button></div>
            <div id="list">${list.length ? list.map(o => {
                const ended = o.endsOn && o.endsOn.slice(0, 10) < today;
                return `<div class="offer-card"><div><h3>${o.discountText ? `<span class="discount">${esc(o.discountText)}</span>` : ''}${esc(o.title)}</h3><p>${esc(o.storeNumber)} · ${o.startsOn ? fmtDate(o.startsOn) : 'from now'} → ${o.endsOn ? fmtDate(o.endsOn) : 'no end date'} ${ended ? '<span class="badge badge-bad">ended</span>' : o.isActive ? '<span class="badge badge-ok">live</span>' : '<span class="badge">hidden</span>'}</p>${o.description ? `<p style="margin-top:6px">${esc(o.description)}</p>` : ''}</div>
                <div style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-edit="${o.id}">Edit</button> <button class="btn btn-danger btn-sm" data-del="${o.id}">Delete</button></div></div>`; }).join('')
                : `<div class="card empty">${stores.length ? 'No offers yet. Publish your first promotion.' : 'You need an approved shop before you can post offers.'}</div>`}</div>`;
        const again = () => offers(el);
        el.querySelector('#new')?.addEventListener('click', () => offerForm(stores, null, again));
        el.querySelector('#list').addEventListener('click', async event => {
            const b = event.target.closest('button'); if (!b) return;
            if (b.dataset.edit) offerForm(stores, list.find(o => String(o.id) === b.dataset.edit), again);
            if (b.dataset.del && await confirmBox('Delete this offer?', { okLabel: 'Delete', danger: true })) {
                try { await api(`/shop/offers/${b.dataset.del}`, { method: 'DELETE' }); toast('Offer deleted'); again(); } catch (e) { toast(e.message, 'error'); }
            }
        });
    }

    async function claims(el) {
        const [{ claims: list }, { stores: all }, { stores: mine }] = await Promise.all([api('/shop/claims'), api('/public/stores'), api('/shop/stores')]);
        const owned = new Set(mine.map(s => s.store_number));
        const pending = new Set(list.filter(c => c.status === 'pending').map(c => c.storeNumber));
        const available = all.filter(s => !owned.has(s.store_number) && !pending.has(s.store_number));
        shell.setCount('claims', pending.size);
        el.innerHTML = `<div class="page-head"><div><h1>Access requests</h1><p>An administrator confirms that you run a shop before you can edit it.</p></div></div>
            <div class="stack narrow">
                <form class="card stack" id="form" novalidate><h2>Request another shop</h2>
                    <div class="alert alert-error" data-error hidden role="alert"></div>
                    <label class="field">Shop<select name="storeNumber" required><option value="">Select a shop…</option>${available.map(s => `<option value="${esc(s.store_number)}">${esc(s.store_number)}${s.name !== s.store_number ? ' — ' + esc(s.name) : ''}</option>`).join('')}</select></label>
                    <label class="field">Note for the administrator <span class="hint">(optional)</span><input name="message" maxlength="300" placeholder="e.g. Trade licence no., or my manager's name"></label>
                    <div><button class="btn" type="submit">Send request</button></div></form>
                <div class="card"><h2>My requests</h2>${list.length ? `<ul class="activity">${list.map(c => `<li><span><b>${esc(c.storeNumber)}</b>${c.storeName && c.storeName !== c.storeNumber ? ' · ' + esc(c.storeName) : ''}</span><span>${statusBadge(c.status)} <small>${fmtDate(c.createdAt)}</small></span></li>`).join('')}</ul>` : '<p class="empty" style="padding:14px 0">No requests yet.</p>'}</div>
            </div>`;
        el.querySelector('#form').addEventListener('submit', async event => {
            event.preventDefault();
            const box = event.currentTarget.querySelector('[data-error]'); box.hidden = true;
            try { await api('/shop/claims', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) }); toast('Request sent'); claims(el); }
            catch (error) { box.textContent = error.message; box.hidden = false; }
        });
    }

    shell = BALI.dash.start({ user, roleLabel: 'Shopkeeper', views: [
        { id: 'overview', label: 'Overview', icon: '◧', render: overview },
        { id: 'shops', label: 'My shops', icon: '▢', render: shops },
        { id: 'offers', label: 'Offers', icon: '%', render: offers },
        { id: 'claims', label: 'Access requests', icon: '✓', render: claims },
        { id: 'account', label: 'My account', icon: '⚙', render: el => accountView(el, user) }
    ] });
})();
