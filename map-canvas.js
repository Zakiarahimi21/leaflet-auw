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

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function localStoreData(feature) { const key = feature.properties?.store_id || feature.properties?.id; return key ? JSON.parse(localStorage.getItem(`bali-store-${key}`) || 'null') : null; }
function featureLabel(feature) { const properties = feature.properties || {}; return localStoreData(feature)?.name || properties.name || properties.store_id || properties.id || 'Unnamed space'; }
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
    const category = saved.category || properties.category || properties.type || 'Uncategorized';
    currentFeature = feature;
    document.querySelector('#details-name').textContent = featureLabel(feature);
    document.querySelector('#details-category').textContent = category;
    document.querySelector('#details-floor').textContent = floorLabel;
    document.querySelector('#details-floor-value').textContent = floorLabel;
    document.querySelector('#details-category-value').textContent = category;
    const icon = categoryIcon(feature) || (mapFeatureIcon(feature) ? `${iconRoot}${mapFeatureIcon(feature)}.svg` : null);
    document.querySelector('#details-icon').innerHTML = icon ? `<img src="${icon}" alt="">` : '⌂';
    document.querySelector('#store-image-preview').innerHTML = saved.image ? `<img src="${saved.image}" alt="Image of ${escapeHtml(featureLabel(feature))}">` : '<span>No store image available</span>';
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
function selectFeature(feature, layer) { if (selectedLayer) resetLayerStyle(selectedLayer); selectedLayer = layer; layer.setStyle({ color: '#9a6c35', weight: 2.5, opacity: 1, fillColor: '#f3d8b5', fillOpacity: 0.72 }); layer.bringToFront(); setDetails(feature); if (layer.getBounds().isValid()) map.fitBounds(layer.getBounds(), { maxZoom: 1, padding: [60, 60] }); }
function matchesCategory(feature, label) { if (!label) return true; const value = `${feature.properties?.category || ''} ${feature.properties?.type || ''} ${featureLabel(feature)}`.toLowerCase(); const aliases = { 'elevator': ['elevator', 'lift'], 'lifts': ['elevator', 'lift'], 'restroom': ['restroom', 'toilet'], 'toilets': ['restroom', 'toilet'], 'escalator': ['escalator'], 'escalators': ['escalator'], 'parking': ['parking'], 'fire exit': ['fire exit'], 'fire exits': ['fire exit'] }; return (aliases[label.toLowerCase()] || [label.toLowerCase()]).some(alias => value.includes(alias)); }
function filterFeatures(label) { activeCategory = label; document.querySelectorAll('.category-item, .category-filter').forEach(button => button.classList.toggle('is-active', button.dataset.category === label)); if (!storeLayer) return; storeLayer.eachLayer(layer => { const visible = matchesCategory(layer.feature, label); layer.setStyle({ opacity: visible ? 0.85 : 0.08, fillOpacity: visible ? 0.32 : 0.03 }); const marker = featureMarkers.get(layer.feature); if (marker) marker.setOpacity(visible ? 1 : 0.08); }); }
function buildCategoryBar() { return; }
function renderSearchResults(query) { const results = document.querySelector('#search-results'); const matches = allFeatures.filter(feature => `${featureLabel(feature)} ${feature.properties?.category || ''} ${feature.properties?.type || ''}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6); results.innerHTML = matches.map(feature => `<button class="search-result" type="button" data-id="${escapeHtml(feature.properties?.store_id || feature.properties?.id || featureLabel(feature))}">${escapeHtml(featureLabel(feature))}<br><small>${escapeHtml(feature.properties?.category || feature.properties?.type || 'Space')}</small></button>`).join(''); results.hidden = !query || !matches.length; results.querySelectorAll('.search-result').forEach(button => button.addEventListener('click', () => { const feature = allFeatures.find(item => String(item.properties?.store_id || item.properties?.id || featureLabel(item)) === button.dataset.id); const layer = storeLayer.getLayers().find(item => item.feature === feature); if (feature && layer) selectFeature(feature, layer); results.hidden = true; })); }
function openStoreEditor(feature = null, isNew = false) {
    creatingStore = isNew;
    currentFeature = feature;
    pendingImage = feature ? localStoreData(feature)?.image || null : null;
    document.querySelector('#dialog-title').textContent = isNew ? 'Add store' : 'Edit store';
    document.querySelector('#store-name-input').value = feature ? featureLabel(feature) : '';
    document.querySelector('#store-category-input').value = feature ? (localStoreData(feature)?.category || feature.properties?.category || '') : '';
    document.querySelector('#upload-preview').innerHTML = pendingImage ? `<img src="${pendingImage}" alt="Current store image">` : 'No image selected';
    document.querySelector('#store-dialog').showModal();
}
function saveStoreEditor(event) {
    event.preventDefault();
    const name = document.querySelector('#store-name-input').value.trim();
    const category = document.querySelector('#store-category-input').value.trim() || 'retail';
    if (!name) return;
    if (creatingStore) {
        const id = `local-${Date.now()}`;
        const location = newStoreLocation || map.getCenter();
        currentFeature = { type: 'Feature', properties: { id, store_id: id, name, category, type: 'shop', floor: 'first' }, geometry: { type: 'Point', coordinates: [location.lng, location.lat] } };
        allFeatures.push(currentFeature);
        storeLayer.addData(currentFeature);
    }
    const key = currentFeature.properties.store_id || currentFeature.properties.id;
    localStorage.setItem(`bali-store-${key}`, JSON.stringify({ name, category, image: pendingImage, feature: creatingStore ? currentFeature : undefined }));
    const layer = featureLayers.get(currentFeature);
    if (layer) selectFeature(currentFeature, layer);
    document.querySelector('#store-dialog').close();
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
function setupAdminGate() {
    const addStore = document.querySelector('#add-store');
    const adminDialog = document.querySelector('#admin-dialog');
    const adminForm = document.querySelector('#admin-form');
    const adminError = document.querySelector('#admin-error');
    const openEditor = () => {
        document.querySelector('#sidebar').classList.remove('is-open');
        newStoreLocation = map.getCenter();
        openStoreEditor(null, true);
    };
    addStore.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (sessionStorage.getItem('bali-admin-token')) return openEditor();
        adminError.hidden = true;
        adminForm.reset();
        adminDialog.showModal();
    }, true);
    adminForm.addEventListener('submit', async event => {
        event.preventDefault();
        const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: document.querySelector('#admin-password').value }) });
        const result = await response.json();
        if (!response.ok) {
            adminError.textContent = result.error || 'Admin login failed';
            adminError.hidden = false;
            return;
        }
        sessionStorage.setItem('bali-admin-token', result.token);
        adminDialog.close();
        openEditor();
    });
    document.querySelector('#admin-close').addEventListener('click', () => adminDialog.close());
    document.querySelector('#admin-cancel').addEventListener('click', () => adminDialog.close());
}
function wireUi() { document.querySelector('#zoom-in').addEventListener('click', () => map.zoomIn()); document.querySelector('#zoom-out').addEventListener('click', () => map.zoomOut()); document.querySelector('#reset-map').addEventListener('click', () => map.fitBounds(floorBounds)); document.querySelector('#brand-button').addEventListener('click', () => map.fitBounds(floorBounds)); document.querySelector('#close-details').addEventListener('click', () => { if (selectedLayer) resetLayerStyle(selectedLayer); selectedLayer = null; }); document.querySelector('#edit-store').addEventListener('click', () => { if (currentFeature) openStoreEditor(currentFeature); }); document.querySelector('#add-store').addEventListener('click', () => { document.querySelector('#sidebar').classList.remove('is-open'); newStoreLocation = map.getCenter(); openStoreEditor(null, true); }); document.querySelectorAll('.group-toggle').forEach(button => button.addEventListener('click', () => { const options = button.nextElementSibling; const expanded = button.getAttribute('aria-expanded') === 'true'; button.setAttribute('aria-expanded', String(!expanded)); options.classList.toggle('is-collapsed', expanded); button.querySelector('.group-chevron').textContent = expanded ? '⌄' : '⌃'; })); document.querySelectorAll('.category-filter').forEach(button => button.addEventListener('click', () => { filterFeatures(activeCategory === button.dataset.category ? null : button.dataset.category); })); document.querySelector('#dialog-close').addEventListener('click', () => document.querySelector('#store-dialog').close()); document.querySelector('#dialog-cancel').addEventListener('click', () => document.querySelector('#store-dialog').close()); document.querySelector('#store-form').addEventListener('submit', saveStoreEditor); document.querySelector('#store-image-input').addEventListener('change', event => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { pendingImage = reader.result; document.querySelector('#upload-preview').innerHTML = `<img src="${pendingImage}" alt="Selected store image">`; }; reader.readAsDataURL(file); }); document.querySelector('#search-input').addEventListener('input', event => renderSearchResults(event.target.value.trim())); document.querySelector('#search-form').addEventListener('submit', event => event.preventDefault()); document.querySelector('#menu-button').addEventListener('click', () => { const sidebar = document.querySelector('#sidebar'); sidebar.classList.toggle('is-open'); document.querySelector('#menu-button').setAttribute('aria-label', sidebar.classList.contains('is-open') ? 'Close navigation menu' : 'Open navigation menu'); }); }
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
map.fitBounds(floorBounds);
fetch('/api/map/0').then(response => { if (!response.ok) throw new Error('Failed to load map data'); return response.json(); }).then(data => { allFeatures = data.features || []; storeLayer = L.geoJSON(data, { pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: 8, color: '#655d54', fillColor: '#f7f1e8', fillOpacity: 0.8 }), style: () => ({ color: '#655d54', weight: 1.2, opacity: 0.85, fillColor: '#f7f1e8', fillOpacity: 0.32 }), onEachFeature: (feature, layer) => { featureLayers.set(feature, layer); addFeatureIcon(feature, layer); layer.on({ mouseover: () => { if (layer !== selectedLayer) layer.setStyle({ fillColor: '#e8dfcf', fillOpacity: 0.65, weight: 1.8 }); }, mouseout: () => { if (layer !== selectedLayer) resetLayerStyle(layer); }, click: () => selectFeature(feature, layer) }); } }).addTo(map); loadLocalStores(); if (activeCategory) filterFeatures(activeCategory); }).catch(error => console.error('Map data could not be loaded:', error));