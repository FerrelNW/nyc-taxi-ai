// Initialize map
let map, pickupMarker, clusterLayers = [], clusterPolygons = [], predictionMarkers = [], selectedZone = null;

function initializeMap() {
    map = L.map('map').setView([40.7580, -73.9855], 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    // Set current time
    const now = new Date();
    document.getElementById('hour').value = now.getHours();
    document.getElementById('day').value = now.getDay() - 1;

    // Map click handler
    map.on('click', function(e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        
        // Add ripple effect
        const ripple = L.circle(e.latlng, {
            radius: 20,
            color: '#10B981',
            fillColor: '#10B981',
            fillOpacity: 0.3,
            weight: 0
        }).addTo(map);
        
        setTimeout(() => {
            map.removeLayer(ripple);
        }, 500);
        
        setPickupMarker(lat, lng);
        reverseGeocode(lat, lng, 'pickup_input');
    });

    // Initialize with default location
    setTimeout(() => {
        setPickupMarker(40.7489, -73.9680);
        document.getElementById('pickup_input').value = 'Times Square, New York';
        reverseGeocode(40.7489, -73.9680, 'pickup_input');
        loadClusters();
    }, 1000);
}

// MARKER FUNCTIONS
function setPickupMarker(lat, lng) {
    if (pickupMarker) map.removeLayer(pickupMarker);
    
    pickupMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'pickup-marker',
            html: `
                <div class="relative">
                    <div class="w-10 h-10 bg-green-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center">
                        <i class="fas fa-map-marker-alt text-white"></i>
                    </div>
                    <div class="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-green-500 rotate-45 border-b border-r border-white"></div>
                </div>
            `,
            iconSize: [40, 50]
        })
    }).addTo(map).bindPopup('<b>Pickup Location</b>');
    
    document.getElementById('pickup_lat').value = lat;
    document.getElementById('pickup_lon').value = lng;
    
    // Center map on pickup
    map.setView([lat, lng], 13);
    
    // Get zone info for this location
    getZoneInfo(lat, lng);
}

// Load clusters from API with larger coverage
function loadClusters() {
    fetch('/api/clusters')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                displayClusters(data.clusters);
                createLegend(data.clusters);
            }
        });
}

// Function to create Voronoi-like polygons covering entire NYC
function createVoronoiPolygons(clusters) {
    // Clear existing layers
    clusterLayers.forEach(layer => map.removeLayer(layer));
    clusterLayers = [];
    clusterPolygons = [];
    
    // Create polygons for each cluster
    clusters.forEach((cluster, index) => {
        // Create a large circle (3km radius) around cluster center
        const circle = L.circle(cluster.center, {
            radius: 3000, // 3km for full coverage
            color: cluster.color,
            fillColor: cluster.color,
            fillOpacity: 0.2,
            weight: 2.5,
            className: 'cluster-polygon'
        }).addTo(map);
        
        // Add cluster label
        const label = L.marker(cluster.center, {
            icon: L.divIcon({
                className: 'cluster-label',
                html: `
                    <div class="bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg border flex items-center" 
                         style="color: ${cluster.color}; border-color: ${cluster.color}">
                        <div class="w-3 h-3 rounded-full mr-2" style="background-color: ${cluster.color}"></div>
                        <span class="font-bold">Zone ${cluster.id}</span>
                    </div>
                `,
                iconSize: [80, 40]
            })
        }).addTo(map);
        
        // Add click events
        circle.on('click', (e) => {
            e.originalEvent.stopPropagation();
            showZoneDetails(cluster);
        });
        
        label.on('click', (e) => {
            e.originalEvent.stopPropagation();
            showZoneDetails(cluster);
        });
        
        // Add hover effects
        circle.on('mouseover', () => {
            circle.setStyle({
                fillOpacity: 0.35,
                weight: 3.5
            });
        });
        
        circle.on('mouseout', () => {
            if (selectedZone !== cluster.id) {
                circle.setStyle({
                    fillOpacity: 0.2,
                    weight: 2.5
                });
            }
        });
        
        clusterPolygons.push(circle);
        clusterLayers.push(circle);
        clusterLayers.push(label);
    });
    
    // Show legend
    document.getElementById('legend_container').classList.remove('hidden');
}

function displayClusters(clusters) {
    createVoronoiPolygons(clusters);
}

function createLegend(clusters) {
    const container = document.getElementById('zone_legend');
    container.innerHTML = '';
    
    clusters.forEach(cluster => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.dataset.zoneId = cluster.id;
        
        item.innerHTML = `
            <div class="legend-color" style="background-color: ${cluster.color}"></div>
            <span>Zone ${cluster.id}</span>
        `;
        
        item.addEventListener('click', () => {
            showZoneDetails(cluster);
            map.setView(cluster.center, 12);
        });
        
        container.appendChild(item);
    });
}

// SEARCH FUNCTIONALITY
function searchLocation(query, resultElementId, inputElementId) {
    if (query.length < 2) {
        document.getElementById(resultElementId).style.display = 'none';
        return;
    }
    
    fetch(`/api/search?q=${encodeURIComponent(query)}&limit=5`)
        .then(res => res.json())
        .then(data => {
            const list = document.getElementById(resultElementId);
            list.innerHTML = '';
            
            if (data.length === 0) {
                const item = document.createElement('div');
                item.className = 'search-item';
                item.innerHTML = `
                    <div class="search-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <div>
                        <div class="font-medium">No results found</div>
                        <div class="text-xs text-gray-500">Try a different search term</div>
                    </div>
                `;
                list.appendChild(item);
            } else {
                data.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'search-item';
                    div.innerHTML = `
                        <div class="search-icon">
                            <i class="fas fa-map-marker-alt"></i>
                        </div>
                        <div>
                            <div class="font-medium">${item.display_name.split(',')[0]}</div>
                            <div class="text-xs text-gray-500">${formatAddress(item.display_name)}</div>
                        </div>
                    `;
                    div.onclick = () => {
                        document.getElementById(inputElementId).value = item.display_name;
                        setPickupMarker(item.lat, item.lon);
                        list.style.display = 'none';
                    };
                    list.appendChild(div);
                });
            }
            list.style.display = 'block';
        });
}

function formatAddress(fullAddress) {
    const parts = fullAddress.split(',');
    if (parts.length <= 3) return fullAddress;
    return parts.slice(1, 4).join(', ').substring(0, 60) + '...';
}

// Event listeners for search
document.getElementById('pickup_input').addEventListener('input', (e) => {
    searchLocation(e.target.value, 'pickup_results', 'pickup_input');
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        document.getElementById('pickup_results').style.display = 'none';
    }
});

function reverseGeocode(lat, lng, inputId) {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`)
        .then(res => res.json())
        .then(data => {
            if (data.display_name) {
                document.getElementById(inputId).value = data.display_name;
            }
        });
}

// Get zone info for current location
function getZoneInfo(lat, lng) {
    fetch('/api/clusters')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                // Find the nearest cluster
                let nearestCluster = null;
                let minDistance = Infinity;
                
                data.clusters.forEach(cluster => {
                    const distance = Math.sqrt(
                        Math.pow(cluster.center[0] - lat, 2) + 
                        Math.pow(cluster.center[1] - lng, 2)
                    ) * 111; // Convert to km
                    
                    if (distance < minDistance) {
                        minDistance = distance;
                        nearestCluster = cluster;
                    }
                });
                
                if (nearestCluster && minDistance < 5) { // Within 5km
                    displayZoneInfo(nearestCluster);
                } else {
                    document.getElementById('current_zone_info').classList.add('hidden');
                }
            }
        });
}

function displayZoneInfo(cluster) {
    document.getElementById('current_zone_info').classList.remove('hidden');
    document.getElementById('zone_color').style.backgroundColor = cluster.color;
    document.getElementById('zone_name').textContent = `Zone ${cluster.id}: ${cluster.name}`;
    document.getElementById('zone_type').textContent = cluster.type;
}

function showZoneDetails(cluster) {
    // Highlight selected zone
    if (selectedZone !== null && selectedZone !== cluster.id) {
        clusterPolygons.forEach(poly => {
            poly.setStyle({
                fillOpacity: 0.2,
                weight: 2.5
            });
        });
    }
    
    // Highlight the selected zone
    const selectedPoly = clusterPolygons.find(poly => 
        poly.getLatLng().lat === cluster.center[0] &&
        poly.getLatLng().lng === cluster.center[1]
    );
    
    if (selectedPoly) {
        selectedPoly.setStyle({
            fillOpacity: 0.4,
            weight: 4,
            color: cluster.color
        });
        selectedPoly.bringToFront();
    }
    
    selectedZone = cluster.id;
    
    // Update details panel
    document.getElementById('zone_title').textContent = `Zone ${cluster.id} Details`;
    document.getElementById('detail_color').style.backgroundColor = cluster.color;
    document.getElementById('detail_name').textContent = cluster.name;
    document.getElementById('detail_type').textContent = cluster.type;
    document.getElementById('detail_description').textContent = cluster.description;
    document.getElementById('detail_coords').textContent = 
        `${cluster.center[0].toFixed(4)}, ${cluster.center[1].toFixed(4)}`;
    document.getElementById('detail_id').textContent = cluster.id;
    
    // Show details panel
    document.getElementById('zone_details').classList.remove('hidden');
    
    // Center map on zone
    map.setView(cluster.center, 12);
}

function hideZoneDetails() {
    document.getElementById('zone_details').classList.add('hidden');
    
    // Reset zone styles
    if (selectedZone !== null) {
        clusterPolygons.forEach(poly => {
            poly.setStyle({
                fillOpacity: 0.2,
                weight: 2.5
            });
        });
        selectedZone = null;
    }
}

// PREDICTION FUNCTION - FIXED VERSION
function predictDestination() {
    const pLat = document.getElementById('pickup_lat').value;
    
    if (!pLat) {
        alert('Please select a pickup location first!');
        return;
    }

    const hour = parseInt(document.getElementById('hour').value);
    const day = parseInt(document.getElementById('day').value);
    const passengers = parseInt(document.getElementById('passengers').value);
    
    // Create datetime string
    const now = new Date();
    const datetime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0);
    const datetimeStr = datetime.toISOString().slice(0, 16);

    // Show loading
    const predictBtn = document.getElementById('predictBtn');
    const originalText = predictBtn.innerHTML;
    predictBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Predicting...';
    predictBtn.disabled = true;
    
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('result_section').classList.add('hidden');
    document.getElementById('pattern_analysis').classList.add('hidden');

    // Clear previous predictions
    predictionMarkers.forEach(marker => map.removeLayer(marker));
    predictionMarkers = [];

    const payload = {
        pickup_lat: pLat,
        pickup_lon: document.getElementById('pickup_lon').value,
        datetime: datetimeStr,
        passengers: passengers
    };

    fetch('/api/predict_destination', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        // Reset button
        predictBtn.innerHTML = originalText;
        predictBtn.disabled = false;
        
        document.getElementById('loading').classList.add('hidden');
        
        if (data.status === 'success') {
            // Update model info
            document.getElementById('model_info').textContent = 
                `LightGBM · ${data.total_clusters} Zones`;
            
            // Display top 3 predictions
            displayTopPredictions(data.top_predictions);
            
            // Show result section
            document.getElementById('result_section').classList.remove('hidden');
            
            // Add prediction markers to map
            data.top_predictions.forEach((pred, index) => {
                addPredictionMarker(pred, index);
            });
            
            // Show pattern analysis
            displayPatternAnalysis(data, hour);
        } else {
            alert('Error: ' + data.message);
        }
    })
    .catch(err => {
        predictBtn.innerHTML = originalText;
        predictBtn.disabled = false;
        document.getElementById('loading').classList.add('hidden');
        alert('Connection failed. Please try again.');
        console.error(err);
    });
}

// DISPLAY PREDICTIONS
function displayTopPredictions(predictions) {
    const container = document.getElementById('top_predictions_grid');
    container.innerHTML = '';
    
    const rankColors = ['#EF4444', '#3B82F6', '#F59E0B'];
    const rankIcons = ['fa-crown', 'fa-medal', 'fa-award'];
    
    predictions.forEach((pred, index) => {
        const card = document.createElement('div');
        card.className = 'prediction-card bg-white shadow-lg';
        card.style.borderLeftColor = rankColors[index];
        
        card.innerHTML = `
            <div class="p-6">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center">
                        <div class="rank-badge mr-4" style="background-color: ${rankColors[index]}">
                            <i class="fas ${rankIcons[index]}"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-gray-900 text-lg">${pred.name}</h4>
                            <p class="text-sm text-gray-600">${pred.type}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-2xl font-bold" style="color: ${rankColors[index]}">
                            ${pred.probability}%
                        </div>
                        <div class="text-xs text-gray-500">${pred.confidence} Confidence</div>
                    </div>
                </div>
                
                <div class="probability-bar">
                    <div class="probability-fill" style="width: ${pred.probability}%; background-color: ${rankColors[index]};"></div>
                </div>
                
                <div class="text-sm text-gray-600 mt-4 mb-6">
                    ${pred.description}
                </div>
                
                <div class="flex items-center justify-between text-sm">
                    <div class="flex items-center">
                        <div class="w-3 h-3 rounded-full mr-2" style="background-color: ${pred.color}"></div>
                        <span class="px-3 py-1 rounded-full bg-gray-100 text-gray-700">Zone ${pred.cluster}</span>
                    </div>
                    <button onclick="showZoneDetailsById(${pred.cluster})" class="text-purple-600 hover:text-purple-700 font-medium">
                        <i class="fas fa-info-circle mr-1"></i>
                        Details
                    </button>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

function showZoneDetailsById(zoneId) {
    fetch('/api/clusters')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                const cluster = data.clusters.find(c => c.id === zoneId);
                if (cluster) {
                    showZoneDetails(cluster);
                }
            }
        });
}

function addPredictionMarker(prediction, rank) {
    const colors = ['#EF4444', '#3B82F6', '#F59E0B'];
    const icons = ['fa-trophy', 'fa-medal', 'fa-award'];
    
    const marker = L.marker(prediction.center, {
        icon: L.divIcon({
            className: `prediction-marker rank-${rank}`,
            html: `
                <div class="relative">
                    <div class="w-12 h-12 rounded-full border-4 border-white shadow-xl flex items-center justify-center text-white font-bold"
                         style="background-color: ${colors[rank]}">
                        <i class="fas ${icons[rank]}"></i>
                    </div>
                    <div class="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-4 h-4 ${rank === 0 ? 'bg-red-500' : rank === 1 ? 'bg-blue-500' : 'bg-yellow-500'} rotate-45 border-b border-r border-white"></div>
                </div>
            `,
            iconSize: [48, 58]
        })
    }).addTo(map).bindPopup(`
        <div class="p-3 min-w-[220px]">
            <div class="font-bold text-lg mb-2" style="color: ${colors[rank]}">
                #${rank + 1}: ${prediction.name}
            </div>
            <div class="text-sm mb-3">${prediction.type}</div>
            <div class="flex items-center justify-between mb-2">
                <span class="text-sm">Probability:</span>
                <span class="font-bold" style="color: ${colors[rank]}">${prediction.probability}%</span>
            </div>
            <div class="text-xs text-gray-500">${prediction.description}</div>
        </div>
    `);
    
    predictionMarkers.push(marker);
    
    // Center map on all prediction markers
    if (predictionMarkers.length === 3) {
        const bounds = L.latLngBounds();
        predictionMarkers.forEach(marker => {
            bounds.extend(marker.getLatLng());
        });
        if (pickupMarker) {
            bounds.extend(pickupMarker.getLatLng());
        }
        map.fitBounds(bounds, { padding: [100, 100] });
    }
}

function displayPatternAnalysis(data, hour) {
    const analysisDiv = document.getElementById('pattern_analysis');
    const textDiv = document.getElementById('analysis_text');
    
    const day = data.day_of_week;
    const pickupZone = data.pickup_cluster_name;
    const topPrediction = data.top_predictions[0];
    
    let analysis = `Analysis for <strong>${day} at ${hour}:00</strong> from <strong>${pickupZone}</strong>: `;
    
    if (hour >= 6 && hour <= 9) {
        analysis += "Morning rush hour patterns show strong preference for business districts and commercial areas. ";
    } else if (hour >= 17 && hour <= 20) {
        analysis += "Evening patterns indicate travel towards residential and dining areas. ";
    } else if (hour >= 21 || hour <= 3) {
        analysis += "Late night patterns show entertainment and nightlife destinations as most likely. ";
    } else {
        analysis += "Daytime patterns suggest mixed commercial and tourist destinations. ";
    }
    
    analysis += `The highest probability destination is <strong>${topPrediction.name}</strong> with ${topPrediction.probability}% confidence.`;
    
    textDiv.innerHTML = analysis;
    analysisDiv.classList.remove('hidden');
}

function clearMap() {
    if (pickupMarker) {
        map.removeLayer(pickupMarker);
        pickupMarker = null;
    }
    document.getElementById('pickup_input').value = '';
    document.getElementById('pickup_lat').value = '';
    document.getElementById('pickup_lon').value = '';
    document.getElementById('current_zone_info').classList.add('hidden');
    document.getElementById('result_section').classList.add('hidden');
    document.getElementById('pattern_analysis').classList.add('hidden');
    document.getElementById('zone_details').classList.add('hidden');
    
    // Clear prediction markers
    predictionMarkers.forEach(marker => map.removeLayer(marker));
    predictionMarkers = [];
    
    // Reset zone styles
    if (selectedZone !== null) {
        clusterPolygons.forEach(poly => {
            poly.setStyle({
                fillOpacity: 0.2,
                weight: 2.5
            });
        });
        selectedZone = null;
    }
    
    // Reset map view
    map.setView([40.7580, -73.9855], 11);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeMap);