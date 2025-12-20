// Initialize map
let map, pickupMarker = null, dropoffMarker = null, routeLayer = null;
let pickupLat = null, pickupLon = null, dropoffLat = null, dropoffLon = null;
let clickMode = 'pickup';
let currentSearch = null, searchTimeout = null;

function initializeMap() {
    // Check if map container exists
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.error('Map container not found!');
        return;
    }
    
    map = L.map('map').setView([40.7580, -73.9855], 12);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    // Set current time values on load
    const now = new Date();
    const hourSelect = document.getElementById('hour');
    const minuteSelect = document.getElementById('minute');
    const daySelect = document.getElementById('day');
    
    if (hourSelect) hourSelect.value = now.getHours();
    if (minuteSelect) {
        // Round minute to nearest 5
        const minute = Math.floor(now.getMinutes() / 5) * 5;
        minuteSelect.value = minute;
    }
    
    if (daySelect) {
        // Convert JS Day (0=Sun, 1=Mon) to our Select (0=Mon, 6=Sun)
        let currentDayIdx = now.getDay() - 1;
        if (currentDayIdx === -1) currentDayIdx = 6;
        daySelect.value = currentDayIdx;
    }

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
        } else {
            setDropoffMarker(lat, lng);
            reverseGeocode(lat, lng, 'dropoff_input');
            clickMode = 'pickup';
            document.getElementById('dropoff_input').classList.add('border-red-500', 'ring-2', 'ring-red-200');
        }
        
        drawRouteIfComplete();
    });

    // Initialize search event listeners
    const pickupInput = document.getElementById('pickup_input');
    const dropoffInput = document.getElementById('dropoff_input');
    
    if (pickupInput) {
        pickupInput.addEventListener('input', (e) => {
            searchLocation(e.target.value, 'pickup_results', 'pickup_input', setPickupMarker);
        });
    }
    
    if (dropoffInput) {
        dropoffInput.addEventListener('input', (e) => {
            searchLocation(e.target.value, 'dropoff_results', 'dropoff_input', setDropoffMarker);
        });
    }
    
    // Hide search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            const pickupResults = document.getElementById('pickup_results');
            const dropoffResults = document.getElementById('dropoff_results');
            if (pickupResults) pickupResults.style.display = 'none';
            if (dropoffResults) dropoffResults.style.display = 'none';
        }
    });
}

// Marker Functions
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
    
    // Update UI Status
    const pickupStatus = document.getElementById('pickup_status');
    if (pickupStatus) {
        pickupStatus.innerHTML = `
            <i class="fas fa-map-marker-alt mr-2"></i>
            <span class="text-green-600 font-medium">Selected</span>
            <span class="text-gray-500 ml-2">${lat.toFixed(4)}, ${lng.toFixed(4)}</span>
        `;
    }
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
    
    // Update UI Status
    const dropoffStatus = document.getElementById('dropoff_status');
    if (dropoffStatus) {
        dropoffStatus.innerHTML = `
            <i class="fas fa-flag-checkered mr-2"></i>
            <span class="text-red-600 font-medium">Selected</span>
            <span class="text-gray-500 ml-2">${lat.toFixed(4)}, ${lng.toFixed(4)}</span>
        `;
    }
}

// Search Location  
function searchLocation(query, resultElementId, inputElementId, markerFunction) {
    if (currentSearch === query) return;
    
    clearTimeout(searchTimeout);
    
    if (query.length < 2) {
        const list = document.getElementById(resultElementId);
        if (list) {
            list.style.display = 'none';
            list.innerHTML = '';
        }
        currentSearch = null;
        return;
    }
    
    searchTimeout = setTimeout(() => {
        currentSearch = query;
        
        // Show loading
        const list = document.getElementById(resultElementId);
        if (!list) return;
        
        list.innerHTML = `
            <div class="search-item">
                <div class="search-icon"><i class="fas fa-spinner fa-spin"></i></div>
                <div class="search-text"><div class="search-title">Searching...</div></div>
            </div>`;
        list.style.display = 'block';
        
        fetch(`/api/search?q=${encodeURIComponent(query)}&limit=8`)
            .then(res => res.json())
            .then(data => {
                list.innerHTML = '';
                if (data.length === 0) {
                    list.innerHTML = `<div class="search-item"><div class="search-text">No results found</div></div>`;
                } else {
                    data.forEach((item, index) => {
                        const div = document.createElement('div');
                        div.className = 'search-item';
                        div.innerHTML = `
                            <div class="search-icon"><i class="fas fa-map-marker-alt"></i></div>
                            <div class="search-text">
                                <div class="search-title">${item.display_name.split(',')[0]}</div>
                                <div class="search-subtitle">${formatAddress(item.display_name)}</div>
                            </div>`;
                        div.onclick = () => {
                            selectSearchResult(item, inputElementId, markerFunction);
                            list.style.display = 'none';
                        };
                        list.appendChild(div);
                    });
                }
                currentSearch = null;
            })
            .catch(err => {
                console.error('Search error:', err);
                list.innerHTML = `<div class="search-item">Error searching</div>`;
            });
    }, 300);
}

