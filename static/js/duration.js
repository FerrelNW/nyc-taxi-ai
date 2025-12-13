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

    // Set current time values on load
    const now = new Date();
    document.getElementById('hour').value = now.getHours();
    
    // Convert JS Day (0=Sun, 1=Mon) to our Select (0=Mon, 6=Sun)
    let currentDayIdx = now.getDay() - 1;
    if (currentDayIdx === -1) currentDayIdx = 6;
    document.getElementById('day').value = currentDayIdx;

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

    // Initialize with default locations (Example)
    setTimeout(() => {
        // Optional: Pre-set markers for demo
        // setPickupMarker(40.7489, -73.9680); 
        // setDropoffMarker(40.7128, -74.0060);
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
    
    // Update UI Status
    document.getElementById('pickup_status').innerHTML = `
        <span class="text-green-600 font-medium">Selected</span>
        <span class="text-gray-500"> · ${lat.toFixed(4)}, ${lng.toFixed(4)}</span>
    `;
    
    // Update Badge Color
    document.getElementById('pickup_zone_badge').style.backgroundColor = '#d1fae5'; // green-100
    document.getElementById('pickup_zone_badge').style.color = '#065f46'; // green-800
    document.getElementById('pickup_zone_badge').style.padding = '2px 8px';
    document.getElementById('pickup_zone_badge').style.borderRadius = '4px';

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
    
    // Update UI Status
    document.getElementById('dropoff_status').innerHTML = `
        <span class="text-red-600 font-medium">Selected</span>
        <span class="text-gray-500"> · ${lat.toFixed(4)}, ${lng.toFixed(4)}</span>
    `;

    // Update Badge Color
    document.getElementById('dropoff_zone_badge').style.backgroundColor = '#fee2e2'; // red-100
    document.getElementById('dropoff_zone_badge').style.color = '#991b1b'; // red-800
    document.getElementById('dropoff_zone_badge').style.padding = '2px 8px';
    document.getElementById('dropoff_zone_badge').style.borderRadius = '4px';
    
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

// Event listeners for search
document.getElementById('pickup_input').addEventListener('input', (e) => {
    searchLocation(e.target.value, 'pickup_results', 'pickup_input', setPickupMarker);
});
document.getElementById('dropoff_input').addEventListener('input', (e) => {
    searchLocation(e.target.value, 'dropoff_results', 'dropoff_input', setDropoffMarker);
});
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
    if (routeLayer) map.removeLayer(routeLayer);

    document.getElementById('pickup_status').innerHTML += ' <span class="text-blue-500">(Calculating route...)</span>';
    
    fetch(`https://router.project-osrm.org/route/v1/driving/${pickupLon},${pickupLat};${dropoffLon},${dropoffLat}?overview=full&geometries=geojson`)
        .then(res => res.json())
        .then(data => {
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
                
                // Remove calculating text
                const status = document.getElementById('pickup_status');
                status.innerHTML = status.innerHTML.replace(' <span class="text-blue-500">(Calculating route...)</span>', '');
            }
        });
}

// SWAP LOCATIONS
function swapLocations() {
    if (!pickupLat || !dropoffLat) {
        alert('Please select both pickup and dropoff locations first!');
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
}

// CLEAR MAP
function clearMap() {
    if (pickupMarker) { map.removeLayer(pickupMarker); pickupMarker = null; pickupLat = null; pickupLon = null; }
    if (dropoffMarker) { map.removeLayer(dropoffMarker); dropoffMarker = null; dropoffLat = null; dropoffLon = null; }
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    
    document.getElementById('pickup_input').value = '';
    document.getElementById('dropoff_input').value = '';
    document.getElementById('pickup_input').classList.remove('border-green-500', 'ring-2', 'ring-green-200');
    document.getElementById('dropoff_input').classList.remove('border-red-500', 'ring-2', 'ring-red-200');
    
    document.getElementById('predictionResults').classList.add('hidden');
    document.getElementById('predictionResults').innerHTML = ''; // Clear results
    
    document.getElementById('pickup_status').textContent = 'Click on map or search above';
    document.getElementById('dropoff_status').textContent = 'Click on map or search above';
    
    document.getElementById('pickup_zone_badge').style.backgroundColor = '';
    document.getElementById('dropoff_zone_badge').style.backgroundColor = '';
    
    clickMode = 'pickup';
    map.setView([40.7580, -73.9855], 12);
}

// === PREDICTION FUNCTION (YANG DIPERBAIKI) ===
function predictDuration() {
    // 1. Validasi Input
    if (!pickupLat || !dropoffLat) {
        alert('Please select both pickup and dropoff locations first!');
        return;
    }

    // Ambil Data Input
    const hour = parseInt(document.getElementById('hour').value);
    const minute = parseInt(document.getElementById('minute').value);
    const daySelect = document.getElementById('day');
    const day = parseInt(daySelect.value); // 0=Monday, ... 6=Sunday
    const passengers = parseInt(document.getElementById('passengers').value);
    
    // 2. Logic Datetime yang BENAR (Supaya tidak error di app.py)
    const now = new Date();
    
    // JS: 0=Sunday, 1=Monday...
    // Input Kita: 0=Monday, 1=Tuesday...
    // Konversi Input ke JS Day: (Input + 1) % 7
    // Contoh: Input 0 (Mon) -> (0+1)%7 = 1 (Mon di JS). Input 6 (Sun) -> (6+1)%7 = 0 (Sun di JS)
    const targetJsDay = (day + 1) % 7; 
    const currentJsDay = now.getDay();
    
    // Hitung berapa hari lagi menuju hari yang dipilih
    let dayDiff = targetJsDay - currentJsDay;
    if (dayDiff < 0) dayDiff += 7; // Kalau harinya lewat, ambil minggu depan
    
    // Buat objek tanggal baru
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + dayDiff);
    targetDate.setHours(hour, minute, 0, 0);
    
    // Konversi ke format string ISO lokal: "YYYY-MM-DDTHH:MM"
    // Trik: Kurangi offset timezone supaya toISOString() tidak mengonversi ke UTC
    const offset = targetDate.getTimezoneOffset() * 60000;
    const datetimeStr = (new Date(targetDate - offset)).toISOString().slice(0, 16);

    // 3. UI Loading
    const predictBtn = document.getElementById('predictBtn');
    const originalText = predictBtn.innerHTML;
    predictBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Predicting...';
    predictBtn.disabled = true;

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
        
        if (data.status === 'success') {
            displayPredictionResults(data, hour, daySelect.options[daySelect.selectedIndex].text);
        } else {
            alert('Error: ' + (data.message || 'Unknown error'));
        }
    })
    .catch(err => {
        console.error('Fetch error:', err);
        predictBtn.innerHTML = originalText;
        predictBtn.disabled = false;
        alert('Connection failed. Please check backend server.');
    });
}

