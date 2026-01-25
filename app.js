// Initialize map
const map = L.map('map').setView([40.7128, -74.0060], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// State
let points = [];
let markers = [];
let pentagramLayer = null;
let dataLayer = null;
let extractedData = null;
let maxPoints = 5;

// DOM Elements
const numPointsInput = document.getElementById('numPoints');
const pointCountSpan = document.getElementById('pointCount');
const maxPointsSpan = document.getElementById('maxPoints');
const clearBtn = document.getElementById('clearBtn');
const extractBtn = document.getElementById('extractBtn');
const progressDiv = document.getElementById('progress');
const progressFill = document.getElementById('progressFill');
const statsDiv = document.getElementById('stats');
const exportSection = document.getElementById('exportSection');

// Update max points
numPointsInput.addEventListener('change', () => {
    maxPoints = Math.min(10, Math.max(5, parseInt(numPointsInput.value) || 5));
    numPointsInput.value = maxPoints;
    maxPointsSpan.textContent = maxPoints;
    clearPoints();
});

// Map click handler
map.on('click', (e) => {
    if (points.length >= maxPoints) return;
    
    const { lat, lng } = e.latlng;
    points.push([lng, lat]);
    
    const marker = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: '#667eea',
        color: '#fff',
        weight: 2,
        fillOpacity: 0.8
    }).addTo(map);
    
    marker.bindTooltip(`Point ${points.length}`);
    markers.push(marker);
    
    updateUI();
    
    if (points.length >= 3) {
        drawPentagram();
    }
});

function updateUI() {
    pointCountSpan.textContent = points.length;
    extractBtn.disabled = points.length < maxPoints;
}

function clearPoints() {
    points = [];
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    if (pentagramLayer) map.removeLayer(pentagramLayer);
    if (dataLayer) map.removeLayer(dataLayer);
    pentagramLayer = null;
    dataLayer = null;
    extractedData = null;
    statsDiv.style.display = 'none';
    exportSection.style.display = 'none';
    updateUI();
}

clearBtn.addEventListener('click', clearPoints);

function createPentagramPolygon(pts) {
    // Create a simple closed polygon (not a star)
    // Just connect points in order and close it
    const polygonPoints = [...pts];
    polygonPoints.push(pts[0]); // Close the polygon
    return polygonPoints;
}
}

function createPentagramPolygon(pts) {
    // Create convex hull to ensure solid filled polygon
    const points = turf.featureCollection(pts.map(p => turf.point(p)));
    const hull = turf.convex(points);
    return hull.geometry.coordinates[0];
}
    pentagramLayer = L.polygon(latLngs, {
        color: '#764ba2',
        weight: 3,
        fillColor: '#667eea',
        fillOpacity: 0.2
    }).addTo(map);
}

// Extract OSM Data
extractBtn.addEventListener('click', async () => {
    const categories = Array.from(document.querySelectorAll('.checkbox-group input:checked'))
        .map(cb => cb.value);
    
    if (categories.length === 0) {
        alert('Please select at least one data category');
        return;
    }
    
    extractBtn.disabled = true;
    progressDiv.style.display = 'block';
    progressFill.style.width = '0%';
    progressFill.textContent = '0%';
    
    try {
        const polygon = turf.polygon([createPentagramPolygon(points)]);
        const bbox = turf.bbox(polygon);
        
        const query = buildOverpassQuery(bbox, categories);
        
        progressFill.style.width = '30%';
        progressFill.textContent = '30%';
        
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });
        
        progressFill.style.width = '70%';
        progressFill.textContent = '70%';
        
        const data = await response.json();
        extractedData = processOSMData(data, polygon);
        
        progressFill.style.width = '100%';
        progressFill.textContent = '100%';
        
        displayResults(extractedData, polygon);
        
    } catch (error) {
        console.error('Extraction error:', error);
        alert('Error extracting data. Please try again.');
    } finally {
        extractBtn.disabled = false;
        setTimeout(() => progressDiv.style.display = 'none', 1000);
    }
});

function buildOverpassQuery(bbox, categories) {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const bboxStr = `${minLat},${minLng},${maxLat},${maxLng}`;
    
    let filters = categories.map(cat => {
        return `node["${cat}"](${bboxStr});way["${cat}"](${bboxStr});relation["${cat}"](${bboxStr});`;
    }).join('');
    
    return `[out:json][timeout:60];(${filters});out body;>;out skel qt;`;
}