function formatAddress(fullAddress) {
    const parts = fullAddress.split(',');
    if (parts.length <= 3) return fullAddress;
    return parts.slice(1, 4).join(', ').substring(0, 60) + '...';
}

function selectSearchResult(item, inputElementId, markerFunction) {
    document.getElementById(inputElementId).value = item.display_name;
    markerFunction(item.lat, item.lon);
    map.setView([item.lat, item.lon], 15);
    
    if (markerFunction === setPickupMarker) {
        clickMode = 'dropoff';
        document.getElementById('pickup_input').classList.add('border-green-500');
    } else {
        clickMode = 'pickup';
        document.getElementById('dropoff_input').classList.add('border-red-500');
    }
}

function reverseGeocode(lat, lng, inputId) {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`)
        .then(res => res.json())
        .then(data => {
            if (data.display_name) {
                document.getElementById(inputId).value = data.display_name;
            }
        })
        .catch(err => console.error('Reverse geocode error:', err));
}

// Route Drawing
function drawRouteIfComplete() {
    if (pickupLat && pickupLon && dropoffLat && dropoffLon) {
        drawRoute();
    }
}

function drawRoute() {
    if (routeLayer) map.removeLayer(routeLayer);

    // Show loading status
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) loadingDiv.classList.remove('hidden');
    
    fetch(`https://router.project-osrm.org/route/v1/driving/${pickupLon},${pickupLat};${dropoffLon},${dropoffLat}?overview=full&geometries=geojson`)
        .then(res => res.json())
        .then(data => {
            if (loadingDiv) loadingDiv.classList.add('hidden');
            
            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
                
                routeLayer = L.polyline(coords, {
                    color: '#3B82F6',
                    weight: 5,
                    opacity: 0.8,
                    lineCap: 'round',
                    lineJoin: 'round',
                    className: 'route-line'
                }).addTo(map);
                
                const bounds = L.latLngBounds([
                    [pickupLat, pickupLon],
                    [dropoffLat, dropoffLon]
                ]);
                map.fitBounds(bounds, { padding: [100, 100] });
            }
        })
        .catch(err => {
            if (loadingDiv) loadingDiv.classList.add('hidden');
            console.error('Route drawing error:', err);
        });
}
// Swap Locations
function swapLocations() {
    if (!pickupLat || !dropoffLat) {
        showNotification('Please select both pickup and dropoff locations first!', 'error');
        return;
    }
    
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
    
    reverseGeocode(pickupLat, pickupLon, 'pickup_input');
    reverseGeocode(dropoffLat, dropoffLon, 'dropoff_input');
    
    drawRouteIfComplete();
    
    showNotification('Locations swapped successfully!', 'success');
}

// Clear Map
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
    
    // Reset status displays
    const pickupStatus = document.getElementById('pickup_status');
    const dropoffStatus = document.getElementById('dropoff_status');
    
    if (pickupStatus) {
        pickupStatus.innerHTML = `
            <i class="fas fa-map-marker-alt mr-2"></i>
            <span>No pickup location selected</span>
        `;
    }
    
    if (dropoffStatus) {
        dropoffStatus.innerHTML = `
            <i class="fas fa-flag-checkered mr-2"></i>
            <span>No dropoff location selected</span>
        `;
    }
    
    // Hide results
    const results = document.getElementById('predictionResults');
    if (results) {
        results.classList.add('hidden');
        results.innerHTML = '';
    }
    
    clickMode = 'pickup';
    map.setView([40.7580, -73.9855], 12);
    
    showNotification('Map cleared!', 'success');
}

// Predict Duration
function predictDuration() {
    // 1. Validate Input
    if (!pickupLat || !pickupLon) {
        alert('Please select a pickup location first!');
        return;
    }
    
    if (!dropoffLat || !dropoffLon) {
        alert('Please select a dropoff location first!');
        return;
    }

    // Get Input Data
    const hour = parseInt(document.getElementById('hour').value);
    const minute = parseInt(document.getElementById('minute').value);
    const daySelect = document.getElementById('day');
    const day = parseInt(daySelect.value); // 0=Monday, ... 6=Sunday
    const passengers = parseInt(document.getElementById('passengers').value);
    
    // 2. Create datetime string
    const now = new Date();
    
    // Convert input day to JS Day (0=Sunday)
    const targetJsDay = (day + 1) % 7; 
    const currentJsDay = now.getDay();
    
    // Calculate days difference
    let dayDiff = targetJsDay - currentJsDay;
    if (dayDiff < 0) dayDiff += 7;
    
    // Create target date
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + dayDiff);
    targetDate.setHours(hour, minute, 0, 0);
    
    // Convert to ISO string format
    const offset = targetDate.getTimezoneOffset() * 60000;
    const datetimeStr = (new Date(targetDate - offset)).toISOString().slice(0, 16);

    // 3. UI Loading
    const predictBtn = document.getElementById('predictBtn');
    const originalText = predictBtn.innerHTML;
    predictBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Predicting...';
    predictBtn.disabled = true;

    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) loadingDiv.classList.remove('hidden');

    const payload = {
        pickup_lat: pickupLat,
        pickup_lon: pickupLon,
        dropoff_lat: dropoffLat,
        dropoff_lon: dropoffLon,
        datetime: datetimeStr,
        passengers: passengers
    };

    console.log('Sending payload:', payload);

    // 4. Fetch API
    fetch('/api/predict_duration', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
    })
    .then(data => {
        // Reset Button
        predictBtn.innerHTML = originalText;
        predictBtn.disabled = false;
        if (loadingDiv) loadingDiv.classList.add('hidden');
        
        if (data.status === 'success') {
            displayPredictionResults(data, hour, minute, daySelect.options[daySelect.selectedIndex].text);
        } else {
            alert('Error: ' + (data.message || 'Unknown error'));
        }
    })
    .catch(err => {
        console.error('Fetch error:', err);
        predictBtn.innerHTML = originalText;
        predictBtn.disabled = false;
        if (loadingDiv) loadingDiv.classList.add('hidden');
        alert('Connection failed. Please check backend server.');
    });
}

