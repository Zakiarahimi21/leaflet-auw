
// Dimensions of the high-res floor plan blueprint
const planWidth = 2000;
const planHeight = 1500;

// 1. Establish the non-geographical canvas arena
var map = L.map('map', {
crs: L.CRS.Simple,
minZoom: -1,
maxZoom: 2,
zoomDelta: 0.5,
zoomSnap: 0.5
});

// Set map bounding box dimensions to match asset dimensions
const floorBounds = [[0, 0], [planHeight, planWidth]];
map.fitBounds(floorBounds);

// 2. Asset Overlay Initializations (Different Layers per Floor Level)
const groundFloorImage = L.imageOverlay('https://www.inetsoft.com/images/website/simple_lead_management_dashboard.jpg', floorBounds);
const firstFloorImage = L.imageOverlay('https://www.inetsoft.com/images/website/simple_lead_management_dashboard.jpg', floorBounds);

// Render Ground Level by default 
groundFloorImage.addTo(map);

// 3. Define Store Boundary Zones (Polygons matching blueprint shapes)
const anchorStoreZone = L.polygon([
[1076, 612], [1076, 800], [926, 802], [926, 612]
], {
color: '#3498db',
fillColor: '#3498db',
fillOpacity: 0.4,
weight: 2
});

// Map function to log coordinates of user clicks on the map canvas
map.on("click", function(e) {
    console.log(e.latlng);
});

// const foodCourtZone = L.polygon([
// [800, 900], [800, 1400], [1200, 1400], [1200, 900]
// ], {
// color: '#e67e22',
// fillColor: '#e67e22',
// fillOpacity: 0.4,
// weight: 2
// });

// 4. Interactive Store Information Modals
anchorStoreZone.bindPopup(`
<div class="store-popup-card">
    <h3>Grand Fashion Emporium</h3>
    <p><strong>Category:</strong> Apparel & Shoes</p>
    <p><strong>Hours:</strong> 10:00 AM - 9:00 PM</p>
    <p class="store-status-open">● Open Now</p>
</div>
`);

// foodCourtZone.bindPopup(`
// <div class="store-popup-card">
//     <h3>Burger Oasis</h3>
//     <p><strong>Category:</strong> Dining / Food Court</p>
//     <p><strong>Deal:</strong> 10% off combo meals today!</p>
// </div>
// `);

// // Group vector assets natively onto their structural floor layers
// const groundFloorVectors = L.layerGroup([anchorStoreZone, foodCourtZone]);
// groundFloorVectors.addTo(map); // Display ground layers initially

anchorStoreZone.addTo(map); // Display anchor store zone by default

// // Place placeholders for Level 1 stores
// const boutiqueZone = L.polygon([[300, 300], [300, 600], [500, 600], [500, 300]], { color: '#9b59b6' });
// boutiqueZone.bindPopup('<h3>Luxury Boutique</h3>');
// const firstFloorVectors = L.layerGroup([boutiqueZone]);

// // 5. Structure Floor Multi-Level Controls 
// const floorBaseLayers = {
// "Ground Level": groundFloorImage,
// "First Floor": firstFloorImage
// };

// const floorOverlayLayers = {
// "Ground Shops": groundFloorVectors,
// "First Floor Shops": firstFloorVectors
// };

// // Inject control panel widget layout onto UI canvas top-right
// L.control.layers(floorBaseLayers, floorOverlayLayers, { collapsed: false }).addTo(map);

// // Multi-level structural logic toggle wrapper automation
// map.on('baselayerchange', function(event) {
// if (event.name === "Ground Level") {
//     map.removeLayer(firstFloorVectors);
//     map.addLayer(groundFloorVectors);
// } else if (event.name === "First Floor") {
//     map.removeLayer(groundFloorVectors);
//     map.addLayer(firstFloorVectors);
// }
// });