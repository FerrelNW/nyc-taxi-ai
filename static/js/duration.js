// Common Utility Functions

class MapManager {
    constructor(mapId, options = {}) {
        this.map = L.map(mapId).setView(options.center || [40.7580, -73.9855], options.zoom || 12);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(this.map);
        
        this.markers = [];
        this.layers = [];
        this.clickMode = 'pickup';
    }
    
    addMarker(lat, lng, options) {
        const marker = L.marker([lat, lng], options).addTo(this.map);
        this.markers.push(marker);
        return marker;
    }
    
    addLayer(layer) {
        layer.addTo(this.map);
        this.layers.push(layer);
        return layer;
    }
    
    clearMarkers() {
        this.markers.forEach(marker => this.map.removeLayer(marker));
        this.markers = [];
    }
    
    clearLayers() {
        this.layers.forEach(layer => this.map.removeLayer(layer));
        this.layers = [];
    }
    
    clearAll() {
        this.clearMarkers();
        this.clearLayers();
    }
    
    fitBounds(coords) {
        const bounds = L.latLngBounds(coords);
        this.map.fitBounds(bounds, { padding: [50, 50] });
    }
}

class SearchManager {
    constructor(inputId, resultsId, callback) {
        this.input = document.getElementById(inputId);
        this.results = document.getElementById(resultsId);
        this.callback = callback;
        this.timeout = null;
        this.currentSearch = null;
        
        this.initialize();
    }
    
    initialize() {
        this.input.addEventListener('input', (e) => {
            this.handleInput(e.target.value);
        });
        
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
                this.handleKeyboard(e);
            }
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                this.hideResults();
            }
        });
    }
    
    handleInput(query) {
        clearTimeout(this.timeout);
        
        if (query.length < 2) {
            this.hideResults();
            return;
        }
        
        if (this.currentSearch === query) return;
        
        this.timeout = setTimeout(() => {
            this.currentSearch = query;
            this.showLoading();
            this.search(query);
        }, 300);
    }
    
    async search(query) {
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=8`);
            const data = await response.json();
            this.displayResults(data);
            this.currentSearch = null;
        } catch (error) {
            this.showError();
            this.currentSearch = null;
        }
    }
    
    showLoading() {
        this.results.innerHTML = `
            <div class="search-item">
                <div class="search-icon">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
                <div class="search-text">
                    <div class="search-title">Searching...</div>
                    <div class="search-subtitle">Looking for "${this.input.value}"</div>
                </div>
            </div>
        `;
        this.showResults();
    }
    
    showError() {
        this.results.innerHTML = `
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
        this.showResults();
    }
    
    displayResults(items) {
        this.results.innerHTML = '';
        
        if (items.length === 0) {
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
            this.results.appendChild(item);
        } else {
            items.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'search-item';
                div.dataset.index = index;
                div.innerHTML = `
                    <div class="search-icon">
                        <i class="fas fa-map-marker-alt"></i>
                    </div>
                    <div class="search-text">
                        <div class="search-title">${item.display_name.split(',')[0]}</div>
                        <div class="search-subtitle">${this.formatAddress(item.display_name)}</div>
                    </div>
                `;
                
                div.onclick = () => this.selectResult(item);
                this.results.appendChild(div);
            });
        }
        
        this.showResults();
    }
    
    formatAddress(fullAddress) {
        const parts = fullAddress.split(',');
        if (parts.length <= 3) return fullAddress;
        return parts.slice(1, 4).join(', ').substring(0, 60) + '...';
    }
    
    selectResult(item) {
        this.input.value = item.display_name;
        this.hideResults();
        this.callback(item);
    }
    
    handleKeyboard(e) {
        if (this.results.style.display !== 'block') return;
        
        const items = Array.from(this.results.querySelectorAll('.search-item'));
        const activeIndex = items.findIndex(item => item.classList.contains('active'));
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIndex = (activeIndex + 1) % items.length;
            this.highlightItem(nextIndex);
            items[nextIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
            this.highlightItem(prevIndex);
            items[prevIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const activeItem = this.results.querySelector('.search-item.active');
            if (activeItem && activeItem.dataset.index !== undefined) {
                activeItem.click();
            }
        }
    }
    
    highlightItem(index) {
        const items = this.results.querySelectorAll('.search-item');
        items.forEach(item => item.classList.remove('active'));
        
        const item = this.results.querySelector(`.search-item[data-index="${index}"]`);
        if (item) {
            item.classList.add('active');
        }
    }
    
    showResults() {
        this.results.style.display = 'block';
    }
    
    hideResults() {
        this.results.style.display = 'none';
    }
}

class LoadingManager {
    constructor(buttonId, loadingId) {
        this.button = document.getElementById(buttonId);
        this.loading = document.getElementById(loadingId);
        this.originalText = this.button.innerHTML;
    }
    
    show(text = 'Processing...') {
        this.button.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> ${text}`;
        this.button.disabled = true;
        if (this.loading) {
            this.loading.classList.remove('hidden');
        }
    }
    
    hide() {
        this.button.innerHTML = this.originalText;
        this.button.disabled = false;
        if (this.loading) {
            this.loading.classList.add('hidden');
        }
    }
}

// Common API Functions
async function reverseGeocode(lat, lng, inputId) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await response.json();
        if (data.display_name) {
            document.getElementById(inputId).value = data.display_name;
        }
    } catch (error) {
        console.error('Reverse geocode failed:', error);
    }
}

function calculateHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function formatDuration(minutes) {
    if (minutes < 60) {
        return `${minutes} minutes`;
    } else {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}h ${mins}m` : `${hours} hours`;
    }
}

function formatDistance(km) {
    if (km < 1) {
        return `${(km * 1000).toFixed(0)} meters`;
    } else {
        return `${km.toFixed(1)} km`;
    }
}

// Export for use in other files
window.MapManager = MapManager;
window.SearchManager = SearchManager;
window.LoadingManager = LoadingManager;
window.reverseGeocode = reverseGeocode;
window.calculateHaversine = calculateHaversine;
window.formatDuration = formatDuration;
window.formatDistance = formatDistance;