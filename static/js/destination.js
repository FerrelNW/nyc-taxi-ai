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

    // Initialize with default location (TANPA load clusters di awal)
    setTimeout(() => {
        setPickupMarker(40.7489, -73.9680);
        document.getElementById('pickup_input').value = 'Times Square, New York';
        reverseGeocode(40.7489, -73.9680, 'pickup_input');
        // HAPUS: loadClusters(); // Cluster tidak dimuat saat awal
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

// Fungsi untuk memuat cluster HANYA setelah prediksi
function loadClustersAfterPrediction(clusters) {
    // Clear existing layers
    clusterLayers.forEach(layer => map.removeLayer(layer));
    clusterLayers = [];
    clusterPolygons = [];
    
    // Create polygons for predicted clusters only
    createPredictedClustersPolygons(clusters);
    
    // Create legend hanya untuk cluster yang diprediksi
    createPredictionLegend(clusters);
    
    // Show legend container
    document.getElementById('legend_container').classList.remove('hidden');
}

// Hanya buat polygon untuk cluster yang diprediksi
function createPredictedClustersPolygons(clusters) {
    clusters.forEach((cluster, index) => {
        // Create circle for predicted cluster (radius lebih kecil)
        const circle = L.circle(cluster.center, {
            radius: 1500, // 1.5km radius untuk predicted clusters
            color: cluster.color,
            fillColor: cluster.color,
            fillOpacity: 0.15,
            weight: 2,
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
                        <span class="font-bold">#${index + 1}: ${Math.round(cluster.probability)}%</span>
                    </div>
                `,
                iconSize: [100, 40]
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
                fillOpacity: 0.25,
                weight: 3
            });
        });
        
        circle.on('mouseout', () => {
            if (selectedZone !== cluster.cluster) {
                circle.setStyle({
                    fillOpacity: 0.15,
                    weight: 2
                });
            }
        });
        
        clusterPolygons.push(circle);
        clusterLayers.push(circle);
        clusterLayers.push(label);
    });
}

// Legend hanya untuk cluster yang diprediksi
function createPredictionLegend(clusters) {
    const container = document.getElementById('zone_legend');
    container.innerHTML = '<h5 class="text-xs font-semibold text-gray-500 mb-2">Predicted Destination Zones</h5>';
    
    // Urutkan berdasarkan probability
    const sortedClusters = [...clusters].sort((a, b) => b.probability - a.probability);
    
    sortedClusters.forEach((cluster, index) => {
        const item = document.createElement('div');
        item.className = 'legend-item mb-2';
        item.dataset.zoneId = cluster.cluster;
        
        item.innerHTML = `
            <div class="legend-color" style="background-color: ${cluster.color}"></div>
            <div class="flex-1">
                <div class="flex justify-between items-center">
                    <span class="text-xs font-medium">#${index + 1}: Zone ${cluster.cluster}</span>
                    <span class="text-xs font-bold" style="color: ${cluster.color}">${cluster.probability}%</span>
                </div>
                <div class="text-xs text-gray-500 truncate" style="max-width: 140px">${cluster.name.split('&')[0]}</div>
            </div>
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
    if (selectedZone !== null && selectedZone !== cluster.cluster) {
        clusterPolygons.forEach(poly => {
            poly.setStyle({
                fillOpacity: 0.15,
                weight: 2
            });
        });
    }
    
    // Highlight the selected zone
    const selectedPoly = clusterPolygons.find(poly => 
        Math.abs(poly.getLatLng().lat - cluster.center[0]) < 0.001 &&
        Math.abs(poly.getLatLng().lng - cluster.center[1]) < 0.001
    );
    
    if (selectedPoly) {
        selectedPoly.setStyle({
            fillOpacity: 0.3,
            weight: 3,
            color: cluster.color
        });
        selectedPoly.bringToFront();
    }
    
    selectedZone = cluster.cluster;
    
    // Update details panel
    document.getElementById('zone_title').textContent = `Zone ${cluster.cluster} Details`;
    document.getElementById('detail_color').style.backgroundColor = cluster.color;
    document.getElementById('detail_name').textContent = cluster.name;
    document.getElementById('detail_type').textContent = cluster.type;
    document.getElementById('detail_description').textContent = cluster.description;
    document.getElementById('detail_coords').textContent = 
        `${cluster.center[0].toFixed(4)}, ${cluster.center[1].toFixed(4)}`;
    document.getElementById('detail_id').textContent = cluster.cluster;
    
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
                fillOpacity: 0.15,
                weight: 2
            });
        });
        selectedZone = null;
    }
}

// PREDICTION FUNCTION - DIPERBAIKI
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
    document.getElementById('legend_container').classList.add('hidden'); // Sembunyikan legend

    // Clear previous predictions and clusters
    predictionMarkers.forEach(marker => map.removeLayer(marker));
    predictionMarkers = [];
    clusterLayers.forEach(layer => map.removeLayer(layer));
    clusterLayers = [];
    clusterPolygons = [];

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
                `LightGBM · Top ${Math.min(3, data.top_predictions.length)} Predictions`;
            
            // Display top 3 predictions
            displayTopPredictions(data.top_predictions);
            
            // Show result section
            document.getElementById('result_section').classList.remove('hidden');
            
            // Add prediction markers to map
            data.top_predictions.forEach((pred, index) => {
                addPredictionMarker(pred, index);
            });
            
            // Load and display ONLY predicted clusters (setelah prediksi)
            loadClustersAfterPrediction(data.top_predictions);
            
            // Show pattern analysis
            displayPatternAnalysis(data, hour);
            
            // Fit map to show pickup and all predictions
            fitMapToPredictions(data.top_predictions);
            
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

// Fungsi untuk fit map ke predictions
function fitMapToPredictions(predictions) {
    if (predictions.length === 0) return;
    
    const bounds = L.latLngBounds();
    
    // Add pickup marker
    if (pickupMarker) {
        bounds.extend(pickupMarker.getLatLng());
    }
    
    // Add prediction centers
    predictions.forEach(pred => {
        bounds.extend(pred.center);
    });
    
    // Fit bounds dengan padding
    map.fitBounds(bounds, { 
        padding: [50, 50],
        maxZoom: 13
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
    // Get cluster data from API
    fetch('/api/clusters')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                const cluster = data.clusters.find(c => c.id === zoneId);
                if (cluster) {
                    // Convert to format yang diharapkan showZoneDetails
                    const clusterDetails = {
                        cluster: cluster.id,
                        name: cluster.name,
                        type: cluster.type,
                        color: cluster.color,
                        description: cluster.description,
                        center: cluster.center,
                        probability: 0 // Default value
                    };
                    showZoneDetails(clusterDetails);
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
    document.getElementById('legend_container').classList.add('hidden'); // Sembunyikan legend
    
    // Clear all layers
    predictionMarkers.forEach(marker => map.removeLayer(marker));
    predictionMarkers = [];
    clusterLayers.forEach(layer => map.removeLayer(layer));
    clusterLayers = [];
    clusterPolygons = [];
    
    // Reset zone styles
    if (selectedZone !== null) {
        selectedZone = null;
    }
    
    // Reset map view
    map.setView([40.7580, -73.9855], 11);
}

// FUNGSI BARU: Display current zone info
function updateCurrentZoneInfo(cluster) {
    const currentZoneInfo = document.getElementById('current_zone_info');
    const predictedZonesSection = document.getElementById('predicted_zones_section');
    
    currentZoneInfo.classList.remove('hidden');
    predictedZonesSection.classList.add('hidden');
    
    document.getElementById('zone_color').style.backgroundColor = cluster.color;
    document.getElementById('zone_name').textContent = cluster.name;
    document.getElementById('zone_type').textContent = cluster.type;
}

// FUNGSI BARU: Display prediction results dengan layout baru
function displayPredictionResults(data) {
    const predictedZonesSection = document.getElementById('predicted_zones_section');
    const currentZoneInfo = document.getElementById('current_zone_info');
    
    // Hide current zone simple info, show detailed layout
    currentZoneInfo.classList.add('hidden');
    predictedZonesSection.classList.remove('hidden');
    
    // Update Current Zone Details
    document.getElementById('current_zone_color').style.backgroundColor = data.pickup_cluster_color;
    document.getElementById('current_zone_name').textContent = data.pickup_cluster_name;
    document.getElementById('current_zone_type').textContent = CLUSTER_NAMES[data.pickup_cluster]?.type || 'Unknown';
    document.getElementById('current_zone_coords').textContent = 
        `${data.pickup_coords[0].toFixed(4)}, ${data.pickup_coords[1].toFixed(4)}`;
    document.getElementById('current_zone_description').textContent = 
        CLUSTER_NAMES[data.pickup_cluster]?.description || 'No description available';
    
    // Display Top Predictions
    const container = document.getElementById('top_predictions_grid');
    container.innerHTML = '';
    
    const rankColors = ['#EF4444', '#3B82F6', '#F59E0B'];
    const rankIcons = ['fa-crown', 'fa-medal', 'fa-award'];
    const rankTitles = ['1st', '2nd', '3rd'];
    
    data.top_predictions.forEach((pred, index) => {
        const card = document.createElement('div');
        card.className = 'prediction-card';
        card.style.borderTop = `4px solid ${rankColors[index]}`;
        
        card.innerHTML = `
            <div class="p-5">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center">
                        <div class="rank-badge mr-4" style="background-color: ${rankColors[index]}">
                            <i class="fas ${rankIcons[index]} text-white"></i>
                        </div>
                        <div>
                            <div class="text-xs font-semibold text-gray-500 mb-1">${rankTitles[index]} Prediction</div>
                            <h4 class="font-bold text-gray-900 text-lg">${pred.name}</h4>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-2xl font-bold" style="color: ${rankColors[index]}">
                            ${pred.probability}%
                        </div>
                        <div class="text-xs text-gray-500">${pred.confidence} Confidence</div>
                    </div>
                </div>
                
                <div class="probability-bar mb-3">
                    <div class="probability-fill" style="width: ${pred.probability}%; background-color: ${rankColors[index]};"></div>
                </div>
                
                <div class="text-sm text-gray-600 mb-4 line-clamp-3">
                    ${pred.description}
                </div>
                
                <div class="flex items-center justify-between text-sm">
                    <div class="flex items-center">
                        <div class="w-3 h-3 rounded-full mr-2" style="background-color: ${pred.color}"></div>
                        <span class="px-3 py-1 rounded-full bg-gray-100 text-gray-700">Zone ${pred.cluster}</span>
                    </div>
                    <button onclick="showZoneDetails(${index})" class="text-purple-600 hover:text-purple-700 font-medium">
                        <i class="fas fa-info-circle mr-1"></i>
                        Details
                    </button>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
    
    // Show pattern analysis
    displayPatternAnalysis(data, data.hour);
    
    // Smooth scroll to results
    predictedZonesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Update fungsi predictDestination() di destination.js
function predictDestination() {
    const pLat = document.getElementById('pickup_lat').value;
    
    if (!pLat) {
        alert('Please select a pickup location first!');
        return;
    }

    const hour = parseInt(document.getElementById('hour').value);
    const day = parseInt(document.getElementById('day').value);
    const passengers = parseInt(document.getElementById('passengers').value);
    
    // Create datetime string - FIXED
    const now = new Date();
    const datetime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0);
    const datetimeStr = datetime.toISOString().slice(0, 16);

    // Show loading
    const predictBtn = document.getElementById('predictBtn');
    const originalText = predictBtn.innerHTML;
    predictBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Predicting...';
    predictBtn.disabled = true;
    
    document.getElementById('loading').classList.remove('hidden');

    const payload = {
        pickup_lat: pLat,
        pickup_lon: document.getElementById('pickup_lon').value,
        datetime: datetimeStr,
        passengers: passengers
    };

    console.log('📤 Sending destination prediction:', payload);

    fetch('/api/predict_destination', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(res => {
        console.log('📥 Response status:', res.status);
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
    })
    .then(data => {
        console.log('✅ Destination prediction response:', data);
        
        // Reset button
        predictBtn.innerHTML = originalText;
        predictBtn.disabled = false;
        
        document.getElementById('loading').classList.add('hidden');
        
        if (data.status === 'success') {
            displayPredictionResults(data);
        } else {
            alert('Error: ' + (data.message || 'Unknown error'));
        }
    })
    .catch(err => {
        console.error('❌ Fetch error:', err);
        predictBtn.innerHTML = originalText;
        predictBtn.disabled = false;
        document.getElementById('loading').classList.add('hidden');
        alert('Connection failed. Please try again. Error: ' + err.message);
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeMap);