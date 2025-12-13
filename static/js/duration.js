// Initialize map
let map, pickupMarker = null, dropoffMarker = null, routeLayer = null;
let pickupLat = null, pickupLon = null, dropoffLat = null, dropoffLon = null;
let clickMode = 'pickup';
let currentSearch = null, searchTimeout = null;

function initializeMap() {
    map = L.map('map').setView([40.7580, -73.9855], 12);
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
            color: clickMode === 'pickup' ? '#10B981' : '#EF4444',
            fillColor: clickMode === 'pickup' ? '#10B981' : '#EF4444',
            fillOpacity: 0.3,
            weight: 0
        }).addTo(map);
        
        setTimeout(() => {
            map.removeLayer(ripple);
        }, 500);
        
        if (clickMode === 'pickup') {
            setPickupMarker(lat, lng);
            reverseGeocode(lat, lng, 'pickup_input');
            clickMode = 'dropoff';
            document.getElementById('pickup_input').classList.add('border-green-500', 'ring-2', 'ring-green-200');
            document.getElementById('dropoff_input').classList.remove('border-red-500', 'ring-2', 'ring-red-200');
        } else {
            setDropoffMarker(lat, lng);
            reverseGeocode(lat, lng, 'dropoff_input');
            clickMode = 'pickup';
            document.getElementById('dropoff_input').classList.add('border-red-500', 'ring-2', 'ring-red-200');
            document.getElementById('pickup_input').classList.remove('border-green-500', 'ring-2', 'ring-green-200');
        }
    });

    // Initialize with default locations
    setTimeout(() => {
        setPickupMarker(40.7489, -73.9680);  // Times Square
        document.getElementById('pickup_input').value = 'Times Square, New York';
        reverseGeocode(40.7489, -73.9680, 'pickup_input');
        
        setDropoffMarker(40.7128, -74.0060);  // Wall Street
        document.getElementById('dropoff_input').value = 'Wall Street, New York';
        reverseGeocode(40.7128, -74.0060, 'dropoff_input');
        
        // Set click mode to dropoff since pickup is already set
        clickMode = 'dropoff';
        document.getElementById('pickup_input').classList.add('border-green-500', 'ring-2', 'ring-green-200');
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
    pickupLat = lat;
    pickupLon = lng;
    
    // Update UI
    document.getElementById('pickup_status').innerHTML = `
        <span class="text-green-600 font-medium">Selected</span>
        <span class="text-gray-500"> · ${lat.toFixed(4)}, ${lng.toFixed(4)}</span>
    `;
    
    drawRouteIfComplete();
}

function setDropoffMarker(lat, lng) {
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    
    dropoffMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'dropoff-marker',
            html: `
                <div class="relative">
                    <div class="w-10 h-10 bg-red-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center">
                        <i class="fas fa-flag-checkered text-white"></i>
                    </div>
                    <div class="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-red-500 rotate-45 border-b border-r border-white"></div>
                </div>
            `,
            iconSize: [40, 50]
        })
    }).addTo(map).bindPopup('<b>Dropoff Location</b>');
    
    document.getElementById('dropoff_lat').value = lat;
    document.getElementById('dropoff_lon').value = lng;
    dropoffLat = lat;
    dropoffLon = lng;
    
    // Update UI
    document.getElementById('dropoff_status').innerHTML = `
        <span class="text-red-600 font-medium">Selected</span>
        <span class="text-gray-500"> · ${lat.toFixed(4)}, ${lng.toFixed(4)}</span>
    `;
    
    drawRouteIfComplete();
}

