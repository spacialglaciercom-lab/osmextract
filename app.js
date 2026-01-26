// Initialize map with mobile-optimized settings
const map = L.map('map', {
    tap: true,
    tapTolerance: 15,
    touchZoom: true,
    doubleClickZoom: true,
    boxZoom: true,
    keyboard: true,
    scrollWheelZoom: true,
    bounceAtZoomLimits: false,
    zoomSnap: 0.5,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 60,
    preferCanvas: false
}).setView([40.7128, -74.0060], 12);

// Use higher quality tiles for better mobile experience
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    detectRetina: true
}).addTo(map);

// State
let points = [];
let markers = [];
let polygonLayer = null;
let dataLayer = null;
let extractedData = null;
let maxPoints = 5;
let isMobile = window.innerWidth < 768;

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
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menuToggle');
const overlay = document.getElementById('overlay');

// Mobile menu functionality
function initMobileMenu() {
    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSidebar();
    });
    
    overlay.addEventListener('click', (e) => {
        e.stopPropagation();
        closeSidebar();
    });
    
    // Prevent sidebar clicks from bubbling to map
    sidebar.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Close sidebar when clicking map area on mobile
    if (isMobile) {
        document.getElementById('map').addEventListener('click', (e) => {
            if (sidebar.classList.contains('open')) {
                // Allow the map click to process first, then close sidebar
                setTimeout(closeSidebar, 100);
            }
        });
    }
}

function toggleSidebar() {
    const isOpen = sidebar.classList.contains('open');
    if (isOpen) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('active');
    menuToggle.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    menuToggle.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Responsive behavior
function handleResize() {
    const wasMobile = isMobile;
    isMobile = window.innerWidth < 768;
    
    if (wasMobile && !isMobile) {
        // Switched from mobile to desktop
        closeSidebar();
        document.body.style.overflow = 'auto';
    }
    
    // Invalidate map size after resize
    setTimeout(() => map.invalidateSize(), 300);
}

window.addEventListener('resize', handleResize);

// Initialize mobile menu
initMobileMenu();

// Enhanced click/touch handling for map interactions
function handleMapClick(e) {
    // Prevent adding points if we're at maximum
    if (points.length >= maxPoints) {
        showToast('Maximum points reached');
        return;
    }
    
    const { lat, lng } = e.latlng;
    points.push([lng, lat]);
    
    // Create marker with enhanced mobile styling
    const marker = L.circleMarker([lat, lng], {
        radius: isMobile ? 12 : 8,
        fillColor: '#2563eb',
        color: '#ffffff',
        weight: 3,
        fillOpacity: 0.9,
        interactive: false // Prevent marker from interfering with map clicks
    }).addTo(map);
    
    // Enhanced tooltip for mobile
    marker.bindTooltip(`Point ${points.length}`, {
        permanent: false,
        direction: 'top',
        offset: [0, -10],
        className: 'custom-tooltip'
    });
    
    markers.push(marker);
    
    updateUI();
    drawPolygon();
    
    // Provide haptic feedback if available
    if (navigator.vibrate) {
        navigator.vibrate(50);
    }
    
    // Auto-close sidebar on mobile after adding point
    if (isMobile && sidebar.classList.contains('open')) {
        setTimeout(closeSidebar, 800);
    }
    
    showToast(`Point ${points.length} added`);
}

// Simple event handler - works on both desktop and mobile
map.on('click', handleMapClick);

// Update max points
numPointsInput.addEventListener('change', () => {
    maxPoints = Math.min(10, Math.max(5, parseInt(numPointsInput.value) || 5));
    numPointsInput.value = maxPoints;
    maxPointsSpan.textContent = maxPoints;
    clearPoints();
});

function updateUI() {
    pointCountSpan.textContent = points.length;
    extractBtn.disabled = points.length < maxPoints;
    
    // Update button text for mobile
    if (isMobile) {
        extractBtn.textContent = points.length < maxPoints 
            ? `Need ${maxPoints - points.length} more points`
            : 'Extract OSM Data';
    } else {
        extractBtn.textContent = 'Extract OSM Data';
    }
}

function clearPoints() {
    points = [];
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    if (polygonLayer) map.removeLayer(polygonLayer);
    if (dataLayer) map.removeLayer(dataLayer);
    polygonLayer = null;
    dataLayer = null;
    extractedData = null;
    statsDiv.style.display = 'none';
    exportSection.style.display = 'none';
    updateUI();
    
    showToast('Points cleared');
}

clearBtn.addEventListener('click', clearPoints);

function getPolygonCoordinates() {
    if (points.length < 3) return null;
    
    // Sort points clockwise around centroid for proper polygon
    const centroid = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    centroid[0] /= points.length;
    centroid[1] /= points.length;
    
    const sortedPoints = [...points].sort((a, b) => {
        const angleA = Math.atan2(a[1] - centroid[1], a[0] - centroid[0]);
        const angleB = Math.atan2(b[1] - centroid[1], b[0] - centroid[0]);
        return angleA - angleB;
    });
    
    // Close the polygon
    return [...sortedPoints, sortedPoints[0]];
}

function drawPolygon() {
    if (polygonLayer) map.removeLayer(polygonLayer);
    
    if (points.length < 3) return;
    
    const coords = getPolygonCoordinates();
    const latLngs = coords.map(p => [p[1], p[0]]);
    
    polygonLayer = L.polygon(latLngs, {
        color: '#2563eb',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 0.2,
        dashArray: '5, 10'
    }).addTo(map);
    
    // Fit bounds with padding for mobile
    if (points.length === maxPoints) {
        const padding = isMobile ? 50 : 20;
        map.fitBounds(polygonLayer.getBounds(), { padding: [padding, padding] });
    }
}

// Enhanced toast notification system
function showToast(message, type = 'info', duration = 3000) {
    // Remove existing toasts
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--surface);
        color: var(--text);
        padding: 12px 20px;
        border-radius: var(--radius);
        border: 1px solid var(--border);
        box-shadow: 0 10px 25px var(--shadow);
        z-index: 10000;
        font-family: var(--font-display);
        font-size: 14px;
        font-weight: 500;
        backdrop-filter: blur(20px);
        opacity: 0;
        transition: all 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    
    // Remove after duration
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Extract OSM Data with mobile optimizations
extractBtn.addEventListener('click', async () => {
    const categories = Array.from(document.querySelectorAll('.checkbox-group input:checked'))
        .map(cb => cb.value);
    
    if (categories.length === 0) {
        showToast('Please select at least one data category', 'warning');
        return;
    }
    
    // Close sidebar on mobile during extraction
    if (isMobile) {
        closeSidebar();
    }
    
    extractBtn.disabled = true;
    extractBtn.classList.add('loading');
    progressDiv.style.display = 'block';
    progressFill.style.width = '0%';
    progressFill.textContent = 'Starting...';
    
    try {
        const coords = getPolygonCoordinates();
        const polygon = turf.polygon([coords]);
        const bbox = turf.bbox(polygon);
        
        const query = buildOverpassQuery(bbox, categories);
        
        progressFill.style.width = '20%';
        progressFill.textContent = 'Building query...';
        
        showToast('Fetching OSM data...', 'info');
        
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        progressFill.style.width = '60%';
        progressFill.textContent = 'Downloading...';
        
        const data = await response.json();
        
        progressFill.style.width = '80%';
        progressFill.textContent = 'Processing...';
        
        extractedData = processOSMData(data, polygon);
        
        progressFill.style.width = '100%';
        progressFill.textContent = 'Complete!';
        
        displayResults(extractedData, polygon);
        showToast(`Found ${extractedData.features.length} features!`, 'success');
        
    } catch (error) {
        console.error('Extraction error:', error);
        showToast(`Error: ${error.message}`, 'error', 5000);
        progressFill.style.width = '0%';
        progressFill.textContent = '0%';
    } finally {
        extractBtn.disabled = false;
        extractBtn.classList.remove('loading');
        setTimeout(() => {
            progressDiv.style.display = 'none';
        }, 2000);
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
    
    let processed = 0;
    const total = data.elements.length;
    
    data.elements.forEach(element => {
        let geometry = null;
        
        if (element.type === 'node' && element.tags) {
            geometry = { type: 'Point', coordinates: [element.lon, element.lat] };
        } else if (element.type === 'way' && element.nodes) {
            const coords = element.nodes.map(id => nodes[id]).filter(Boolean);
            if (coords.length >= 2) {
                const isClosed = coords.length >= 4 && 
                    coords[0][0] === coords[coords.length-1][0] && 
                    coords[0][1] === coords[coords.length-1][1];
                geometry = isClosed
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
            
            // Check if within polygon
            try {
                let point;
                if (geometry.type === 'Point') {
                    point = turf.point(geometry.coordinates);
                } else if (geometry.type === 'LineString') {
                    const midIndex = Math.floor(geometry.coordinates.length / 2);
                    point = turf.point(geometry.coordinates[midIndex]);
                } else {
                    point = turf.centroid(feature);
                }
                
                if (turf.booleanPointInPolygon(point, polygon)) {
                    features.push(feature);
                }
            } catch (e) {
                console.warn('Error checking feature:', e);
            }
        }
        
        processed++;
    });
    
    return { type: 'FeatureCollection', features };
}

function displayResults(geojson, polygon) {
    if (dataLayer) map.removeLayer(dataLayer);
    
    // Enhanced styling for mobile visibility
    dataLayer = L.geoJSON(geojson, {
        style: feature => {
            const baseStyle = {
                color: '#06b6d4',
                weight: isMobile ? 3 : 2,
                fillOpacity: 0.4,
                opacity: 0.8
            };
            
            // Different colors for different feature types
            if (feature.properties.highway) {
                return { ...baseStyle, color: '#ef4444' };
            } else if (feature.properties.building) {
                return { ...baseStyle, color: '#8b5cf6' };
            } else if (feature.properties.amenity) {
                return { ...baseStyle, color: '#10b981' };
            }
            return baseStyle;
        },
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
            radius: isMobile ? 8 : 5,
            fillColor: getFeatureColor(feature.properties),
            color: '#ffffff',
            weight: 2,
            fillOpacity: 0.8
        }),
        onEachFeature: (feature, layer) => {
            const props = feature.properties;
            const name = props.name || props.amenity || props.highway || props.building || 'Unknown';
            const type = props.highway ? 'Highway' : props.building ? 'Building' : props.amenity ? 'POI' : 'Feature';
            
            const popupContent = `
                <div style="font-family: var(--font-display); min-width: 200px;">
                    <h4 style="margin: 0 0 8px 0; color: var(--primary);">${name}</h4>
                    <p style="margin: 0 0 4px 0; font-size: 12px; color: var(--text-muted);">Type: ${type}</p>
                    <p style="margin: 0; font-size: 11px; font-family: var(--font-mono); color: var(--text-muted);">ID: ${props.id}</p>
                </div>
            `;
            
            layer.bindPopup(popupContent, {
                maxWidth: 300,
                className: 'custom-popup'
            });
        }
    }).addTo(map);
    
    // Calculate and display stats
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
    
    // Auto-open sidebar on mobile to show results
    if (isMobile && !sidebar.classList.contains('open')) {
        setTimeout(() => {
            openSidebar();
            // Scroll to stats
            setTimeout(() => {
                statsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
        }, 500);
    }
}

function getFeatureColor(props) {
    if (props.highway) return '#ef4444';
    if (props.building) return '#8b5cf6';
    if (props.amenity) return '#10b981';
    if (props.natural) return '#059669';
    return '#06b6d4';
}

// Enhanced export functions with mobile considerations
document.getElementById('exportGeoJSON').addEventListener('click', () => {
    showToast('Downloading GeoJSON...', 'info');
    downloadFile(JSON.stringify(extractedData, null, 2), 'osm_data.geojson', 'application/json');
});

document.getElementById('exportOSM').addEventListener('click', () => {
    showToast('Converting to OSM XML...', 'info');
    const xml = convertToOSMXML(extractedData);
    downloadFile(xml, 'osm_data.osm', 'application/xml');
});

document.getElementById('exportCSV').addEventListener('click', () => {
    showToast('Converting to CSV...', 'info');
    const csv = convertToCSV(extractedData);
    downloadFile(csv, 'osm_data.csv', 'text/csv');
});

function downloadFile(content, filename, type) {
    try {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Downloaded ${filename}`, 'success');
    } catch (error) {
        showToast('Download failed', 'error');
        console.error('Download error:', error);
    }
}

function convertToOSMXML(geojson) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<osm version="0.6">\n';
    geojson.features.forEach(f => {
        const props = f.properties;
        const tags = Object.entries(props)
            .filter(([k]) => k !== 'id')
            .map(([k, v]) => `    <tag k="${escapeXml(k)}" v="${escapeXml(String(v))}"/>`)
            .join('\n');
        
        if (f.geometry.type === 'Point') {
            xml += `  <node id="${props.id}" lat="${f.geometry.coordinates[1]}" lon="${f.geometry.coordinates[0]}">\n${tags}\n  </node>\n`;
        }
    });
    xml += '</osm>';
    return xml;
}

function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

function convertToCSV(geojson) {
    const rows = [['id', 'type', 'name', 'lat', 'lon', 'category', 'tags']];
    geojson.features.forEach(f => {
        const props = f.properties;
        let coords;
        try {
            coords = f.geometry.type === 'Point' 
                ? f.geometry.coordinates 
                : turf.centroid(f).geometry.coordinates;
        } catch (e) {
            coords = [0, 0];
        }
        
        const category = props.highway ? 'highway' : 
                        props.building ? 'building' :
                        props.amenity ? 'amenity' :
                        props.natural ? 'natural' : 'other';
        
        rows.push([
            props.id || '',
            f.geometry.type || '',
            props.name || '',
            coords[1],
            coords[0],
            category,
            JSON.stringify(props).replace(/"/g, '""')
        ]);
    });
    return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

// Initialize UI and mobile detection
updateUI();

// Debug information for mobile
console.log('Mobile detected:', isMobile);
console.log('Touch events supported:', 'ontouchstart' in window);
console.log('Map initialized with click handler');

// Ensure map is ready for interaction
map.whenReady(() => {
    console.log('Map is ready for interaction');
    showToast('Tap map to add points!', 'info', 2000);
});

// Add custom CSS for enhanced mobile styles
const style = document.createElement('style');
style.textContent = `
    .custom-tooltip {
        background: var(--surface) !important;
        border: 1px solid var(--border) !important;
        color: var(--text) !important;
        border-radius: var(--radius) !important;
        box-shadow: 0 4px 12px var(--shadow) !important;
        font-family: var(--font-display) !important;
        font-size: 12px !important;
        font-weight: 500 !important;
    }
    
    .custom-tooltip::before {
        border-top-color: var(--surface) !important;
    }
    
    .custom-popup .leaflet-popup-content {
        margin: 8px 12px !important;
    }
    
    .leaflet-container a {
        color: var(--primary) !important;
    }
    
    .leaflet-control-zoom {
        border: 1px solid var(--border) !important;
        border-radius: var(--radius) !important;
        overflow: hidden;
        box-shadow: 0 4px 12px var(--shadow) !important;
    }
    
    .leaflet-control-zoom a {
        background: var(--surface) !important;
        color: var(--text) !important;
        border: none !important;
        width: 40px !important;
        height: 40px !important;
        line-height: 40px !important;
        font-size: 18px !important;
    }
    
    .leaflet-control-zoom a:hover {
        background: var(--surface-light) !important;
    }
    
    @media (max-width: 767px) {
        .leaflet-control-zoom {
            margin-top: 20px !important;
            margin-right: 20px !important;
        }
        
        .leaflet-control-zoom a {
            width: 50px !important;
            height: 50px !important;
            line-height: 50px !important;
            font-size: 20px !important;
        }
    }
`;
document.head.appendChild(style);

// Performance optimization: Debounce resize events
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(handleResize, 150);
});

// Add service worker registration for PWA capabilities (optional)
if ('serviceWorker' in navigator && 'production' === 'production') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => console.log('SW registered'))
            .catch(error => console.log('SW registration failed'));
    });
}