function processOSMData(data, polygon) {
    const nodes = {};
    const features = [];
    
    // Index nodes
    data.elements.filter(e => e.type === 'node').forEach(node => {
        nodes[node.id] = [node.lon, node.lat];
    });
    
    data.elements.forEach(element => {
        let geometry = null;
        
        if (element.type === 'node' && element.tags) {
            geometry = { type: 'Point', coordinates: [element.lon, element.lat] };
        } else if (element.type === 'way' && element.nodes) {
            const coords = element.nodes.map(id => nodes[id]).filter(Boolean);
            if (coords.length >= 2) {
                geometry = coords[0][0] === coords[coords.length-1][0] && 
                           coords[0][1] === coords[coords.length-1][1] && coords.length >= 4
                    ? { type: 'Polygon', coordinates: [coords] }
                    : { type: 'LineString', coordinates: coords };
            }
        }
        
        if (geometry && element.tags) {
            const feature = {
                type: 'Feature',
                properties: { id: element.id, ...element.tags },
                geometry
            };
            
            // Check if within pentagram
            try {
                const point = geometry.type === 'Point' 
                    ? turf.point(geometry.coordinates)
                    : turf.centroid(feature);
                if (turf.booleanPointInPolygon(point, polygon)) {
                    features.push(feature);
                }
            } catch (e) {}
        }
    });
    
    return { type: 'FeatureCollection', features };
}

function displayResults(geojson, polygon) {
    if (dataLayer) map.removeLayer(dataLayer);
    
    dataLayer = L.geoJSON(geojson, {
        style: feature => ({
            color: '#e74c3c',
            weight: 2,
            fillOpacity: 0.3
        }),
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
            radius: 5,
            fillColor: '#e74c3c',
            color: '#fff',
            weight: 1,
            fillOpacity: 0.8
        }),
        onEachFeature: (feature, layer) => {
            const props = feature.properties;
            const name = props.name || props.amenity || props.highway || 'Unknown';
            layer.bindPopup(`<strong>${name}</strong><br>ID: ${props.id}`);
        }
    }).addTo(map);
    
    // Calculate stats
    const area = turf.area(polygon) / 1000000;
    const roads = geojson.features.filter(f => f.properties.highway).length;
    const buildings = geojson.features.filter(f => f.properties.building).length;
    const pois = geojson.features.filter(f => f.properties.amenity).length;
    
    document.getElementById('areaValue').textContent = area.toFixed(2) + ' km²';
    document.getElementById('totalFeatures').textContent = geojson.features.length;
    document.getElementById('roadCount').textContent = roads;
    document.getElementById('buildingCount').textContent = buildings;
    document.getElementById('poiCount').textContent = pois;
    
    statsDiv.style.display = 'block';
    exportSection.style.display = 'block';
}

// Export functions
document.getElementById('exportGeoJSON').addEventListener('click', () => {
    downloadFile(JSON.stringify(extractedData, null, 2), 'osm_data.geojson', 'application/json');
});

document.getElementById('exportOSM').addEventListener('click', () => {
    const xml = convertToOSMXML(extractedData);
    downloadFile(xml, 'osm_data.osm', 'application/xml');
});

document.getElementById('exportCSV').addEventListener('click', () => {
    const csv = convertToCSV(extractedData);
    downloadFile(csv, 'osm_data.csv', 'text/csv');
});

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function convertToOSMXML(geojson) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<osm version="0.6">\n';
    geojson.features.forEach(f => {
        const props = f.properties;
        const tags = Object.entries(props)
            .filter(([k]) => k !== 'id')
            .map(([k, v]) => `    <tag k="${k}" v="${String(v).replace(/"/g, '&quot;')}"/>`)
            .join('\n');
        
        if (f.geometry.type === 'Point') {
            xml += `  <node id="${props.id}" lat="${f.geometry.coordinates[1]}" lon="${f.geometry.coordinates[0]}">\n${tags}\n  </node>\n`;
        }
    });
    xml += '</osm>';
    return xml;
}

function convertToCSV(geojson) {
    const rows = [['id', 'type', 'name', 'lat', 'lon', 'tags']];
    geojson.features.forEach(f => {
        const props = f.properties;
        const coords = f.geometry.type === 'Point' 
            ? f.geometry.coordinates 
            : turf.centroid(f).geometry.coordinates;
        rows.push([
            props.id,
            f.geometry.type,
            props.name || '',
            coords[1],
            coords[0],
            JSON.stringify(props)
        ]);
    });
    return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');

}