// SEARCH FUNCTIONALITY
function searchLocation(query, resultElementId, inputElementId, markerFunction) {
    if (currentSearch === query) return;
    
    clearTimeout(searchTimeout);
    
    if (query.length < 2) {
        document.getElementById(resultElementId).style.display = 'none';
        document.getElementById(resultElementId).innerHTML = '';
        currentSearch = null;
        return;
    }
    
    searchTimeout = setTimeout(() => {
        currentSearch = query;
        
        // Show loading
        const list = document.getElementById(resultElementId);
        list.innerHTML = `
            <div class="search-item">
                <div class="search-icon">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
                <div class="search-text">
                    <div class="search-title">Searching...</div>
                    <div class="search-subtitle">Looking for "${query}"</div>
                </div>
            </div>
        `;
        list.style.display = 'block';
        
        fetch(`/api/search?q=${encodeURIComponent(query)}&limit=8`)
            .then(res => res.json())
            .then(data => {
                list.innerHTML = '';
                
                if (data.length === 0) {
                    const item = document.createElement('div');
                    item.className = 'search-item';
                    item.innerHTML = `
                        <div class="search-icon">
                            <i class="fas fa-search"></i>
                        </div>
                        <div class="search-text">
                            <div class="search-title">No results found</div>
                            <div class="search-subtitle">Try a different search term</div>
                        </div>
                    `;
                    list.appendChild(item);
                } else {
                    data.forEach((item, index) => {
                        const div = document.createElement('div');
                        div.className = 'search-item';
                        div.dataset.index = index;
                        div.innerHTML = `
                            <div class="search-icon">
                                <i class="fas fa-map-marker-alt"></i>
                            </div>
                            <div class="search-text">
                                <div class="search-title">${item.display_name.split(',')[0]}</div>
                                <div class="search-subtitle">${formatAddress(item.display_name)}</div>
                            </div>
                            <div class="text-xs text-gray-400">
                                <i class="fas fa-chevron-right"></i>
                            </div>
                        `;
                        
                        div.onclick = () => {
                            selectSearchResult(item, inputElementId, markerFunction);
                            list.style.display = 'none';
                        };
                        
                        div.onmouseenter = () => {
                            highlightSearchResult(index, resultElementId);
                        };
                        
                        list.appendChild(div);
                    });
                }
                currentSearch = null;
            })
            .catch(err => {
                list.innerHTML = `
                    <div class="search-item">
                        <div class="search-icon text-red-500">
                            <i class="fas fa-exclamation-circle"></i>
                        </div>
                        <div class="search-text">
                            <div class="search-title">Search failed</div>
                            <div class="search-subtitle">Please try again</div>
                        </div>
                    </div>
                `;
                currentSearch = null;
            });
    }, 300); // Debounce 300ms
}

function formatAddress(fullAddress) {
    const parts = fullAddress.split(',');
    if (parts.length <= 3) return fullAddress;
    
    // Take the most relevant parts
    return parts.slice(1, 4).join(', ').substring(0, 60) + '...';
}

function highlightSearchResult(index, resultElementId) {
    const items = document.querySelectorAll(`#${resultElementId} .search-item`);
    items.forEach(item => item.classList.remove('active'));
    
    const activeItem = document.querySelector(`#${resultElementId} .search-item[data-index="${index}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    }
}

function selectSearchResult(item, inputElementId, markerFunction) {
    document.getElementById(inputElementId).value = item.display_name;
    markerFunction(item.lat, item.lon);
    
    // Center map on selected location
    map.setView([item.lat, item.lon], 15);
    
    // Update click mode
    if (markerFunction === setPickupMarker) {
        clickMode = 'dropoff';
        document.getElementById('pickup_input').classList.add('border-green-500', 'ring-2', 'ring-green-200');
    } else {
        clickMode = 'pickup';
        document.getElementById('dropoff_input').classList.add('border-red-500', 'ring-2', 'ring-red-200');
    }
}

// Event listeners for search with keyboard support
document.getElementById('pickup_input').addEventListener('input', (e) => {
    searchLocation(e.target.value, 'pickup_results', 'pickup_input', setPickupMarker);
});

document.getElementById('dropoff_input').addEventListener('input', (e) => {
    searchLocation(e.target.value, 'dropoff_results', 'dropoff_input', setDropoffMarker);
});

// Keyboard navigation for search results
document.addEventListener('keydown', (e) => {
    const activeInput = document.activeElement.id;
    if (!['pickup_input', 'dropoff_input'].includes(activeInput)) return;
    
    const resultElementId = activeInput.replace('_input', '_results');
    const list = document.getElementById(resultElementId);
    if (list.style.display !== 'block') return;
    
    const items = Array.from(list.querySelectorAll('.search-item:not(:first-child)'));
    const activeIndex = items.findIndex(item => item.classList.contains('active'));
    
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = (activeIndex + 1) % items.length;
        highlightSearchResult(nextIndex, resultElementId);
        items[nextIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
        highlightSearchResult(prevIndex, resultElementId);
        items[prevIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const activeItem = list.querySelector('.search-item.active');
        if (activeItem && activeItem.dataset.index !== undefined) {
            activeItem.click();
        }
    }
});

// Close search results when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        document.getElementById('pickup_results').style.display = 'none';
        document.getElementById('dropoff_results').style.display = 'none';
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

// ROUTE DRAWING
function drawRouteIfComplete() {
    if (pickupLat && pickupLon && dropoffLat && dropoffLon) {
        drawRoute();
    }
}

function drawRoute() {
    if (routeLayer) {
        map.removeLayer(routeLayer);
    }

    // Show loading for route
    document.getElementById('pickup_status').innerHTML += ' <span class="text-blue-500">(Calculating route...)</span>';
    
    fetch(`https://router.project-osrm.org/route/v1/driving/${pickupLon},${pickupLat};${dropoffLon},${dropoffLat}?overview=full&geometries=geojson`)
        .then(res => res.json())
        .then(data => {
            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
                
                // Draw route line
                routeLayer = L.polyline(coords, {
                    color: '#3B82F6',
                    weight: 5,
                    opacity: 0.8,
                    lineCap: 'round',
                    lineJoin: 'round',
                    className: 'route-line'
                }).addTo(map);
                
                // Fit bounds to show both markers and route
                const bounds = L.latLngBounds([
                    [pickupLat, pickupLon],
                    [dropoffLat, dropoffLon]
                ]);
                map.fitBounds(bounds, { padding: [100, 100] });
                
                // Update distance display
                const distanceKm = (route.distance / 1000).toFixed(1);
                if (document.getElementById('distance_value')) {
                    document.getElementById('distance_value').textContent = distanceKm + ' km';
                }
                
                // Update status
                document.getElementById('pickup_status').innerHTML = document.getElementById('pickup_status').innerHTML.replace('(Calculating route...)', '');
            }
        })
        .catch(err => {
            console.error('Route calculation failed:', err);
            document.getElementById('pickup_status').innerHTML = document.getElementById('pickup_status').innerHTML.replace('(Calculating route...)', '');
        });
}

// SWAP LOCATIONS FUNCTION
function swapLocations() {
    if (!pickupLat || !dropoffLat) {
        alert('Please select both pickup and dropoff locations first!');
        return;
    }
    
    // Swap coordinates
    const tempLat = pickupLat;
    const tempLon = pickupLon;
    const tempInput = document.getElementById('pickup_input').value;
    
    pickupLat = dropoffLat;
    pickupLon = dropoffLon;
    document.getElementById('pickup_input').value = document.getElementById('dropoff_input').value;
    setPickupMarker(pickupLat, pickupLon);
    
    dropoffLat = tempLat;
    dropoffLon = tempLon;
    document.getElementById('dropoff_input').value = tempInput;
    setDropoffMarker(dropoffLat, dropoffLon);
    
    // Reverse geocode to update addresses
    reverseGeocode(pickupLat, pickupLon, 'pickup_input');
    reverseGeocode(dropoffLat, dropoffLon, 'dropoff_input');
}

// PREDICTION FUNCTION
function predictDuration() {
    if (!pickupLat || !dropoffLat) {
        alert('Please select both pickup and dropoff locations first!');
        return;
    }

    const hour = parseInt(document.getElementById('hour').value);
    const minute = parseInt(document.getElementById('minute').value);
    const day = parseInt(document.getElementById('day').value);
    const passengers = parseInt(document.getElementById('passengers').value);
    
    // Create datetime string - FIXED
    const now = new Date();
    const datetime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
    const datetimeStr = datetime.toISOString().slice(0, 16);

    // Show loading
    const predictBtn = document.getElementById('predictBtn');
    const originalText = predictBtn.innerHTML;
    predictBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Predicting...';
    predictBtn.disabled = true;
    
    document.getElementById('loading').classList.remove('hidden');

    const payload = {
        pickup_lat: pickupLat,
        pickup_lon: pickupLon,
        dropoff_lat: dropoffLat,
        dropoff_lon: dropoffLon,
        datetime: datetimeStr,
        passengers: passengers
    };

    console.log('📤 Sending prediction request:', payload);

    fetch('/api/predict_duration', {
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
        console.log('✅ Prediction response:', data);
        
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

// FUNGSI BARU: Display prediction results below map
function displayPredictionResults(data) {
    // Cari container untuk hasil prediksi
    const resultContainer = document.getElementById('predictionResults');
    
    // Format waktu
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayName = dayNames[data.time_info.day] || data.time_info.day;
    
    // Tampilkan hasil
    resultContainer.innerHTML = `
        <div class="card-enhanced">
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-gray-900 mb-2">Prediction Results</h2>
                <p class="text-gray-600">${dayName} at ${data.time_info.hour}:00 • ${data.time_info.is_rush_hour ? '🚗 Rush Hour' : '🟢 Normal Traffic'}</p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                <!-- Duration Card -->
                <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200">
                    <div class="flex items-center mb-4">
                        <div class="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center mr-4">
                            <i class="fas fa-clock text-blue-600 text-xl"></i>
                        </div>
                        <div>
                            <h4 class="text-sm font-medium text-gray-600">Estimated Duration</h4>
                            <div class="text-4xl font-bold text-gray-900">${data.duration_minutes}<span class="text-lg text-gray-500 ml-2">min</span></div>
                        </div>
                    </div>
                </div>
                
                <!-- Distance Card -->
                <div class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200">
                    <div class="flex items-center mb-4">
                        <div class="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mr-4">
                            <i class="fas fa-route text-green-600 text-xl"></i>
                        </div>
                        <div>
                            <h4 class="text-sm font-medium text-gray-600">Distance</h4>
                            <div class="text-4xl font-bold text-gray-900">${data.distance_km}<span class="text-lg text-gray-500 ml-2">km</span></div>
                        </div>
                    </div>
                </div>
                
                <!-- Traffic Card -->
                <div class="bg-gradient-to-br from-${data.time_info.is_rush_hour ? 'red' : 'green'}-50 to-${data.time_info.is_rush_hour ? 'orange' : 'emerald'}-50 rounded-2xl p-6 border border-${data.time_info.is_rush_hour ? 'red' : 'green'}-200">
                    <div class="flex items-center mb-4">
                        <div class="w-12 h-12 rounded-xl bg-${data.time_info.is_rush_hour ? 'red' : 'green'}-100 flex items-center justify-center mr-4">
                            <i class="fas fa-traffic-light text-${data.time_info.is_rush_hour ? 'red' : 'green'}-600 text-xl"></i>
                        </div>
                        <div>
                            <h4 class="text-sm font-medium text-gray-600">Traffic Condition</h4>
                            <div class="text-2xl font-bold text-gray-900">${data.time_info.is_rush_hour ? 'Rush Hour' : 'Normal'}</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Zone Information -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <!-- Pickup Zone -->
                <div class="rounded-2xl p-6 border-2 border-green-200 bg-white">
                    <div class="flex items-center mb-6">
                        <div class="w-10 h-10 rounded-full mr-4" style="background-color: ${data.pickup_cluster_color}"></div>
                        <div>
                            <h4 class="text-lg font-bold text-gray-900">Pickup Zone</h4>
                            <p class="text-sm text-gray-600">${data.pickup_cluster_name}</p>
                        </div>
                    </div>
                    <div class="space-y-3">
                        <div class="flex justify-between">
                            <span class="text-gray-600">Zone ID</span>
                            <span class="font-semibold">${data.pickup_cluster}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Coordinates</span>
                            <span class="font-mono text-sm">${data.pickup_coords[0].toFixed(4)}, ${data.pickup_coords[1].toFixed(4)}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Dropoff Zone -->
                <div class="rounded-2xl p-6 border-2 border-red-200 bg-white">
                    <div class="flex items-center mb-6">
                        <div class="w-10 h-10 rounded-full mr-4" style="background-color: ${data.dropoff_cluster_color}"></div>
                        <div>
                            <h4 class="text-lg font-bold text-gray-900">Dropoff Zone</h4>
                            <p class="text-sm text-gray-600">${data.dropoff_cluster_name}</p>
                        </div>
                    </div>
                    <div class="space-y-3">
                        <div class="flex justify-between">
                            <span class="text-gray-600">Zone ID</span>
                            <span class="font-semibold">${data.dropoff_cluster}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Coordinates</span>
                            <span class="font-mono text-sm">${data.dropoff_coords[0].toFixed(4)}, ${data.dropoff_coords[1].toFixed(4)}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Traffic Information -->
            <div class="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200">
                <div class="flex items-center">
                    <i class="fas fa-info-circle text-blue-600 text-xl mr-4"></i>
                    <div>
                        <p class="text-gray-700">
                            ${data.time_info.is_rush_hour ? 
                                '🚨 <strong>Rush hour detected:</strong> Traffic may increase travel time by 15-30%. Consider alternative routes.' : 
                                '✅ <strong>Normal traffic conditions:</strong> Expected smooth travel with minimal delays.'}
                        </p>
                        <p class="text-sm text-gray-600 mt-2">
                            Prediction based on historical taxi trip patterns and current time/day analysis.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Show results
    resultContainer.classList.remove('hidden');
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// HELPER FUNCTIONS
function clearMap() {
    if (pickupMarker) {
        map.removeLayer(pickupMarker);
        pickupMarker = null;
        pickupLat = null;
        pickupLon = null;
    }
    if (dropoffMarker) {
        map.removeLayer(dropoffMarker);
        dropoffMarker = null;
        dropoffLat = null;
        dropoffLon = null;
    }
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    
    document.getElementById('pickup_input').value = '';
    document.getElementById('dropoff_input').value = '';
    document.getElementById('pickup_input').classList.remove('border-green-500', 'ring-2', 'ring-green-200');
    document.getElementById('dropoff_input').classList.remove('border-red-500', 'ring-2', 'ring-red-200');
    document.getElementById('result_card').classList.add('hidden');
    
    // Reset status
    document.getElementById('pickup_status').textContent = 'Click on map or search above';
    document.getElementById('dropoff_status').textContent = 'Click on map or search above';
    
    // Reset badges
    document.getElementById('pickup_zone_badge').style.backgroundColor = '';
    document.getElementById('dropoff_zone_badge').style.backgroundColor = '';
    
    clickMode = 'pickup'; // Reset to pickup mode
    
    // Reset map view
    map.setView([40.7580, -73.9855], 12);

    // Hapus hasil prediksi jika ada
    const resultContainer = document.getElementById('predictionResults');
    if (resultContainer) {
        resultContainer.classList.remove('active');
        resultContainer.innerHTML = '';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeMap);