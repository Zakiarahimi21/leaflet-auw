// 1. Set dimensions of your classroom-map.jpg
const planWidth = 2000;   // replace with actual image width
const planHeight = 1500;  // replace with actual image height

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
const classroomImage = L.imageOverlay('1stfloor.png', floorBounds);
classroomImage.addTo(map);

// 5. Fit map to image bounds
map.fitBounds(floorBounds);

// 6. Example polygons (replace coords with real ones)
const cl101 = L.polygon([
    [200, 200], [200, 400], [400, 400], [400, 200]
], {
    color: '#3498db',
    fillColor: '#3498db',
    fillOpacity: 0.4
}).addTo(map);
cl101.bindPopup("<h3>CL101</h3><p>Computer Lab</p>");

const cl108 = L.polygon([
    [500, 200], [500, 400], [700, 400], [700, 200]
], {
    color: '#e67e22',
    fillColor: '#e67e22',
    fillOpacity: 0.4
}).addTo(map);
cl108.bindPopup("<h3>CL108</h3><p>Lecture Room</p>");

// 7. Debug tool: click anywhere to get coordinates
map.on("click", function (e) {
    console.log(e.latlng);
});