// TAMPILKAN HASIL DI BAWAH (LAYOUT LENGKAP)
// ... (KODE MAP, MARKER, PREDICT DI ATAS JANGAN DIHAPUS) ...

// === FUNGSI TAMPILAN HASIL (REVISED) ===
function displayPredictionResults(data, hour, dayName) {
    const resultContainer = document.getElementById('predictionResults');
    
    // 1. LOGIKA KONVERSI WAKTU (Minutes -> Hours & Minutes)
    // Komen: Jika durasi > 59 menit, ubah format
    let durationDisplay = "";
    let durationSubtext = "";
    const totalMinutes = parseInt(data.duration_minutes);

    if (totalMinutes > 59) {
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        // Logic: Kalau menitnya 0 (pas jam), jangan tampilkan "0 min"
        if (m === 0) {
            durationDisplay = `${h} hr`;
        } else {
            durationDisplay = `${h} hr ${m} min`;
        }
        durationSubtext = `(${totalMinutes} total minutes)`;
    } else {
        durationDisplay = `${totalMinutes} min`;
        durationSubtext = "Estimated travel time";
    }

    const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);
    
    // Inject HTML ke dalam container di bawah Map
    resultContainer.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl border border-blue-100 overflow-hidden animate-fade-in">
            <div class="h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
            
            <div class="p-8">
                <div class="flex flex-col md:flex-row gap-8 items-center md:items-start">
                    
                    <div class="flex-1 text-center md:text-left min-w-[240px]">
                        <h3 class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Total Duration</h3>
                        <div class="text-6xl font-black text-gray-900 leading-none tracking-tight">
                            ${durationDisplay}
                        </div>
                        <div class="text-sm text-blue-500 font-medium mt-2">
                            ${durationSubtext}
                        </div>

                        <div class="flex gap-4 mt-6 justify-center md:justify-start">
                            <div class="bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
                                <div class="text-xs text-gray-500">Distance</div>
                                <div class="text-lg font-bold text-gray-800">${data.distance_km} km</div>
                            </div>
                            <div class="bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
                                <div class="text-xs text-gray-500">Arrival</div>
                                <div class="text-lg font-bold text-gray-800">
                                    ${(parseInt(hour) + Math.floor(totalMinutes/60) + (totalMinutes%60 + 0 >= 60 ? 1 : 0)) % 24}:00
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="hidden md:block w-px bg-gray-100 self-stretch"></div>

                    <div class="flex-1 w-full space-y-4">
                        
                        <div class="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100">
                            <div class="flex items-center">
                                <div class="w-2 h-2 rounded-full ${isRushHour ? 'bg-red-500 animate-pulse' : 'bg-green-500'} mr-2"></div>
                                <span class="text-sm font-semibold text-gray-700">Traffic Status</span>
                            </div>
                            <span class="text-sm font-bold ${isRushHour ? 'text-red-600' : 'text-green-600'}">
                                ${isRushHour ? 'Heavy Traffic' : 'Smooth Flow'}
                            </span>
                        </div>

                        <div class="space-y-3">
                            <div class="flex items-start p-3 hover:bg-green-50 rounded-lg transition-colors border border-transparent hover:border-green-100">
                                <div class="mt-1 mr-3 text-green-500"><i class="fas fa-map-marker-alt"></i></div>
                                <div>
                                    <div class="text-xs text-green-600 font-bold uppercase">Pickup Zone</div>
                                    <div class="text-sm font-bold text-gray-800 leading-tight">${data.pickup_cluster.name}</div>
                                </div>
                            </div>
                            
                            <div class="flex items-start p-3 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100">
                                <div class="mt-1 mr-3 text-red-500"><i class="fas fa-flag-checkered"></i></div>
                                <div>
                                    <div class="text-xs text-red-600 font-bold uppercase">Dropoff Zone</div>
                                    <div class="text-sm font-bold text-gray-800 leading-tight">${data.dropoff_cluster.name}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Efek Scroll Smooth ke Hasil
    resultContainer.classList.remove('hidden');
    // Scroll sedikit ke bawah agar hasil terlihat, tapi map tidak hilang total
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Initialize
document.addEventListener('DOMContentLoaded', initializeMap);