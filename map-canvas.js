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
fetch('http://localhost:3000/api/map/1')
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
                weight: 2,
                fillOpacity: 0.25
            },

            onEachFeature: function (feature, layer) {
                const p = feature.properties;

                layer.bindPopup(`
                    <strong>${p.name || 'Unnamed Store'}</strong><br>
                    Store: ${p.store_number || 'N/A'}<br>
                    Type: ${p.store_type || 'N/A'}<br>
                    Brand: ${p.brand || 'N/A'}
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


// 6. Example polygons (replace coords with real ones)
// Polygon for Room S 33–37
const s33_37 = L.polygon([
    [972.271824, 211.424928],  // A
    [974.393144, 540.936688],  // B
    [940.452019, 543.058008],  // C
    [939.037805, 504.874242],  // D
    [803.273303, 497.096067],  // E
    [799.030663, 207.889394]   // F
], {
    color: '#FF6B6B',
    fillColor: '#FF6B6B',
    fillOpacity: 0.1
}).addTo(map);

s33_37.bindPopup("<h3>S 33-37</h3><p>Shop number S 33-37</p>");

// Room S 31–32
const s31_32 = L.polygon([
    [974.393144, 540.936688], // A
    [974, 689],               // B
    [797, 689],               // C
    [798.5, 588.5],           // D
    [941.5, 587],             // E
    [940.452019, 543.058008]  // F
], {
    color: '#cccccc',
    fillColor: '#cccccc',
    fillOpacity: 0.1
}).addTo(map);
s31_32.bindPopup("<h3>Room S 31-32</h3>");

// Female Toilet
const femaleToilet = L.polygon([
    [798.5, 588.5],
    [797, 689],
    [724.784451, 690.136218],
    [722.66313, 589.727056]
], {
    color: '#cccccc',
    fillColor: '#cccccc',
    fillOpacity: 0.1
}).addTo(map);
femaleToilet.bindPopup("<h3>Female Toilet</h3>");

// Male Toilet
const maleToilet = L.polygon([
    [722.66313, 589.727056],
    [718.42049, 661.14484],
    [666.801695, 661.14484],
    [661.851947, 591.141269]
], {
    color: '#cccccc',
    fillColor: '#cccccc',
    fillOpacity: 0.1
}).addTo(map);
maleToilet.bindPopup("<h3>Male Toilet</h3>");

// Room S-30
const s30 = L.polygon([
    [718.42049, 661.14484],
    [721.248917, 729.734198],
    [666.094588, 728.319985],
    [666.801695, 661.14484]
], {
    color: '#cccccc',
    fillColor: '#cccccc',
    fillOpacity: 0.1
}).addTo(map);
s30.bindPopup("<h3>Room S-30</h3>");

// Room S-29
const s29 = L.polygon([
    [721.248917, 729.734198],
    [721.956024, 796.202236],
    [663.973268, 794.788022],
    [666.094588, 728.319985]
], {
    color: '#cccccc',
    fillColor: '#cccccc',
    fillOpacity: 0.1
}).addTo(map);
s29.bindPopup("<h3>Room S-29</h3>");

// Room S-28
const s28 = L.polygon([
    [721.956024, 796.202236],
    [664.680374, 866.205807],
    [663.973268, 794.788022]
], {
    color: '#cccccc',
    fillColor: '#cccccc',
    fillOpacity: 0.1
}).addTo(map);
s28.bindPopup("<h3>Room S-28</h3>");

// Fire Exit (near S-28)
const fireExit1 = L.polygon([
    [664.680374, 866.205807],
    [658.5, 881.5]
], {
    color: '#cccccc',
    fillColor: '#cccccc',
    fillOpacity: 0.1
}).addTo(map);
fireExit1.bindPopup("<h3>Fire Exit</h3>");

// Lift
const lift = L.polygon([
    [789.5, 390],
    [792.5, 446.5],
    [729, 445],
    [728, 392]
], {
    color: '#cccccc',
    fillColor: '#cccccc',
    fillOpacity: 0.1
}).addTo(map);
lift.bindPopup("<h3>Stairs</h3>");

// Fire Exit (near Lift)
const fireExit2 = L.polygon([
    [792.5, 446.5],
    [792.5, 482.5],
    [728.5, 484],
    [729, 445]
], {
    color: '#cccccc',
    fillColor: '#cccccc',
    fillOpacity: 0.1
}).addTo(map);
fireExit2.bindPopup("<h3>Fire Exit</h3>");

// Lift Lobby
const liftLobby = L.polygon([
    [728, 392],
    [722, 452],
    [679, 452.5],
    [683, 394.5]
], {
    color: '#cccccc',
    fillColor: '#cccccc',
    fillOpacity: 0.1
}).addTo(map);
liftLobby.bindPopup("<h3>Lift Lobby</h3>");

// Goods Lift
const goodsLift = L.polygon([
    [683, 394.5],
    [675.5, 495.5],
    [627, 495.5],
    [630, 393.5]
], {
    color: '#cccccc',
    fillColor: '#cccccc',
    fillOpacity: 0.1
}).addTo(map);
goodsLift.bindPopup("<h3>Goods Lift</h3>");

// Fire Exit (near Goods Lift)
const fireExit3 = L.polygon([
    [675.5, 495.5],
    [676, 529],
    [611.5, 528.5],
    [614.5, 499]
], {
    color: '#cccccc',
    fillColor: '#cccccc',
    fillOpacity: 0.1
}).addTo(map);
fireExit3.bindPopup("<h3>Fire Exit</h3>");

// Room S-27
const s27 = L.polygon([
    [610.940259, 588.312842],
    [612.354473, 660.437734],
    [564.271211, 663.266161],
    [560.028571, 591.848376]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s27.bindPopup("<h3>Room S-27</h3>");

// Room S-26
const s26 = L.polygon([
    [612.354473, 660.437734],
    [613.768686, 729.027091],
    [560.028571, 728.319985],
    [564.271211, 663.266161]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s26.bindPopup("<h3>Room S-26</h3>");

// Room S-25
const s25 = L.polygon([
    [613.768686, 729.027091],
    [612.354473, 793.373808],
    [565.685425, 794.788022],
    [560.028571, 728.319985]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s25.bindPopup("<h3>Room S-25</h3>");

// Room S-24
const s24 = L.polygon([
    [612.354473, 793.373808],
    [610.940259, 859.134739],
    [563.564105, 859.134739],
    [565.685425, 794.788022]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s24.bindPopup("<h3>Room S-24</h3>");

// Room S-23
const s23 = L.polygon([
    [633.567676, 907.218],
    [583.009541, 971.918271],
    [573.110046, 971.211164],
    [568.867405, 906.864447]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s23.bindPopup("<h3>Room S-23</h3>");

// Room S-22
const s22 = L.polygon([
    [583.009541, 971.918271],
    [504.167135, 1077.984288],
    [503.813582, 972.978931]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s22.bindPopup("<h3>Room S-22</h3>");

// Room S-21
const s21 = L.polygon([
    [568.867405, 906.864447],
    [573.110046, 971.211164],
    [503.813582, 972.978931],
    [502.399368, 907.925107]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s21.bindPopup("<h3>Room S-21</h3>");

// Room S-20
const s20 = L.polygon([
    [513, 793],
    [514, 861],
    [453, 860.5],
    [450.5, 795]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s20.bindPopup("<h3>Room S-20</h3>");

// Room S-19
const s19 = L.polygon([
    [513, 729],
    [513, 793],
    [450.5, 795],
    [451.5, 730]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s19.bindPopup("<h3>Room S-19</h3>");

// Room S-13
const s13 = L.polygon([
    [450.5, 795],
    [453, 860.5],
    [378.5, 859],
    [378, 793.5]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s13.bindPopup("<h3>Room S-13</h3>");

// Room S-18
const s18 = L.polygon([
    [513.5, 660.5],
    [513, 729],
    [451.5, 730],
    [452.5, 659.5]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s18.bindPopup("<h3>Room S-18</h3>");

// Room S-14
const s14 = L.polygon([
    [451.5, 730],
    [450.5, 795],
    [378, 793.5],
    [379, 730]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s14.bindPopup("<h3>Room S-14</h3>");

// Room S-15
const s15 = L.polygon([
    [452.5, 659.5],
    [451.5, 730],
    [379, 730],
    [379, 660]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s15.bindPopup("<h3>Room S-15</h3>");

// Room S-17
const s17 = L.polygon([
    [512.5, 590.5],
    [513.5, 660.5],
    [452.5, 659.5],
    [451.5, 589]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s17.bindPopup("<h3>Room S-17</h3>");

// Room S-16
const s16 = L.polygon([
    [451.5, 589],
    [452.5, 659.5],
    [379, 660],
    [381, 590.5]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s16.bindPopup("<h3>Room S-16</h3>");

// Escalator (Left, down)
const escalatorLeft = L.polygon([
    [433.5, 903],
    [435.5, 948],
    [256, 949.5],
    [254.5, 902.5]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
escalatorLeft.bindPopup("<h3>Escalator (Left, Down)</h3>");

// Escalator (Right, up)
const escalatorRight = L.polygon([
    [435.5, 998],
    [436, 1042.5],
    [255.5, 1043.5],
    [257, 998]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
escalatorRight.bindPopup("<h3>Escalator (Right, Up)</h3>");

// Corner Shop
const cornerShop = L.polygon([
    [453.962554, 1095.308404],
    [454.66966, 1132.785063],
    [398.808225, 1135.613491],
    [400.222438, 1096.015511]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
cornerShop.bindPopup("<h3>Corner Shop</h3>");

// Room S-12
const s12 = L.polygon([
    [329.5, 526.5],
    [329, 595.5],
    [256.5, 595.5],
    [256.5, 526]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s12.bindPopup("<h3>Room S-12</h3>");

// Room S-11
const s11 = L.polygon([
    [329, 595.5],
    [328.5, 664],
    [258.5, 663.5],
    [256.5, 595.5]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s11.bindPopup("<h3>Room S-11</h3>");

// Room S-10
const s10 = L.polygon([
    [328.5, 664],
    [326.5, 726],
    [256, 728.5],
    [258.5, 663.5]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s10.bindPopup("<h3>Room S-10</h3>");

// Room S-9
const s9 = L.polygon([
    [326.5, 726],
    [331, 794],
    [275.5, 796],
    [275.5, 730.5]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s9.bindPopup("<h3>Room S-9</h3>");

// Room S-8
const s8 = L.polygon([
    [331, 794],
    [328.5, 860],
    [275.5, 861.5],
    [275.5, 796]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s8.bindPopup("<h3>Room S-8</h3>");

// Stairs
const stairs = L.polygon([
    [270.5, 759],
    [273, 812],
    [202, 812.5],
    [203.5, 759]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
stairs.bindPopup("<h3>Stairs</h3>");

// Fire Exit
const fireExit4 = L.polygon([
    [273, 812],
    [273, 860],
    [203.5, 861],
    [202, 812.5]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
fireExit4.bindPopup("<h3>Fire Exit</h3>");

// Lift 2
const lift2 = L.polygon([
    [195, 728.5],
    [195.5, 765],
    [164, 766],
    [168, 731.5]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
lift2.bindPopup("<h3>Lift 2</h3>");

// Lift 1
const lift1 = L.polygon([
    [195.5, 765],
    [196.5, 809],
    [165, 809],
    [164, 766]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
lift1.bindPopup("<h3>Lift 1</h3>");

// Lift Lobby
const liftLobby2 = L.polygon([
    [159, 726.5],
    [165, 809],
    [122, 807.5],
    [122, 726]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
liftLobby2.bindPopup("<h3>Lift Lobby</h3>");

// Lift 4
const lift4 = L.polygon([
    [122, 726],
    [119.5, 767.5],
    [78.5, 767.5],
    [78, 727.5]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
lift4.bindPopup("<h3>Lift 4</h3>");

// Lift 3
const lift3 = L.polygon([
    [119.5, 767.5],
    [122, 807.5],
    [78, 806.5],
    [78.5, 767.5]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
lift3.bindPopup("<h3>Lift 3</h3>");

// Rooms S-07 & S-06
const s07_06 = L.polygon([
    [150.613744, 854.184992],
    [151.5, 914],
    [198.5, 915],
    [198.5, 975],
    [69.5, 975],
    [71, 852]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s07_06.bindPopup("<h3>Rooms S-07 & S-06</h3>");

// Room S-05
const s05 = L.polygon([
    [198.5, 975],
    [197.5, 1030.5],
    [69.5, 1030.5],
    [69.5, 975]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s05.bindPopup("<h3>Room S-05</h3>");

// Rooms S-04 & S-03
const s04_03 = L.polygon([
    [197.5, 1030.5],
    [199.5, 1086.5],
    [269.5, 1087.5],
    [269.5, 1210.5],
    [70, 1210],
    [69.5, 1030.5]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s04_03.bindPopup("<h3>Rooms S-04 & S-03</h3>");

// Room S-02
const s02 = L.polygon([
    [269.5, 1087.5],
    [334.5, 1086],
    [333, 1209],
    [269.5, 1210.5]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s02.bindPopup("<h3>Room S-02</h3>");

// Room S-01
const s01 = L.polygon([
    [334.5, 1086],
    [394.5, 1085],
    [395.5, 1209],
    [333, 1209]
], { color: '#cccccc', fillColor: '#cccccc', fillOpacity: 0.1 }).addTo(map);
s01.bindPopup("<h3>Room S-01</h3>");


// 7. Debug tool: click anywhere to get coordinates
/* map.on("click", function (e) {
    console.log(e.latlng);
});

map.on("click", function (e) {
    alert("Clicked at: " + e.latlng);
}); */
