// 1. Set dimensions of your classroom-map.jpg
const planWidth = 1440;   // replace with actual image width
const planHeight = 1024;  // replace with actual image height

// 2. Create map with simple CRS
var map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -1,
    maxZoom: 2,
    zoomSnap: 0.5
});

// 3. Bounds of the image
const floorBounds = [[0, 0], [planHeight, planWidth]];

// 4. Add classroom map image
const classroomImage = L.imageOverlay('first_floor.png', floorBounds);
classroomImage.addTo(map);

// 5. Load store polygons from PostgreSQL
fetch('http://localhost:3000/api/map/0')
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load map data');
        }
        return response.json();
    })
    .then(data => {
        console.log('✅ PostgreSQL map data loaded:', data);
        console.log(`🏪 Stores loaded: ${data.features.length}`);

        const storeLayer = L.geoJSON(data, {
            style: {
                color: '#1976d2',
                weight: 1,
                opacity: 0.7,
                fillOpacity: 0.08,
                lineCap: 'round',
                lineJoin: 'round'
            },

            onEachFeature: function (feature, layer) {
                const p = feature.properties;

                layer.bindPopup(`
                    <strong>${p.name || 'Unnamed Store'}</strong><br>
                    Store: ${p.store_id || 'N/A'}<br>
                    Type: ${p.type || 'N/A'}<br>
                    Category: ${p.category || 'N/A'}
                `);
            }
        });

        storeLayer.addTo(map);

        console.log('✅ Store polygons added to Leaflet');
    })
    .catch(error => {
        console.error('❌ Could not load PostgreSQL map:', error);
    });
// 5. Fit map to image bounds
map.fitBounds(floorBounds);
// Add a legend
var legend = L.control({position: 'bottomright'});
legend.onAdd = function(map) {
    var div = L.DomUtil.create('div', 'info legend');
    div.style.backgroundColor = 'white';
    div.style.padding = '10px';
    div.style.borderRadius = '5px';
    div.style.boxShadow = '0 0 15px rgba(0,0,0,0.2)';
    div.innerHTML = `
        <h4 style="margin:0 0 8px 0;">📍 Legend</h4>
        <p style="margin:4px 0;">🟦 <span style="color:#4A90D9;">Rooms</span></p>
        <p style="margin:4px 0;">🚻 Toilets</p>
        <p style="margin:4px 0;">🛗 Lifts</p>
        <p style="margin:4px 0;">🔥 Fire Exits</p>
        <p style="margin:4px 0;">⬆️ Escalators</p>
    `;
    return div;
};
legend.addTo(map);