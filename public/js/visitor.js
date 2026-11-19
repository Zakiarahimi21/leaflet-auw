(async () => {
    const user = await BALI.requireRole('visitor');
    if (!user) return;
    const { api, esc, fmtDate, toast } = BALI;
    const { accountView, statusBadge } = BALI.dash;

    async function saved(el) {
        const { favorites } = await api('/favorites');
        el.innerHTML = `<div class="page-head"><div><h1>Saved shops</h1><p>Your shortlist. Open the map and tap “Save” on any shop to add it here.</p></div><a class="btn" href="/">Open the map</a></div>
            ${favorites.length ? `<div class="shop-grid" id="grid">${favorites.map(s => `
                <article class="shop-card"><div class="photo">${s.image_url ? `<img src="${esc(s.image_url)}" alt="">` : 'No photo'}</div>
                <div class="body"><h3>${esc(s.name)}</h3><div class="meta"><span>Shop ${esc(s.store_number)}</span><span>·</span><span>${esc(s.category)}</span></div>
                <div>${statusBadge(s.open_status)} ${s.active_offers ? `<span class="badge badge-dark">${s.active_offers} offer${s.active_offers > 1 ? 's' : ''}</span>` : ''}</div>
                ${s.opening_hours ? `<div class="meta">${esc(s.opening_hours)}</div>` : ''}
                <div class="row"><a class="btn btn-sm" href="/?store=${encodeURIComponent(s.store_number)}">Find on map</a><button class="btn btn-ghost btn-sm" data-remove="${esc(s.store_number)}">Remove</button></div></div></article>`).join('')}</div>`
            : '<div class="card empty">You have not saved any shops yet.</div>'}`;
        el.querySelector('#grid')?.addEventListener('click', async event => {
            const b = event.target.closest('[data-remove]'); if (!b) return;
            try { await api(`/favorites/${encodeURIComponent(b.dataset.remove)}`, { method: 'DELETE' }); toast('Removed'); saved(el); } catch (e) { toast(e.message, 'error'); }
        });
    }

    async function deals(el) {
        const [{ offers }, { favorites }] = await Promise.all([api('/public/offers'), api('/favorites')]);
        const mine = new Set(favorites.map(f => f.store_number));
        el.innerHTML = `<div class="page-head"><div><h1>Deals in the mall</h1><p>Offers running right now.</p></div></div>
            ${offers.length ? offers.map(o => `<div class="offer-card"><div><h3>${o.discount_text ? `<span class="discount">${esc(o.discount_text)}</span>` : ''}${esc(o.title)}</h3>
                <p><b>${esc(o.store_name)}</b> · shop ${esc(o.store_number)}${o.ends_on ? ' · until ' + fmtDate(o.ends_on) : ''}</p>${o.description ? `<p style="margin-top:6px">${esc(o.description)}</p>` : ''}</div>
                <div style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-save="${esc(o.store_number)}" ${mine.has(o.store_number) ? 'disabled' : ''}>${mine.has(o.store_number) ? '♥ Saved' : '♡ Save shop'}</button> <a class="btn btn-sm" href="/?store=${encodeURIComponent(o.store_number)}">Map</a></div></div>`).join('')
            : '<div class="card empty">No offers are running at the moment. Check back soon.</div>'}`;
        el.addEventListener('click', async event => {
            const b = event.target.closest('[data-save]'); if (!b) return;
            try { await api(`/favorites/${encodeURIComponent(b.dataset.save)}`, { method: 'PUT' }); b.textContent = '♥ Saved'; b.disabled = true; toast('Shop saved'); } catch (e) { toast(e.message, 'error'); }
        });
    }

    BALI.dash.start({ user, roleLabel: 'Visitor', views: [
        { id: 'saved', label: 'Saved shops', icon: '♥', render: saved },
        { id: 'deals', label: 'Deals', icon: '%', render: deals },
        { id: 'account', label: 'My account', icon: '⚙', render: el => accountView(el, user) }
    ] });
})();