// Display Prediction Results
function displayPredictionResults(data, hour, minute, dayName) {
    const resultContainer = document.getElementById('predictionResults');
    if (!resultContainer) return;
    
    // Convert minutes to hours and minutes
    let durationDisplay = "";
    const totalMinutes = parseInt(data.duration_minutes || data.prediction || 0);

    if (totalMinutes > 59) {
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        if (m === 0) {
            durationDisplay = `${h} hour${h > 1 ? 's' : ''}`;
        } else {
            durationDisplay = `${h} hour${h > 1 ? 's' : ''} ${m} minute${m > 1 ? 's' : ''}`;
        }
    } else {
        durationDisplay = `${totalMinutes} minute${totalMinutes > 1 ? 's' : ''}`;
    }

    // Traffic Condition
    let isRushHour = false;
    let trafficCondition = '';
    let trafficColor = '';
    let trafficIcon = '';
    let trafficMessage = '';
    let trafficDetails = '';
    
    // Check if it's Rush Hour (8-10 AM or 3-6 PM)
    if ((hour >= 8 && hour <= 10) || (hour >= 15 && hour <= 18)) {
        isRushHour = true;
        
        // Determine if it's morning or evening rush
        if (hour >= 8 && hour <= 10) {
            trafficCondition = 'Morning Rush Hour';
            trafficColor = 'orange';
            trafficIcon = 'car';
            trafficMessage = 'Heavy morning traffic expected';
            trafficDetails = 'Morning peak hours (8-10 AM) typically experience heavy congestion due to commuters heading to work and school buses on the road.';
        } else {
            trafficCondition = 'Evening Rush Hour';
            trafficColor = 'red';
            trafficIcon = 'car-side';
            trafficMessage = 'Peak evening congestion';
            trafficDetails = 'Evening rush (3-6 PM) sees heavy traffic as people return from work, schools dismiss, and commercial activity peaks.';
        }
    } else {
        // Non-Rush Hour
        trafficCondition = 'Normal Traffic';
        trafficColor = 'green';
        trafficIcon = 'check-circle';
        trafficMessage = 'Smooth traffic flow';
        trafficDetails = 'Outside peak hours, traffic flows smoothly with minimal congestion. This is the optimal time for travel in NYC.';
    }

    // Calculate arrival time
    const startTime = new Date();
    startTime.setHours(hour, minute, 0, 0);
    const arrivalTime = new Date(startTime.getTime() + totalMinutes * 60000);
    const arrivalHour = arrivalTime.getHours().toString().padStart(2, '0');
    const arrivalMinute = arrivalTime.getMinutes().toString().padStart(2, '0');
    
    resultContainer.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl border border-blue-100 overflow-hidden animate-fade-in">
            <div class="h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
            
            <div class="p-8">
                <div class="flex flex-col md:flex-row gap-8 items-center md:items-start">
                    
                    <!-- Left: Duration & Info -->
                    <div class="flex-1 text-center md:text-left min-w-[240px]">
                        <h3 class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Estimated Travel Time</h3>
                        <div class="text-6xl font-black text-gray-900 leading-none tracking-tight">
                            ${durationDisplay}
                        </div>
                        <div class="text-sm text-blue-500 font-medium mt-2">
                            From selected pickup to dropoff
                        </div>

                        <div class="flex gap-4 mt-6 justify-center md:justify-start">
                            <div class="bg-gray-50 px-4 py-3 rounded-lg border border-gray-100">
                                <div class="text-xs text-gray-500">Distance</div>
                                <div class="text-lg font-bold text-gray-800">${data.distance_km || 'N/A'} km</div>
                            </div>
                            <div class="bg-gray-50 px-4 py-3 rounded-lg border border-gray-100">
                                <div class="text-xs text-gray-500">Arrival Time</div>
                                <div class="text-lg font-bold text-gray-800">${arrivalHour}:${arrivalMinute}</div>
                            </div>
                        </div>
                        
                    </div>

                    <!-- Divider -->
                    <div class="hidden md:block w-px bg-gray-100 self-stretch"></div>

                    <!-- Right: Traffic Information -->
                    <div class="flex-1 w-full space-y-6">
                        
                        <!-- Traffic Details Card -->
                        <div class="bg-gray-50 p-6 rounded-xl border border-gray-200">
                            <div class="flex items-center mb-4">
                                <div class="w-10 h-10 rounded-full bg-white border border-gray-300 flex items-center justify-center mr-3">
                                    <i class="fas fa-traffic-light text-${trafficColor}-500"></i>
                                </div>
                                <h4 class="text-lg font-bold text-gray-900">Traffic Insights</h4>
                            </div>
                            
                            <div class="space-y-3">
                                <div class="flex items-start">
                                    <i class="fas fa-info-circle text-${trafficColor}-500 mt-1 mr-3"></i>
                                    <p class="text-gray-700 text-sm leading-relaxed">
                                        ${trafficDetails}
                                    </p>
                                </div>
                                
                                <!-- Travel Tips -->
                                <div class="mt-4 pt-3 border-t border-gray-200">
                                    <div class="flex items-start">
                                        <i class="fas fa-lightbulb text-yellow-500 mt-1 mr-3"></i>
                                        <div>
                                            <p class="text-gray-700 text-sm font-medium mb-1">💡 Travel Tip</p>
                                            <p class="text-gray-600 text-sm">
                                                ${isRushHour ? 
                                                    (hour >= 8 && hour <= 10 ? 
                                                        'Consider starting 15-20 minutes earlier to avoid peak morning congestion.' : 
                                                        'Consider traveling after 6 PM when evening rush hour subsides.'
                                                    ) : 
                                                    'This is an optimal time for travel with minimal traffic delays.'
                                                }
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Show results with animation
    resultContainer.classList.remove('hidden');
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Initialize map when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the duration page
    const mapElement = document.getElementById('map');
    if (mapElement) {
        initializeMap();
    }
});