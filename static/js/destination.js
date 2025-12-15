// Initialize map
let map, pickupMarker, clusterLayers = [], predictionMarkers = [];
let predictionData = {};

function initializeMap() {
    map = L.map('map').setView([40.7580, -73.9855], 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    // Set current time
    const now = new Date();
    document.getElementById('hour').value = now.getHours();
    const jsDay = now.getDay();
    const selectDay = jsDay === 0 ? 6 : jsDay - 1;
    document.getElementById('day').value = selectDay;

    // Map click handler
    map.on('click', function(e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        
        setPickupMarker(lat, lng);
        reverseGeocode(lat, lng, 'pickup_input');
    });

    // Initialize with default location
    setTimeout(() => {
        setPickupMarker(40.7489, -73.9680);
        document.getElementById('pickup_input').value = 'Times Square, New York';
    }, 1000);
}

// MARKER FUNCTIONS - SEDERHANA
function setPickupMarker(lat, lng) {
    if (pickupMarker) map.removeLayer(pickupMarker);
    
    // MARKER PICKUP SEDERHANA
    pickupMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'pickup-marker',
            html: `
                <div class="relative">
                    <div class="w-10 h-10 bg-green-500 rounded-full border-3 border-white shadow flex items-center justify-center">
                        <i class="fas fa-map-marker-alt text-white"></i>
                    </div>
                </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 40]
        })
    }).addTo(map).bindPopup('<b>Pickup Location</b>');
    
    document.getElementById('pickup_lat').value = lat;
    document.getElementById('pickup_lon').value = lng;
    
    // Update pickup status
    const pickupStatus = document.getElementById('pickup_status');
    if (pickupStatus) {
        pickupStatus.innerHTML = `
            <i class="fas fa-map-marker-alt mr-2"></i>
            <span>Selected: ${lat.toFixed(4)}, ${lng.toFixed(4)}</span>
        `;
    }
    
    // Clear previous predictions
    clearPredictions();
    
    // Center map on pickup
    map.setView([lat, lng], 13);
    
    // Get zone info
    getZoneInfo(lat, lng);
}

// Fungsi untuk mendapatkan info zone saat ini
function getZoneInfo(lat, lng) {
    fetch('/api/clusters')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                let nearestCluster = null;
                let minDistance = Infinity;
                
                data.clusters.forEach(cluster => {
                    const distance = Math.sqrt(
                        Math.pow(cluster.center[0] - lat, 2) + 
                        Math.pow(cluster.center[1] - lng, 2)
                    ) * 111;
                    
                    if (distance < minDistance) {
                        minDistance = distance;
                        nearestCluster = cluster;
                    }
                });
                
                updateCurrentZoneInfo(nearestCluster, minDistance);
            }
        })
        .catch(err => {
            console.error('Get zone info error:', err);
        });
}

// Update current zone info
function updateCurrentZoneInfo(cluster, distance) {
    const currentZoneInfo = document.getElementById('current_zone_info');
    const zoneName = document.getElementById('zone_name');
    const zoneType = document.getElementById('zone_type');
    const zoneColor = document.getElementById('zone_color');
    
    if (currentZoneInfo && zoneName && zoneType && zoneColor) {
        if (cluster && distance < 5) {
            zoneColor.style.backgroundColor = cluster.color;
            zoneName.textContent = `Zone ${cluster.id}`;
            zoneType.textContent = cluster.name.split('&')[0];
        } else {
            zoneColor.style.backgroundColor = '#9CA3AF';
            zoneName.textContent = 'No Zone';
            zoneType.textContent = 'Outside cluster';
        }
    }
}

// Clear predictions
function clearPredictions() {
    predictionMarkers.forEach(marker => map.removeLayer(marker));
    predictionMarkers = [];
    
    clusterLayers.forEach(layer => map.removeLayer(layer));
    clusterLayers = [];
    
    const predictionsSection = document.getElementById('predictions_section');
    if (predictionsSection) {
        predictionsSection.classList.add('hidden');
        predictionsSection.innerHTML = '';
    }
}

// Buat circle untuk predicted clusters
function createPredictedClustersPolygons(clusters) {
    clusters.forEach((cluster, index) => {
        const colors = ['#EF4444', '#3B82F6', '#F59E0B'];
        
        // Circle sederhana
        const circle = L.circle(cluster.center, {
            radius: 1500,
            color: colors[index],
            fillColor: colors[index],
            fillOpacity: 0.1,
            weight: 2
        }).addTo(map);
        
        clusterLayers.push(circle);
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

// PREDICTION FUNCTION - FIXED TIME CONVERSION
function predictDestination() {
    const pLat = document.getElementById('pickup_lat').value;
    
    if (!pLat) {
        alert('Please select a pickup location first!');
        return;
    }

    const hour = parseInt(document.getElementById('hour').value);
    const minute = parseInt(document.getElementById('minute').value);
    const daySelect = document.getElementById('day');
    const day = parseInt(daySelect.value);
    const passengers = parseInt(document.getElementById('passengers').value);
    
    // Buat tanggal dengan hari yang dipilih
    const now = new Date();
    const currentDay = now.getDay();
    
    // Konversi select day ke JavaScript day
    let targetJsDay;
    if (day === 0) targetJsDay = 1;      // Monday
    else if (day === 1) targetJsDay = 2; // Tuesday
    else if (day === 2) targetJsDay = 3; // Wednesday
    else if (day === 3) targetJsDay = 4; // Thursday
    else if (day === 4) targetJsDay = 5; // Friday
    else if (day === 5) targetJsDay = 6; // Saturday
    else if (day === 6) targetJsDay = 0; // Sunday
    
    // Hitung selisih hari
    let daysDiff = targetJsDay - currentDay;
    if (daysDiff < 0) daysDiff += 7;
    
    // Buat tanggal target dengan waktu lokal
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + daysDiff);
    targetDate.setHours(hour, minute, 0, 0);
    
    // FORMAT WAKTU LOKAL: YYYY-MM-DDTHH:MM (tanpa konversi UTC)
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dayNum = String(targetDate.getDate()).padStart(2, '0');
    const hourStr = String(hour).padStart(2, '0');
    const minuteStr = String(minute).padStart(2, '0');
    
    const datetimeStr = `${year}-${month}-${dayNum}T${hourStr}:${minuteStr}`;
    
    // Debug log
    console.log('🕒 Time Debug:', {
        inputHour: hour,
        inputMinute: minute,
        inputDay: day,
        targetDateLocal: targetDate.toString(),
        datetimeStr: datetimeStr,
        isoString: targetDate.toISOString() // untuk perbandingan
    });

    // Show loading
    const predictBtn = document.getElementById('predictBtn');
    const originalText = predictBtn.innerHTML;
    predictBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Predicting...';
    predictBtn.disabled = true;
    
    document.getElementById('loading').classList.remove('hidden');

    // Clear previous predictions
    clearPredictions();

    const payload = {
        pickup_lat: pLat,
        pickup_lon: document.getElementById('pickup_lon').value,
        datetime: datetimeStr,  // Format: "2024-01-15T21:00"
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
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
    })
    .then(data => {
        console.log('✅ Destination prediction response:', data);
        
        predictionData = data;
        
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
        alert('Connection failed. Please try again.');
    });
}

// Display prediction results - SEDERHANA
function displayPredictionResults(data) {
    const predictionsSection = document.getElementById('predictions_section');
    if (!predictionsSection) return;
    
    console.log('📊 Displaying prediction results:', data);
    
    // Warna ranking
    const rankColors = ['#EF4444', '#3B82F6', '#F59E0B'];
    const rankIcons = ['fa-trophy', 'fa-medal', 'fa-award'];
    const rankTitles = ['Most Likely', '2nd Most Likely', '3rd Most Likely'];
    
    // Buat HTML sederhana
    predictionsSection.innerHTML = `
        <div class="card-enhanced mb-8">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between mb-6">
                <div>
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">Prediction Results</h2>
                    <p class="text-gray-600">
                        ${data.day_of_week} at ${data.hour}:00 from 
                        <span class="font-semibold text-purple-600">${data.pickup_cluster_name}</span>
                    </p>
                </div>
            </div>

            <!-- Top Predictions Grid -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6" id="top_predictions_grid">
                <!-- Will be filled by JavaScript -->
            </div>
        </div>
    `;
    
    // Display Top Predictions
    const container = document.getElementById('top_predictions_grid');
    if (!container) return;
    
    container.innerHTML = '';
    
    data.top_predictions.forEach((pred, index) => {
        const card = document.createElement('div');
        card.className = 'prediction-card';
        
        card.innerHTML = `
            <div class="flex items-center mb-4">
                <div class="rank-badge rank-${index + 1}">
                    <i class="fas ${rankIcons[index]}"></i>
                </div>
                <div class="flex-1">
                    <div class="text-xs font-semibold text-gray-500">${rankTitles[index]}</div>
                    <div class="text-lg font-bold text-gray-900">${pred.name.split('&')[0]}</div>
                </div>
            </div>
            
            <!-- Probability -->
            <div class="mb-4">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-sm text-gray-600">Probability</span>
                    <span class="text-2xl font-bold" style="color: ${rankColors[index]}">${pred.probability}%</span>
                </div>
                <div class="probability-bar">
                    <div class="probability-fill fill-${index + 1}" style="width: ${Math.min(pred.probability, 100)}%"></div>
                </div>
            </div>
            
            <!-- Zone Info -->
            <div class="flex items-center justify-between pt-4 border-t border-gray-100">
                <div class="flex items-center">
                    <div class="w-3 h-3 rounded-full mr-2" style="background-color: ${pred.color}"></div>
                    <span class="text-sm font-medium text-gray-700">Zone ${pred.cluster}</span>
                </div>
                <span class="text-xs text-gray-500">${pred.type}</span>
            </div>
        `;
        
        container.appendChild(card);
    });
    
    // Load clusters on map
    createPredictedClustersPolygons(data.top_predictions);
    
    // Add prediction markers
    data.top_predictions.forEach((pred, index) => {
        addPredictionMarker(pred, index);
    });
    
    // Fit map
    fitMapToPredictions(data.top_predictions);
    
    // Show predictions section
    predictionsSection.classList.remove('hidden');
    
    // Smooth scroll
    predictionsSection.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start'
    });
}

// Marker prediction sederhana
function addPredictionMarker(prediction, rank) {
    const colors = ['#EF4444', '#3B82F6', '#F59E0B'];
    const icons = ['fa-trophy', 'fa-medal', 'fa-award'];
    
    const marker = L.marker(prediction.center, {
        icon: L.divIcon({
            className: `prediction-marker`,
            html: `
                <div class="relative">
                    <div class="w-10 h-10 rounded-full border-3 border-white shadow flex items-center justify-center text-white font-bold"
                         style="background-color: ${colors[rank]}">
                        <i class="fas ${icons[rank]}"></i>
                    </div>
                </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 40]
        })
    }).addTo(map).bindPopup(`
        <div class="p-3">
            <div class="font-bold text-lg" style="color: ${colors[rank]}">
                #${rank + 1}: ${prediction.name}
            </div>
            <div class="text-sm mb-2">${prediction.type}</div>
            <div class="flex items-center justify-between">
                <span>Probability:</span>
                <span class="font-bold">${prediction.probability}%</span>
            </div>
        </div>
    `);
    
    predictionMarkers.push(marker);
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
    
    // Fit bounds
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
    
    // Reset current zone info
    const zoneColor = document.getElementById('zone_color');
    const zoneName = document.getElementById('zone_name');
    const zoneType = document.getElementById('zone_type');
    
    if (zoneColor && zoneName && zoneType) {
        zoneColor.style.backgroundColor = '#9CA3AF';
        zoneName.textContent = 'Select a location';
        zoneType.textContent = 'Click on map';
    }
    
    // Clear predictions
    clearPredictions();
    
    // Reset map view
    map.setView([40.7580, -73.9855], 11);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeMap);