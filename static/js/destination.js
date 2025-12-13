// Initialize map
let map, pickupMarker, clusterLayers = [], clusterPolygons = [], predictionMarkers = [], selectedZone = null;

// Define CLUSTER_NAMES at the TOP of the file
const CLUSTER_NAMES = {
    0: { 
        type: "Business Hub",
        description: "Wall Street, World Trade Center, Tribeca. Busy business and office center."
    },
    1: {
        type: "Upscale Residential",
        description: "Elite residential area, museums, and access to Roosevelt Island."
    },
    2: {
        type: "Airport/Travel",
        description: "JFK Airport. High-fare area and long-distance travel hub."
    },
    3: {
        type: "Lifestyle/Tech",
        description: "Restaurant, shopping, and tech startup center."
    },
    4: {
        type: "Residential",
        description: "Dense Brooklyn residential area, near Prospect Park."
    },
    5: {
        type: "Airport/Mixed",
        description: "LGA Airport and Astoria/Queens culinary area."
    },
    6: {
        type: "Hipster/Nightlife",
        description: "Art, cafe, and nightlife center in North Brooklyn."
    },
    7: {
        type: "Tourism/Business",
        description: "Times Square, Theater District, Rockefeller Center. Very busy."
    },
    8: {
        type: "Residential/Academic",
        description: "Columbia University, Lincoln Center, and family residential area."
    },
    9: {
        type: "Mixed Residential",
        description: "Washington Heights, Inwood, and bridges to Bronx."
    }
};

function initializeMap() {
    map = L.map('map').setView([40.7580, -73.9855], 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    // Set current time
    const now = new Date();
    document.getElementById('hour').value = now.getHours();
    // Adjust day index (JavaScript: 0=Sunday, our select: 0=Monday)
    const jsDay = now.getDay(); // 0=Sunday, 1=Monday, etc.
    const selectDay = jsDay === 0 ? 6 : jsDay - 1; // Convert to our select index
    document.getElementById('day').value = selectDay;

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
    
    // Clear previous predictions
    clearPredictions();
    
    // Center map on pickup
    map.setView([lat, lng], 13);
    
    // Get zone info for this location
    getZoneInfo(lat, lng);
}

// Fungsi untuk clear predictions
function clearPredictions() {
    // Clear prediction markers
    predictionMarkers.forEach(marker => map.removeLayer(marker));
    predictionMarkers = [];
    
    // Clear cluster layers
    clusterLayers.forEach(layer => map.removeLayer(layer));
    clusterLayers = [];
    clusterPolygons = [];
    
    // Hide predictions section
    const predictionsSection = document.getElementById('predictions_section');
    if (predictionsSection) {
        predictionsSection.classList.add('hidden');
    }
    
    // Hide legend container
    const legendContainer = document.getElementById('legend_container');
    if (legendContainer) {
        legendContainer.classList.add('hidden');
    }
    
    // Clear zone details
    const zoneDetails = document.getElementById('zone_details');
    if (zoneDetails) {
        zoneDetails.classList.add('hidden');
    }
    selectedZone = null;
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
    const legendContainer = document.getElementById('legend_container');
    if (legendContainer) {
        legendContainer.classList.remove('hidden');
    }
}

// Hanya buat polygon untuk cluster yang diprediksi
function createPredictedClustersPolygons(clusters) {
    clusters.forEach((cluster, index) => {
        // Create circle for predicted cluster
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
    if (!container) return;
    
    container.innerHTML = '<h5 class="text-xs font-semibold text-gray-500 mb-2">Predicted Destination Zones</h5>';
    
    // Urutkan berdasarkan probability
    const sortedClusters = [...clusters].sort((a, b) => b.probability - a.probability);
    
    sortedClusters.forEach((cluster, index) => {
        const item = document.createElement('div');
        item.className = 'legend-item mb-2 cursor-pointer hover:bg-gray-50 p-2 rounded';
        item.dataset.zoneId = cluster.cluster;
        
        item.innerHTML = `
            <div class="flex items-center">
                <div class="legend-color w-3 h-3 rounded-full mr-2" style="background-color: ${cluster.color}"></div>
                <div class="flex-1">
                    <div class="flex justify-between items-center">
                        <span class="text-xs font-medium">#${index + 1}: Zone ${cluster.cluster}</span>
                        <span class="text-xs font-bold" style="color: ${cluster.color}">${cluster.probability}%</span>
                    </div>
                    <div class="text-xs text-gray-500 truncate" style="max-width: 140px">${cluster.name.split('&')[0]}</div>
                </div>
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
        })
        .catch(err => {
            console.error('Search error:', err);
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
        })
        .catch(err => {
            console.error('Reverse geocode error:', err);
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
                    updateCurrentZoneInfo(nearestCluster);
                } else {
                    const currentZoneInfo = document.getElementById('current_zone_info');
                    if (currentZoneInfo) {
                        currentZoneInfo.classList.add('hidden');
                    }
                }
            }
        })
        .catch(err => {
            console.error('Get zone info error:', err);
        });
}

function updateCurrentZoneInfo(cluster) {
    const currentZoneInfo = document.getElementById('current_zone_info');
    if (!currentZoneInfo) return;
    
    currentZoneInfo.classList.remove('hidden');
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
    const zoneDetails = document.getElementById('zone_details');
    if (zoneDetails) {
        document.getElementById('zone_title').textContent = `Zone ${cluster.cluster} Details`;
        document.getElementById('detail_color').style.backgroundColor = cluster.color;
        document.getElementById('detail_name').textContent = cluster.name;
        document.getElementById('detail_type').textContent = cluster.type;
        document.getElementById('detail_description').textContent = cluster.description;
        document.getElementById('detail_coords').textContent = 
            `${cluster.center[0].toFixed(4)}, ${cluster.center[1].toFixed(4)}`;
        document.getElementById('detail_id').textContent = cluster.cluster;
        
        // Show details panel
        zoneDetails.classList.remove('hidden');
    }
    
    // Center map on zone
    map.setView(cluster.center, 12);
}

function hideZoneDetails() {
    const zoneDetails = document.getElementById('zone_details');
    if (zoneDetails) {
        zoneDetails.classList.add('hidden');
    }
    
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

// PREDICTION FUNCTION
function predictDestination() {
    const pLat = document.getElementById('pickup_lat').value;
    
    if (!pLat) {
        alert('Please select a pickup location first!');
        return;
    }

    const hour = parseInt(document.getElementById('hour').value);
    const daySelect = document.getElementById('day');
    const day = parseInt(daySelect.value);
    const passengers = parseInt(document.getElementById('passengers').value);
    
    // Create datetime string dengan HARI YANG DIPILIH
    const now = new Date();
    const currentDay = now.getDay(); // 0=Sunday, 1=Monday, etc.
    
    // Hitung offset untuk mendapatkan hari yang dipilih
    // Our select: 0=Monday, 1=Tuesday, etc.
    // JavaScript: 0=Sunday, 1=Monday, etc.
    let targetDay;
    if (day === 0) targetDay = 1; // Monday
    else if (day === 1) targetDay = 2; // Tuesday
    else if (day === 2) targetDay = 3; // Wednesday
    else if (day === 3) targetDay = 4; // Thursday
    else if (day === 4) targetDay = 5; // Friday
    else if (day === 5) targetDay = 6; // Saturday
    else if (day === 6) targetDay = 0; // Sunday
    
    const daysDiff = targetDay - currentDay;
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + daysDiff);
    targetDate.setHours(hour, 0, 0, 0);
    
    const datetimeStr = targetDate.toISOString().slice(0, 16);
    
    console.log('📅 Destination prediction date:', {
        selectedDay: daySelect.options[daySelect.selectedIndex].text,
        targetDate: targetDate,
        datetime: datetimeStr,
        hour: hour
    });

    // Show loading
    const predictBtn = document.getElementById('predictBtn');
    const originalText = predictBtn.innerHTML;
    predictBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Predicting...';
    predictBtn.disabled = true;
    
    document.getElementById('loading').classList.remove('hidden');

    // Clear previous predictions and clusters
    clearPredictions();

    const payload = {
        pickup_lat: pLat,
        pickup_lon: document.getElementById('pickup_lon').value,
        datetime: datetimeStr,
        passengers: passengers
    };

    console.log('📤 Sending destination prediction:', payload);

    // Add timeout for fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    fetch('/api/predict_destination', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
    })
    .then(res => {
        clearTimeout(timeoutId);
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
        clearTimeout(timeoutId);
        console.error('❌ Fetch error:', err);
        predictBtn.innerHTML = originalText;
        predictBtn.disabled = false;
        document.getElementById('loading').classList.add('hidden');
        
        if (err.name === 'AbortError') {
            alert('Request timeout. Please try again.');
        } else {
            alert('Connection failed. Please try again. Error: ' + err.message);
        }
    });
}

// FUNGSI BARU: Display prediction results
function displayPredictionResults(data) {
    const predictionsSection = document.getElementById('predictions_section');
    if (!predictionsSection) return;
    
    // Update time info
    const dayName = data.day_of_week;
    const hour = data.hour;
    const timeInfo = document.getElementById('prediction_time_info');
    if (timeInfo) {
        timeInfo.textContent = `${dayName} at ${hour}:00 from ${data.pickup_cluster_name}`;
    }
    
    // Update pickup zone info
    const pickupZoneName = document.getElementById('pickup_zone_name');
    const pickupZoneColor = document.getElementById('pickup_zone_color');
    if (pickupZoneName) pickupZoneName.textContent = data.pickup_cluster_name;
    if (pickupZoneColor) pickupZoneColor.style.backgroundColor = data.pickup_cluster_color;
    
    // Display Top Predictions
    const container = document.getElementById('top_predictions_grid');
    if (!container) return;
    
    container.innerHTML = '';
    
    const rankColors = ['#EF4444', '#3B82F6', '#F59E0B'];
    const rankIcons = ['fa-crown', 'fa-medal', 'fa-award'];
    const rankTitles = ['Most Likely', '2nd Likely', '3rd Likely'];
    
    data.top_predictions.forEach((pred, index) => {
        const card = document.createElement('div');
        card.className = 'prediction-card bg-white rounded-xl shadow-lg border border-gray-200 hover:shadow-xl transition-shadow duration-300';
        card.style.borderTop = `4px solid ${rankColors[index]}`;
        
        card.innerHTML = `
            <div class="p-5">
                <!-- Rank Badge -->
                <div class="flex items-center mb-4">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center mr-3" style="background-color: ${rankColors[index]}">
                        <i class="fas ${rankIcons[index]} text-white"></i>
                    </div>
                    <div class="flex-1">
                        <div class="text-xs font-semibold text-gray-500">${rankTitles[index]}</div>
                        <div class="text-lg font-bold text-gray-900 truncate">${pred.name}</div>
                    </div>
                </div>
                
                <!-- Probability -->
                <div class="mb-4">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-sm text-gray-600">Probability</span>
                        <span class="text-2xl font-bold" style="color: ${rankColors[index]}">${pred.probability}%</span>
                    </div>
                    <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-1000" 
                             style="width: ${pred.probability}%; background-color: ${rankColors[index]};"></div>
                    </div>
                    <div class="text-right text-xs text-gray-500 mt-1">${pred.confidence} confidence</div>
                </div>
                
                <!-- Description -->
                <div class="text-sm text-gray-600 mb-4" style="min-height: 60px;">
                    ${pred.description || 'No description available'}
                </div>
                
                <!-- Zone Info -->
                <div class="flex items-center justify-between pt-4 border-t border-gray-100">
                    <div class="flex items-center">
                        <div class="w-3 h-3 rounded-full mr-2" style="background-color: ${pred.color}"></div>
                        <span class="text-sm font-medium text-gray-700">Zone ${pred.cluster}</span>
                    </div>
                    <button onclick="showZoneDetailsById(${pred.cluster})" class="text-purple-600 hover:text-purple-700 text-sm font-medium flex items-center">
                        <i class="fas fa-info-circle mr-1"></i>
                        Details
                    </button>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
    
    // Load and display predicted clusters on map
    loadClustersAfterPrediction(data.top_predictions);
    
    // Add prediction markers to map
    data.top_predictions.forEach((pred, index) => {
        addPredictionMarker(pred, index);
    });
    
    // Show pattern analysis
    displayPatternAnalysis(data, hour);
    
    // Fit map to show pickup and all predictions
    fitMapToPredictions(data.top_predictions);
    
    // Show predictions section
    predictionsSection.classList.remove('hidden');
    
    // Smooth scroll
    predictionsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        })
        .catch(err => {
            console.error('Error getting zone details:', err);
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
    
    if (!analysisDiv || !textDiv) return;
    
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

function fitMapToPredictions(predictions) {
    if (predictions.length === 0 || !pickupMarker) return;
    
    const bounds = L.latLngBounds();
    
    // Add pickup marker
    bounds.extend(pickupMarker.getLatLng());
    
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

function clearMap() {
    if (pickupMarker) {
        map.removeLayer(pickupMarker);
        pickupMarker = null;
    }
    document.getElementById('pickup_input').value = '';
    document.getElementById('pickup_lat').value = '';
    document.getElementById('pickup_lon').value = '';
    
    // Clear current zone info
    const currentZoneInfo = document.getElementById('current_zone_info');
    if (currentZoneInfo) {
        currentZoneInfo.classList.add('hidden');
    }
    
    // Clear predictions
    clearPredictions();
    
    // Reset map view
    map.setView([40.7580, -73.9855], 11);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeMap);