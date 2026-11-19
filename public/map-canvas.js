const API_BASE = ''; // same origin: the session cookie is only sent to the server that issued it
const planWidth = 1440;
const planHeight = 1024;
const floorBounds = [[0, 0], [planHeight, planWidth]];
let floorLabel = 'First Floor';
const iconRoot = 'icons/';
const categories = [['childrens-clothing', "Children's Clothing"], ['parking', 'Parking'], ['tech-store', 'Tech Store'], ['bags-accessories', 'Bags & Accessories'], ['elevator', 'Elevator'], ['restroom', 'Restroom'], ['escalator', 'Escalator'], ['womens-clothing', "Women's Clothing"], ['mens-clothing', "Men's Clothing"]];
const map = L.map('map', { crs: L.CRS.Simple, minZoom: -1, maxZoom: 2, zoomSnap: 0.5, zoomControl: false });
L.imageOverlay('first_floor.png', floorBounds).addTo(map);
let storeLayer;
let allFeatures = [];
let selectedLayer;
let activeCategory = null;
const featureMarkers = new Map();
const featureLayers = new Map();
let currentFeature = null;
let creatingStore = false;
let newStoreLocation = null;
let pendingImage = null;
let currentUser = null; // filled from /api/auth/me (httpOnly session cookie)
let shopInfoToken = 0;
let favoriteSet = new Set();

function canEdit(feature) {
    if (!currentUser || !feature) return false;
    if (currentUser.role === 'admin') return true;
    if (currentUser.role === 'shopkeeper') {
        const ownedStoreIds = (currentUser.storeIds || []).map(storeId => String(storeId).trim().toLowerCase());
        const featureStoreId = String(feature.properties?.store_id || '').trim().toLowerCase();
        return ownedStoreIds.includes(featureStoreId);
    }
    return false;
}
const DASHBOARD_URL = { admin: '/admin.html', shopkeeper: '/shopkeeper.html', visitor: '/visitor.html' };
async function apiFetch(path, options = {}) {
    return fetch(`${API_BASE}${path}`, {
        credentials: 'same-origin',
        ...options,
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(options.headers || {}) }
    });
}
function updateAuthUi() {
    const loggedIn = Boolean(currentUser);
    document.querySelector('#login-button').hidden = loggedIn;
    document.querySelector('#profile-button').hidden = !loggedIn;
    document.querySelector('.profile-menu-wrap').hidden = !loggedIn;
    const label = loggedIn ? (currentUser.fullName || currentUser.username) : 'Profile';
    document.querySelector('#profile-avatar').textContent = loggedIn ? String(label).charAt(0).toUpperCase() : 'U';
    document.querySelector('#profile-button-name').textContent = label;
    document.querySelector('#profile-menu-name').textContent = label;
    document.querySelector('#profile-menu-role').textContent = loggedIn ? currentUser.role : '';
    if (loggedIn) document.querySelector('#dashboard-link').href = DASHBOARD_URL[currentUser.role] || '/';
    document.querySelector('#edit-store').hidden = !canEdit(currentFeature);
    if (!loggedIn) document.querySelector('#profile-menu').hidden = true;
    updateFavoriteButton();
}
async function logout() {
    try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch (error) { /* the cookie is rejected server-side anyway */ }
    currentUser = null;
    favoriteSet = new Set();
    updateAuthUi();
}
function setupAuth() {
    // Sign-in / sign-up now live on their own page.
    document.querySelector('#login-button').addEventListener('click', () => { window.location.href = '/login.html'; });
    document.querySelector('#logout-button').addEventListener('click', () => {
        document.querySelector('#profile-menu').hidden = true;
        logout();
    });
    const profileButton = document.querySelector('#profile-button');
    const profileMenu = document.querySelector('#profile-menu');
    profileButton.addEventListener('click', event => {
        event.stopPropagation();
        const willOpen = profileMenu.hidden;
        profileMenu.hidden = !willOpen;
        profileButton.setAttribute('aria-expanded', String(willOpen));
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('.profile-menu-wrap')) {
            profileMenu.hidden = true;
            profileButton.setAttribute('aria-expanded', 'false');
        }
    });
    document.querySelector('#fav-button').addEventListener('click', toggleFavorite);
    apiFetch('/api/auth/me')
        .then(async response => {
            if (response.ok) currentUser = (await response.json()).user;
            if (currentUser) await loadFavorites();
        })
        .catch(() => {})
        .finally(updateAuthUi);
}
async function loadFavorites() {
    const response = await apiFetch('/api/favorites');
    if (response.ok) favoriteSet = new Set((await response.json()).favorites.map(item => String(item.store_number)));
}
function currentStoreNumber() { return currentFeature?.properties?.store_id ? String(currentFeature.properties.store_id) : null; }
function updateFavoriteButton() {
    const button = document.querySelector('#fav-button');
    if (!button) return;
    const number = currentStoreNumber();
    // Only real shops (those with a store number) can be saved, and only by signed-in people.
    button.hidden = !(currentUser && number && !String(number).startsWith('local-') && currentFeature?.properties?.type === 'shop');
    const saved = number && favoriteSet.has(number);
    button.textContent = saved ? '♥ Saved' : '♡ Save this shop';
    button.setAttribute('aria-pressed', String(Boolean(saved)));
}
async function toggleFavorite() {
    const number = currentStoreNumber();
    if (!currentUser || !number) return;
    const saved = favoriteSet.has(number);
    const response = await apiFetch(`/api/favorites/${encodeURIComponent(number)}`, { method: saved ? 'DELETE' : 'PUT' });
    if (response.ok) { saved ? favoriteSet.delete(number) : favoriteSet.add(number); updateFavoriteButton(); }
    else if (response.status === 401) { currentUser = null; updateAuthUi(); }
}
// Shows the shop profile and running offers from the database in the details panel.
async function loadShopInfo(feature) {
    const box = document.querySelector('#shop-extra');
    const number = feature.properties?.store_id;
    const mine = ++shopInfoToken;
    box.innerHTML = '';
    if (!number || feature.properties?.type !== 'shop') return;
    try {
        const response = await apiFetch(`/api/public/stores/${encodeURIComponent(number)}`);
        if (!response.ok || mine !== shopInfoToken) return;
        const { store, offers } = await response.json();
        const rows = [['Status', store.open_status === 'renovation' ? 'Under renovation' : store.open_status.charAt(0).toUpperCase() + store.open_status.slice(1)], ['Hours', store.opening_hours], ['Phone', store.phone], ['Products', store.products]].filter(([, value]) => value);
        const site = /^https?:\/\//.test(store.website) ? `<a href="${escapeHtml(store.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(store.website.replace(/^https?:\/\//, ''))}</a>` : '';
        box.innerHTML = (store.description ? `<p class="shop-desc">${escapeHtml(store.description)}</p>` : '')
            + (rows.length || site ? `<dl class="details-list">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}${site ? `<div><dt>Website</dt><dd>${site}</dd></div>` : ''}</dl>` : '')
            + (offers.length ? `<div class="nearby-section"><h3>Offers</h3>${offers.map(offer => `<div class="offer-chip">${offer.discount_text ? `<b>${escapeHtml(offer.discount_text)}</b> ` : ''}${escapeHtml(offer.title)}${offer.description ? `<small>${escapeHtml(offer.description)}</small>` : ''}</div>`).join('')}</div>` : '');
    } catch (error) { /* extra info is optional */ }
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function localStoreData(feature) { const key = feature.properties?.store_id || feature.properties?.id; return key ? JSON.parse(localStorage.getItem(`bali-store-${key}`) || 'null') : null; }
function featureLabel(feature) {
    const properties = feature.properties || {};
    // Database name from PostgreSQL takes top priority!
    return properties.name || localStoreData(feature)?.name || properties.store_id || properties.id || 'Unnamed space';
}
function categoryIcon(feature) { const value = `${feature.properties?.category || ''} ${feature.properties?.type || ''} ${featureLabel(feature)}`.toLowerCase(); const match = categories.find(([key, label]) => value.includes(label.toLowerCase()) || value.includes(key.replace('-', ' '))); return match ? `${iconRoot}${match[0]}.svg` : null; }
function mapFeatureIcon(feature) {
    const name = featureLabel(feature).toLowerCase();
    if (name.includes('toilet')) return 'restroom';
    if (name.includes('lift')) return 'elevator';
    if (name.includes('escalator')) return 'escalator';
    if (name.includes('parking')) return 'parking';
    if (name.includes('fire exit')) return 'fire-exit';
    return null;
}
function addFeatureIcon(feature, layer) {
    const iconName = mapFeatureIcon(feature);
    if (!iconName || !layer.getBounds().isValid()) return;
    const marker = L.marker(layer.getBounds().getCenter(), {
        icon: L.divIcon({ className: 'map-feature-icon', html: `<img src="${iconRoot}${iconName}.svg" alt="">`, iconSize: [30, 30], iconAnchor: [15, 15] }),
        interactive: false,
        keyboard: false
    }).addTo(map);
    featureMarkers.set(feature, marker);
}
function setDetails(feature) {
    const properties = feature.properties || {};
    const saved = localStoreData(feature) || {};
    const category = properties.category || saved.category || properties.type || 'Uncategorized';
    currentFeature = feature;
    updateAuthUi();
    loadShopInfo(feature);
    document.querySelector('#details-name').textContent = featureLabel(feature);
    document.querySelector('#details-category').textContent = category;
    document.querySelector('#details-floor').textContent = floorLabel;
    document.querySelector('#details-floor-value').textContent = floorLabel;
    document.querySelector('#details-category-value').textContent = category;
    const icon = categoryIcon(feature) || (mapFeatureIcon(feature) ? `${iconRoot}${mapFeatureIcon(feature)}.svg` : null);
    document.querySelector('#details-icon').innerHTML = icon ? `<img src="${icon}" alt="">` : '⌂';
    const storeImage = properties.image_url || saved.image;
    document.querySelector('#store-image-preview').innerHTML = storeImage ? `<img src="${storeImage}" alt="Image of ${escapeHtml(featureLabel(feature))}">` : '<span>No store image available</span>';
    const origin = featureLayers.get(feature)?.getBounds().getCenter();
    const nearby = allFeatures.filter(item => item !== feature && featureLayers.has(item)).sort((left, right) => {
        const leftCenter = featureLayers.get(left).getBounds().getCenter();
        const rightCenter = featureLayers.get(right).getBounds().getCenter();
        return origin.distanceTo(leftCenter) - origin.distanceTo(rightCenter);
    }).slice(0, 3);
    document.querySelector('#nearby-list').innerHTML = nearby.length ? nearby.map(item => `<button class="nearby-item" type="button" data-feature-id="${escapeHtml(item.properties?.store_id || item.properties?.id || featureLabel(item))}"><span>${escapeHtml(featureLabel(item))}</span><span aria-hidden="true">›</span></button>`).join('') : '<p class="empty-state">No nearby spaces available.</p>';
    document.querySelectorAll('.nearby-item').forEach(button => button.addEventListener('click', () => {
        const nearbyFeature = allFeatures.find(item => String(item.properties?.store_id || item.properties?.id || featureLabel(item)) === button.dataset.featureId);
        if (nearbyFeature) selectFeature(nearbyFeature, featureLayers.get(nearbyFeature));
    }));
}
function resetLayerStyle(layer) { layer.setStyle({ color: '#655d54', weight: 1.2, opacity: 0.85, fillColor: '#f7f1e8', fillOpacity: 0.32 }); }
function selectFeature(feature, layer) {
    if (selectedLayer) resetLayerStyle(selectedLayer);
    selectedLayer = layer;
    layer.setStyle({ color: '#9a6c35', weight: 2.5, opacity: 1, fillColor: '#f3d8b5', fillOpacity: 0.72 });
    layer.bringToFront();
    setDetails(feature);
    // Smoothly pan to the store without blowing up the map zoom level!
    if (layer.getBounds().isValid()) {
        map.panTo(layer.getBounds().getCenter(), { animate: true });
    }
}
function matchesCategory(feature, label) { if (!label) return true; const value = `${feature.properties?.category || ''} ${feature.properties?.type || ''} ${featureLabel(feature)}`.toLowerCase(); const aliases = { 'elevator': ['elevator', 'lift'], 'lifts': ['elevator', 'lift'], 'restroom': ['restroom', 'toilet'], 'toilets': ['restroom', 'toilet'], 'escalator': ['escalator'], 'escalators': ['escalator'], 'parking': ['parking'], 'fire exit': ['fire exit'], 'fire exits': ['fire exit'] }; return (aliases[label.toLowerCase()] || [label.toLowerCase()]).some(alias => value.includes(alias)); }
function filterFeatures(label) { activeCategory = label; document.querySelectorAll('.category-item, .category-filter').forEach(button => button.classList.toggle('is-active', button.dataset.category === label)); if (!storeLayer) return; storeLayer.eachLayer(layer => { const visible = matchesCategory(layer.feature, label); layer.setStyle({ opacity: visible ? 0.85 : 0.08, fillOpacity: visible ? 0.32 : 0.03 }); const marker = featureMarkers.get(layer.feature); if (marker) marker.setOpacity(visible ? 1 : 0.08); }); }
function buildCategoryBar() { return; }
function renderSearchResults(query) { const results = document.querySelector('#search-results'); const matches = allFeatures.filter(feature => `${featureLabel(feature)} ${feature.properties?.category || ''} ${feature.properties?.type || ''}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6); results.innerHTML = matches.map(feature => `<button class="search-result" type="button" data-id="${escapeHtml(feature.properties?.store_id || feature.properties?.id || featureLabel(feature))}">${escapeHtml(featureLabel(feature))}<br><small>${escapeHtml(feature.properties?.category || feature.properties?.type || 'Space')}</small></button>`).join(''); results.hidden = !query || !matches.length; results.querySelectorAll('.search-result').forEach(button => button.addEventListener('click', () => { const feature = allFeatures.find(item => String(item.properties?.store_id || item.properties?.id || featureLabel(item)) === button.dataset.id); const layer = storeLayer.getLayers().find(item => item.feature === feature); if (feature && layer) selectFeature(feature, layer); results.hidden = true; })); }
function openStoreEditor(feature = null, isNew = false) {
    creatingStore = isNew;
    currentFeature = feature;
    pendingImage = feature ? (localStoreData(feature)?.image || feature.properties?.image_url || null) : null;
    document.querySelector('#dialog-title').textContent = isNew ? 'Add store' : 'Edit store';
    document.querySelector('#dialog-title').dataset.role = currentUser?.role || 'visitor';
    document.querySelector('#store-name-input').value = feature ? featureLabel(feature) : '';
    const categoryInput = document.querySelector('#store-category-input');
    const categoryField = document.querySelector('#store-category-field');
    categoryInput.value = feature ? (localStoreData(feature)?.category || feature.properties?.category || '') : '';
    const authorizedEditor = currentUser?.role === 'admin' || currentUser?.role === 'shopkeeper';
    document.querySelector('#store-name-input').disabled = !authorizedEditor;
    categoryInput.disabled = !authorizedEditor;
    document.querySelector('#store-category-field').hidden = !authorizedEditor;
    document.querySelector('#store-image-input').disabled = !authorizedEditor;
    document.querySelector('#upload-preview').innerHTML = pendingImage ? `<img src="${pendingImage}" alt="Current store image">` : 'No image selected';
    document.querySelector('#remove-store-image').hidden = !pendingImage;
    const noteEl = document.querySelector('#dialog-note');
    if (noteEl) {
        noteEl.textContent = currentUser?.role === 'shopkeeper'
            ? 'Shopkeepers can update the shop name, category, and image. Changes are saved directly to PostgreSQL.'
            : currentUser?.role === 'admin'
                ? 'Update the shop name, category, and image. Changes are saved directly to PostgreSQL.'
                : 'Changes will be saved directly to your PostgreSQL database.';
        noteEl.style.color = '#655d54';
    }
    document.querySelector('#store-dialog').showModal();
}
async function saveStoreEditor(event) {
    event.preventDefault();
    const nameInput = document.querySelector('#store-name-input');
    const categoryInput = document.querySelector('#store-category-input');
    const noteEl = document.querySelector('#dialog-note');
    const saveBtn = document.querySelector('.dialog-save');

    const name = nameInput.value.trim();
    const category = currentUser && (currentUser.role === 'admin' || currentUser.role === 'shopkeeper')
        ? (categoryInput.value.trim() || 'retail')
        : (currentFeature?.properties?.category || localStoreData(currentFeature)?.category || 'retail');
    if (!name) return;

    if (noteEl) {
        noteEl.textContent = 'Saving directly to PostgreSQL database...';
        noteEl.style.color = '#9a6c35';
    }
    if (saveBtn) saveBtn.disabled = true;

    if (creatingStore) {
        const id = `local-${Date.now()}`;
        const location = newStoreLocation || map.getCenter();
        currentFeature = { type: 'Feature', properties: { id, store_id: id, name, category, type: 'shop', floor: 'first' }, geometry: { type: 'Point', coordinates: [location.lng, location.lat] } };
        allFeatures.push(currentFeature);
        storeLayer.addData(currentFeature);
    }
    if (currentFeature.properties) {
        currentFeature.properties.name = name;
        currentFeature.properties.category = category;
        currentFeature.properties.image_url = pendingImage || null;
    }
    const key = currentFeature.properties.id || currentFeature.properties.store_id;
    localStorage.setItem(`bali-store-${key}`, JSON.stringify({ name, category, image: pendingImage, feature: creatingStore ? currentFeature : undefined }));

    // Send update directly to PostgreSQL database
      let dbSaved = false;
    try {
        const targetId = currentFeature?.properties?.id || currentFeature?.properties?.store_id || currentFeature?.properties?.name;
        let response = await
         fetch(`${API_BASE}/api/stores/${encodeURIComponent(targetId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin',
            body: JSON.stringify({
                name,
                category,
                image_url: pendingImage || null,
                remove_image: !pendingImage,
                id: currentFeature.properties.id,
                store_number: currentFeature.properties.store_id || currentFeature.properties.name
            })
        });

        // Fallback to POST if PUT isn't allowed or route not found
        if (response.status === 404 || response.status === 405) {
            response = await fetch(`${API_BASE}/api/stores/${encodeURIComponent(targetId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin',
                body: JSON.stringify({
                    name,
                    category,
                    image_url: pendingImage || null,
                    remove_image: !pendingImage,
                    id: currentFeature.properties.id,
                    store_number: currentFeature.properties.store_id || currentFeature.properties.name
                })
            });
        }

        const rawText = await response.text();
        let result = {};
        try {
            result = JSON.parse(rawText);
        } catch (parseErr) {
            throw new Error(`Server returned HTTP ${response.status}: not JSON. Please restart "node server-pg.js" in terminal.`);
        }

        if (response.ok && result.success) {
            dbSaved = true;
            if (noteEl) {
                noteEl.textContent = `✅ Saved to database: "${name}"`;
                noteEl.style.color = '#2e7d32';
            }
            console.log('✅ Store updated in PostgreSQL database:', result);
            setDetails(currentFeature);
        } else {
            if (noteEl) {
                if (response.status === 401) {
                    noteEl.textContent = 'Please log in again. Your session is no longer valid.';
                    logout();
                } else if (response.status === 403) {
                    noteEl.textContent = result.error || result.message || 'Update failed';
                } else {
                    noteEl.textContent = result.error || result.message || 'Update failed';
                }
                noteEl.style.color = '#c62828';
            } else if (response.status === 401) {
                logout();
            }
        }
    } catch (apiErr) {
        if (noteEl) {
            noteEl.textContent = `❌ Could not connect (${apiErr.message}). Make sure 'node server-pg.js' is running.`;
            noteEl.style.color = '#c62828';
        }
        console.error('Could not contact API to save in database:', apiErr);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }

    const layer = featureLayers.get(currentFeature);
    if (layer) selectFeature(currentFeature, layer);

    if (dbSaved) {
        setTimeout(() => {
            document.querySelector('#store-dialog').close();
        }, 500);
    }
}
function loadLocalStores() {
    Object.keys(localStorage).filter(key => key.startsWith('bali-store-local-')).forEach(key => {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (!saved?.feature || allFeatures.some(feature => feature.properties?.store_id === saved.feature.properties?.store_id)) return;
        allFeatures.push(saved.feature);
        storeLayer.addData(saved.feature);
    });
}
function wireFloorSelect() {
    document.querySelector('#floor-select').addEventListener('change', event => {
        floorLabel = event.target.selectedOptions[0].dataset.label;
        document.querySelector('#details-floor').textContent = floorLabel;
        document.querySelector('#details-floor-value').textContent = floorLabel;
        document.querySelector('.location-label span:last-child').textContent = floorLabel;
    });
}
function wireUi() { document.querySelector('#zoom-in').addEventListener('click', () => map.zoomIn()); document.querySelector('#zoom-out').addEventListener('click', () => map.zoomOut()); document.querySelector('#reset-map').addEventListener('click', () => map.fitBounds(floorBounds)); document.querySelector('#brand-button').addEventListener('click', () => map.fitBounds(floorBounds)); document.querySelector('#close-details').addEventListener('click', () => { if (selectedLayer) resetLayerStyle(selectedLayer); selectedLayer = null; }); document.querySelector('#edit-store').addEventListener('click', () => { if (currentFeature) openStoreEditor(currentFeature); }); document.querySelector('#add-store').addEventListener('click', () => { document.querySelector('#sidebar').classList.remove('is-open'); newStoreLocation = map.getCenter(); openStoreEditor(null, true); }); document.querySelectorAll('.group-toggle').forEach(button => button.addEventListener('click', () => { const options = button.nextElementSibling; const expanded = button.getAttribute('aria-expanded') === 'true'; button.setAttribute('aria-expanded', String(!expanded)); options.classList.toggle('is-collapsed', expanded); button.querySelector('.group-chevron').textContent = expanded ? '⌄' : '⌃'; })); document.querySelectorAll('.category-filter').forEach(button => button.addEventListener('click', () => { filterFeatures(activeCategory === button.dataset.category ? null : button.dataset.category); })); document.querySelector('#dialog-close').addEventListener('click', () => document.querySelector('#store-dialog').close()); document.querySelector('#dialog-cancel').addEventListener('click', () => document.querySelector('#store-dialog').close()); document.querySelector('#store-form').addEventListener('submit', saveStoreEditor); document.querySelector('#store-image-input').addEventListener('change', event => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { pendingImage = reader.result; document.querySelector('#upload-preview').innerHTML = `<img src="${pendingImage}" alt="Selected store image">`; document.querySelector('#remove-store-image').hidden = false; }; reader.readAsDataURL(file); });
document.querySelector('#remove-store-image').addEventListener('click', () => { pendingImage = null; document.querySelector('#store-image-input').value = ''; document.querySelector('#upload-preview').innerHTML = 'No image selected'; document.querySelector('#remove-store-image').hidden = true; }); document.querySelector('#search-input').addEventListener('input', event => renderSearchResults(event.target.value.trim())); document.querySelector('#search-form').addEventListener('submit', event => event.preventDefault()); document.querySelector('#menu-button').addEventListener('click', () => { const sidebar = document.querySelector('#sidebar'); sidebar.classList.toggle('is-open'); document.querySelector('#menu-button').setAttribute('aria-label', sidebar.classList.contains('is-open') ? 'Close navigation menu' : 'Open navigation menu'); }); }
buildCategoryBar();
if (!document.querySelector('#add-store')) {
    const removedAddStore = document.createElement('button');
    removedAddStore.id = 'add-store';
    removedAddStore.hidden = true;
    document.body.appendChild(removedAddStore);
}
wireUi();
document.querySelector('#add-store')?.remove();
wireFloorSelect();
setupAuth();
map.fitBounds(floorBounds);
fetch(`${API_BASE}/api/map/0`).then(response => { if (!response.ok) throw new Error('Failed to load map data'); return response.json(); }).then(data => { allFeatures = data.features || []; storeLayer = L.geoJSON(data, { pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: 8, color: '#655d54', fillColor: '#f7f1e8', fillOpacity: 0.8 }), style: () => ({ color: '#655d54', weight: 1.2, opacity: 0.85, fillColor: '#f7f1e8', fillOpacity: 0.32 }), onEachFeature: (feature, layer) => { featureLayers.set(feature, layer); addFeatureIcon(feature, layer); layer.on({ mouseover: () => { if (layer !== selectedLayer) layer.setStyle({ fillColor: '#e8dfcf', fillOpacity: 0.65, weight: 1.8 }); }, mouseout: () => { if (layer !== selectedLayer) resetLayerStyle(layer); }, click: () => selectFeature(feature, layer) }); } }).addTo(map); loadLocalStores(); if (activeCategory) filterFeatures(activeCategory); openStoreFromUrl(); }).catch(error => console.error('Map data could not be loaded:', error));

function openStoreFromUrl() {
    const wanted = new URLSearchParams(window.location.search).get('store');
    if (!wanted) return;
    const feature = allFeatures.find(item => String(item.properties?.store_id) === wanted);
    const layer = feature && featureLayers.get(feature);
    if (layer) selectFeature(feature, layer);
}
