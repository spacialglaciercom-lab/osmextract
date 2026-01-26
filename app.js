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
// Better mobile detection that works with dev tools
function detectMobile() {
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobileUserAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth < 768;
    
    return isMobileUserAgent || isTouchDevice || isSmallScreen;
}

let isMobile = detectMobile();

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
    isMobile = detectMobile();
    
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

// Extract OSM Data with retry logic and multiple endpoints
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
        
        // Try multiple Overpass API endpoints with retry logic
        const endpoints = [
            'https://overpass-api.de/api/interpreter',
            'https://lz4.overpass-api.de/api/interpreter',
            'https://z.overpass-api.de/api/interpreter'
        ];
        
        let data = null;
        let lastError = null;
        
        for (let i = 0; i < endpoints.length; i++) {
            try {
                progressFill.textContent = `Trying endpoint ${i + 1}...`;
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
                
                const response = await fetch(endpoints[i], {
                    method: 'POST',
                    body: query,
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                progressFill.style.width = '60%';
                progressFill.textContent = 'Downloading...';
                
                data = await response.json();
                break; // Success, exit loop
                
            } catch (error) {
                lastError = error;
                console.warn(`Endpoint ${i + 1} failed:`, error.message);
                
                if (i < endpoints.length - 1) {
                    showToast(`Endpoint ${i + 1} failed, trying backup...`, 'warning', 2000);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
                }
            }
        }
        
        if (!data) {
            // Offer to use sample data for testing
            const useSampleData = confirm(`All Overpass API endpoints failed. Last error: ${lastError?.message || 'Unknown error'}\n\nWould you like to use sample data for testing instead?`);
            
            if (useSampleData) {
                data = generateSampleOSMData(bbox);
                showToast('Using sample data for testing', 'info', 3000);
            } else {
                throw new Error(`All endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`);
            }
        }
        
        progressFill.style.width = '80%';
        progressFill.textContent = 'Processing...';
        
        extractedData = processOSMData(data, polygon);
        
        progressFill.style.width = '100%';
        progressFill.textContent = 'Complete!';
        
        displayResults(extractedData, polygon);
        showToast(`Found ${extractedData.features.length} features!`, 'success');
        
    } catch (error) {
        console.error('Extraction error:', error);
        
        let errorMessage = 'Unknown error occurred';
        if (error.name === 'AbortError') {
            errorMessage = 'Request timed out. Try a smaller area.';
        } else if (error.message.includes('504')) {
            errorMessage = 'Server overloaded. Try again in a few minutes.';
        } else if (error.message.includes('Failed to fetch')) {
            errorMessage = 'Network error. Check your connection.';
        } else {
            errorMessage = error.message;
        }
        
        showToast(`Error: ${errorMessage}`, 'error', 8000);
        progressFill.style.width = '0%';
        progressFill.textContent = 'Failed';
    } finally {
        extractBtn.disabled = false;
        extractBtn.classList.remove('loading');
        setTimeout(() => {
            progressDiv.style.display = 'none';
        }, 3000);
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

function generateSampleOSMData(bbox) {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const latRange = maxLat - minLat;
    const lngRange = maxLng - minLng;
    
    const elements = [];
    let nodeId = 1000000;
    let wayId = 2000000;
    
    // Generate sample nodes (POIs)
    for (let i = 0; i < 15; i++) {
        const lat = centerLat + (Math.random() - 0.5) * latRange * 0.8;
        const lng = centerLng + (Math.random() - 0.5) * lngRange * 0.8;
        
        const amenityTypes = ['restaurant', 'cafe', 'shop', 'bank', 'pharmacy', 'hospital', 'school', 'park'];
        const amenity = amenityTypes[Math.floor(Math.random() * amenityTypes.length)];
        
        elements.push({
            type: 'node',
            id: nodeId++,
            lat: lat,
            lon: lng,
            tags: {
                amenity: amenity,
                name: `Sample ${amenity} ${i + 1}`
            }
        });
    }
    
    // Generate sample ways (roads)
    for (let i = 0; i < 8; i++) {
        const startLat = centerLat + (Math.random() - 0.5) * latRange * 0.6;
        const startLng = centerLng + (Math.random() - 0.5) * lngRange * 0.6;
        
        const wayNodes = [];
        const numNodes = 3 + Math.floor(Math.random() * 4);
        
        for (let j = 0; j < numNodes; j++) {
            const lat = startLat + j * (Math.random() - 0.5) * latRange * 0.1;
            const lng = startLng + j * (Math.random() - 0.5) * lngRange * 0.1;
            
            elements.push({
                type: 'node',
                id: nodeId,
                lat: lat,
                lon: lng
            });
            
            wayNodes.push(nodeId);
            nodeId++;
        }
        
        const roadTypes = ['primary', 'secondary', 'residential', 'service'];
        const highway = roadTypes[Math.floor(Math.random() * roadTypes.length)];
        
        elements.push({
            type: 'way',
            id: wayId++,
            nodes: wayNodes,
            tags: {
                highway: highway,
                name: `Sample ${highway} Street ${i + 1}`
            }
        });
    }
    
    // Generate sample buildings
    for (let i = 0; i < 10; i++) {
        const centerLat2 = centerLat + (Math.random() - 0.5) * latRange * 0.7;
        const centerLng2 = centerLng + (Math.random() - 0.5) * lngRange * 0.7;
        const size = 0.0001; // Small building size
        
        const buildingNodes = [];
        const corners = [
            [centerLat2 - size, centerLng2 - size],
            [centerLat2 - size, centerLng2 + size],
            [centerLat2 + size, centerLng2 + size],
            [centerLat2 + size, centerLng2 - size],
            [centerLat2 - size, centerLng2 - size] // Close the polygon
        ];
        
        corners.forEach(([lat, lng]) => {
            elements.push({
                type: 'node',
                id: nodeId,
                lat: lat,
                lon: lng
            });
            buildingNodes.push(nodeId);
            nodeId++;
        });
        
        elements.push({
            type: 'way',
            id: wayId++,
            nodes: buildingNodes,
            tags: {
                building: 'yes',
                name: `Sample Building ${i + 1}`
            }
        });
    }
    
    return { elements };
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

// Add JOSM-compatible export
document.getElementById('exportJOSM').addEventListener('click', () => {
    showToast('Converting to JOSM format...', 'info');
    const josmXml = convertToJOSMXML(extractedData);
    downloadFile(josmXml, 'osm_data_josm.osm', 'application/xml');
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
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<osm version="0.6" generator="OSM Pentagram Extractor">\n';
    
    // Use positive IDs in a safe range (900M+) to avoid conflicts with real OSM data
    // Real OSM IDs are typically much lower, so this range should be safe
    let nextNodeId = 900000000;
    let nextWayId = 950000000;
    
    // First pass: collect all nodes (both standalone and from ways)
    const allNodes = new Map();
    
    geojson.features.forEach(feature => {
        const props = feature.properties;
        const geometry = feature.geometry;
        const originalId = props.id;
        
        if (geometry.type === 'Point') {
            const [lon, lat] = geometry.coordinates;
            // Use original ID if it's positive and in reasonable range, otherwise generate safe ID
            const nodeId = (originalId && originalId > 0 && originalId < 800000000) ? originalId : nextNodeId++;
            allNodes.set(nodeId, {
                id: nodeId,
                lat: lat,
                lon: lon,
                tags: props
            });
        } else if (geometry.type === 'LineString') {
            geometry.coordinates.forEach(coord => {
                const [lon, lat] = coord;
                const nodeId = nextNodeId++;
                allNodes.set(nodeId, {
                    id: nodeId,
                    lat: lat,
                    lon: lon,
                    tags: {} // Way nodes typically don't have tags
                });
            });
        } else if (geometry.type === 'Polygon') {
            geometry.coordinates[0].forEach(coord => {
                const [lon, lat] = coord;
                const nodeId = nextNodeId++;
                allNodes.set(nodeId, {
                    id: nodeId,
                    lat: lat,
                    lon: lon,
                    tags: {} // Polygon nodes typically don't have tags
                });
            });
        }
    });
    
    // Write all nodes first (required by OSM XML schema)
    allNodes.forEach(node => {
        xml += `  <node id="${node.id}" version="1" lat="${node.lat.toFixed(7)}" lon="${node.lon.toFixed(7)}"`;
        
        const filteredTags = getFilteredTags(node.tags);
        if (Object.keys(filteredTags).length > 0) {
            xml += '>\n';
            Object.entries(filteredTags).forEach(([k, v]) => {
                xml += `    <tag k="${escapeXml(k)}" v="${escapeXml(String(v))}"/>\n`;
            });
            xml += '  </node>\n';
        } else {
            xml += '/>\n';
        }
    });
    
    // Second pass: write ways with positive IDs
    let currentNodeId = 900000000;
    geojson.features.forEach(feature => {
        const props = feature.properties;
        const geometry = feature.geometry;
        
        if (geometry.type === 'LineString' || geometry.type === 'Polygon') {
            const originalId = props.id;
            const wayId = (originalId && originalId > 0 && originalId < 800000000) ? originalId : nextWayId++;
            const coords = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates;
            
            xml += `  <way id="${wayId}" version="1">\n`;
            
            // Add node references
            coords.forEach(() => {
                xml += `    <nd ref="${currentNodeId}"/>\n`;
                currentNodeId++;
            });
            
            // Add tags
            const filteredTags = getFilteredTags(props);
            Object.entries(filteredTags).forEach(([k, v]) => {
                xml += `    <tag k="${escapeXml(k)}" v="${escapeXml(String(v))}"/>\n`;
            });
            
            xml += '  </way>\n';
        }
    });
    
    xml += '</osm>\n';
    return xml;
}

function convertToJOSMXML(geojson) {
    // Calculate bounds for the dataset
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    
    geojson.features.forEach(feature => {
        const geometry = feature.geometry;
        let coords = [];
        
        if (geometry.type === 'Point') {
            coords = [geometry.coordinates];
        } else if (geometry.type === 'LineString') {
            coords = geometry.coordinates;
        } else if (geometry.type === 'Polygon') {
            coords = geometry.coordinates[0];
        }
        
        coords.forEach(([lon, lat]) => {
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
        });
    });
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<osm version="0.6" generator="OSM Pentagram Extractor" copyright="OpenStreetMap and contributors" attribution="http://www.openstreetmap.org/copyright" license="http://opendatacommons.org/licenses/odbl/1-0/">\n`;
    xml += `  <bounds minlat="${minLat.toFixed(7)}" minlon="${minLon.toFixed(7)}" maxlat="${maxLat.toFixed(7)}" maxlon="${maxLon.toFixed(7)}"/>\n\n`;
    
    // Use positive IDs in safe range to avoid conflicts and corruption
    let nodeId = 900000000;
    let wayId = 950000000;
    const nodeMap = new Map();
    const timestamp = new Date().toISOString();
    
    // First pass: create all nodes with positive IDs
    geojson.features.forEach(feature => {
        const geometry = feature.geometry;
        
        if (geometry.type === 'Point') {
            const [lon, lat] = geometry.coordinates;
            const id = nodeId++;
            nodeMap.set(`${lon},${lat}`, id);
            
            xml += `  <node id="${id}" visible="true" version="1" changeset="1" timestamp="${timestamp}" user="OSM_Extractor" uid="1" lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"`;
            
            const filteredTags = getFilteredTags(feature.properties);
            if (Object.keys(filteredTags).length > 0) {
                xml += '>\n';
                Object.entries(filteredTags).forEach(([k, v]) => {
                    xml += `    <tag k="${escapeXml(k)}" v="${escapeXml(String(v))}"/>\n`;
                });
                xml += '  </node>\n';
            } else {
                xml += '/>\n';
            }
        } else if (geometry.type === 'LineString' || geometry.type === 'Polygon') {
            const coords = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates;
            coords.forEach(([lon, lat]) => {
                const coordKey = `${lon},${lat}`;
                if (!nodeMap.has(coordKey)) {
                    const id = nodeId++;
                    nodeMap.set(coordKey, id);
                    xml += `  <node id="${id}" visible="true" version="1" changeset="1" timestamp="${timestamp}" user="OSM_Extractor" uid="1" lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"/>\n`;
                }
            });
        }
    });
    
    xml += '\n';
    
    // Second pass: create ways with positive IDs
    geojson.features.forEach(feature => {
        const geometry = feature.geometry;
        
        if (geometry.type === 'LineString' || geometry.type === 'Polygon') {
            const id = wayId++;
            const coords = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates;
            
            xml += `  <way id="${id}" visible="true" version="1" changeset="1" timestamp="${timestamp}" user="OSM_Extractor" uid="1">\n`;
            
            coords.forEach(([lon, lat]) => {
                const nodeRef = nodeMap.get(`${lon},${lat}`);
                xml += `    <nd ref="${nodeRef}"/>\n`;
            });
            
            const filteredTags = getFilteredTags(feature.properties);
            Object.entries(filteredTags).forEach(([k, v]) => {
                xml += `    <tag k="${escapeXml(k)}" v="${escapeXml(String(v))}"/>\n`;
            });
            
            xml += '  </way>\n';
        }
    });
    
    xml += '</osm>\n';
    return xml;
}

function getFilteredTags(props) {
    const filtered = { ...props };
    // Remove internal properties that shouldn't be in OSM
    delete filtered.id;
    delete filtered.type;
    delete filtered.timestamp;
    delete filtered.version;
    delete filtered.changeset;
    delete filtered.user;
    delete filtered.uid;
    
    // Ensure we have valid OSM tags
    if (Object.keys(filtered).length === 0) {
        // Add a default tag if no valid tags exist
        filtered.note = 'Extracted from OSM Pentagram Boundary Extractor';
    }
    
    return filtered;
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
    const rows = [['id', 'type', 'name', 'lat', 'lon', 'category', 'geometry_type', 'all_tags']];
    
    geojson.features.forEach(f => {
        const props = f.properties;
        let coords = [0, 0];
        
        try {
            if (f.geometry.type === 'Point') {
                coords = f.geometry.coordinates;
            } else if (f.geometry.type === 'LineString') {
                // Use midpoint for linestrings
                const midIndex = Math.floor(f.geometry.coordinates.length / 2);
                coords = f.geometry.coordinates[midIndex];
            } else if (f.geometry.type === 'Polygon') {
                // Use centroid for polygons
                coords = turf.centroid(f).geometry.coordinates;
            }
        } catch (e) {
            console.warn('Error getting coordinates for feature:', f.properties.id, e);
        }
        
        const category = props.highway ? 'highway' : 
                        props.building ? 'building' :
                        props.amenity ? 'amenity' :
                        props.natural ? 'natural' :
                        props.landuse ? 'landuse' :
                        props.waterway ? 'waterway' : 'other';
        
        const name = props.name || props.amenity || props.highway || props.building || props.natural || '';
        
        // Create clean tags object without internal properties
        const cleanTags = {...props};
        delete cleanTags.id;
        
        rows.push([
            props.id || '',
            f.geometry.type || '',
            name,
            coords[1], // latitude
            coords[0], // longitude
            category,
            f.geometry.type,
            JSON.stringify(cleanTags).replace(/"/g, '""')
        ]);
    });
    
    return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

// Initialize UI and mobile detection
updateUI();

// Debug information for mobile
console.log('Mobile detected:', isMobile);
console.log('Touch events supported:', 'ontouchstart' in window);
console.log('Screen width:', window.innerWidth);
console.log('User agent contains mobile:', /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase()));
console.log('Max touch points:', navigator.maxTouchPoints);
console.log('Map initialized with click handler');

// Ensure map is ready for interaction
map.whenReady(() => {
    console.log('Map is ready for interaction');
    showToast('Click/tap map to add points!', 'info', 3000);
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
