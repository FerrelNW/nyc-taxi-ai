import pandas as pd
import numpy as np
from flask import Flask, render_template, request, jsonify
import joblib
import math
from datetime import datetime
import json
import os
import requests
from typing import Dict, List, Any
import traceback

app = Flask(__name__)

# --- LOAD MODELS ---
MODEL_PATH = 'models/'
models = {}

# NYC Cluster names for 10 clusters
CLUSTER_NAMES = {
    0: {
        "name": "Lower Manhattan & Financial District",
        "type": "Business Hub",
        "color": "#1F77B4",
        "description": "Wall Street, World Trade Center, Tribeca. Busy business and office center."
    },
    1: {
        "name": "Upper East Side & Roosevelt Island",
        "type": "Upscale Residential",
        "color": "#9467BD",
        "description": "Elite residential area, museums, and access to Roosevelt Island."
    },
    2: {
        "name": "JFK International Airport",
        "type": "Airport/Travel",
        "color": "#D62728",
        "description": "JFK Airport. High-fare area and long-distance travel hub."
    },
    3: {
        "name": "Chelsea, Flatiron & Union Square",
        "type": "Lifestyle/Tech",
        "color": "#E377C2",
        "description": "Restaurant, shopping, and tech startup center."
    },
    4: {
        "name": "Central Brooklyn (Park Slope/Prospect)",
        "type": "Residential",
        "color": "#8C564B",
        "description": "Dense Brooklyn residential area, near Prospect Park."
    },
    5: {
        "name": "LaGuardia Airport (LGA) & Astoria",
        "type": "Airport/Mixed",
        "color": "#FF7F0E",
        "description": "LGA Airport and Astoria/Queens culinary area."
    },
    6: {
        "name": "Williamsburg & Greenpoint",
        "type": "Hipster/Nightlife",
        "color": "#BCBD22",
        "description": "Art, cafe, and nightlife center in North Brooklyn."
    },
    7: {
        "name": "Midtown Manhattan (Times Square)",
        "type": "Tourism/Business",
        "color": "#17BECF",
        "description": "Times Square, Theater District, Rockefeller Center. Very busy."
    },
    8: {
        "name": "Upper West Side & Harlem",
        "type": "Residential/Academic",
        "color": "#2CA02C",
        "description": "Columbia University, Lincoln Center, and family residential area."
    },
    9: {
        "name": "North Manhattan & Bronx Hub",
        "type": "Mixed Residential",
        "color": "#7F7F7F",
        "description": "Washington Heights, Inwood, and bridges to Bronx."
    }
}

def load_models():
    """Load all ML models and cluster data"""
    try:
        print("Loading models from:", MODEL_PATH)
        
        # Model 1: Duration Prediction
        print("  Loading XGBoost duration model...")
        models['xgb_duration'] = joblib.load(MODEL_PATH + 'xgb_problem1_final.pkl')
        models['feat_duration'] = joblib.load(MODEL_PATH + 'features_problem1_final.pkl')
        print(f"    Duration features: {len(models['feat_duration'])}")
        
        # Model 2: Destination Prediction
        print("  Loading LightGBM destination model...")
        models['lgb_dest'] = joblib.load(MODEL_PATH + 'lgbm_destination_prediction.pkl')
        models['feat_dest'] = joblib.load(MODEL_PATH + 'features_problem2_final.pkl')
        print(f"    Destination features: {len(models['feat_dest'])}")
        
        # K-Means Clustering Model
        print("  Loading K-Means clustering model...")
        models['kmeans'] = joblib.load(MODEL_PATH + 'kmeans_pickup.pkl')
        print(f"    K-Means n_clusters: {models['kmeans'].n_clusters}")
        
        # Load cluster centroids
        print("  Loading cluster centroids...")
        with open(MODEL_PATH + 'cluster_centroids.json', 'r') as f:
            cluster_data = json.load(f)
        
        # Process centroids
        models['cluster_centroids'] = []
        for i, centroid in enumerate(cluster_data['pickup_clusters']):
            if i < len(CLUSTER_NAMES):
                models['cluster_centroids'].append({
                    'id': i,
                    'coordinates': centroid,
                    'name': CLUSTER_NAMES[i]['name'],
                    'type': CLUSTER_NAMES[i]['type'],
                    'color': CLUSTER_NAMES[i]['color'],
                    'description': CLUSTER_NAMES[i]['description']
                })
            else:
                print(f"WARNING: Skipping centroid {i} - no cluster name mapping")
        
        print(f"\nAll models loaded successfully")
        print(f"Cluster centroids loaded: {len(models['cluster_centroids'])} zones")
        
        # Verify feature compatibility
        print("\nFeature Verification:")
        print(f"  Duration model expects {len(models['feat_duration'])} features")
        print(f"  Destination model expects {len(models['feat_dest'])} features")
        
    except Exception as e:
        print(f"Error loading models: {e}")
        traceback.print_exc()
        raise e

load_models()

# --- MATH FUNCTIONS ---
def calculate_haversine(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in kilometers"""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def calculate_bearing(lat1, lon1, lat2, lon2):
    """Calculate bearing between two points"""
    dLon = math.radians(lon2 - lon1)
    lat1 = math.radians(lat1)
    lat2 = math.radians(lat2)
    y = math.sin(dLon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dLon)
    brng = math.degrees(math.atan2(y, x))
    return (brng + 360) % 360

def get_confidence_label(probability):
    """Get confidence label based on probability"""
    if probability >= 0.8:
        return "Very High"
    elif probability >= 0.6:
        return "High"
    elif probability >= 0.4:
        return "Medium"
    else:
        return "Low"

# --- ROUTES ---
@app.route('/')
def home():
    return render_template('home.html')

@app.route('/duration')
def duration_page():
    now = datetime.now()
    return render_template('duration.html', now=now)

@app.route('/destination')
def destination_page():
    now = datetime.now()
    return render_template('destination.html', now=now)

@app.route('/test')
def cluster_visualization():
    return render_template('cluster_visualization.html')

# --- API ENDPOINTS ---
@app.route('/api/clusters', methods=['GET'])
def get_clusters():
    """Return cluster information for map visualization"""
    try:
        clusters = []
        for cluster in models['cluster_centroids']:
            clusters.append({
                'id': cluster['id'],
                'center': cluster['coordinates'],
                'name': cluster['name'],
                'type': cluster['type'],
                'color': cluster['color'],
                'radius': 1.5,
                'description': cluster['description']
            })
        
        return jsonify({'status': 'success', 'clusters': clusters})
    
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400

@app.route('/api/cluster_stats', methods=['GET'])
def get_cluster_stats():
    """Return cluster statistics from JSON file"""
    try:
        # Try to load from models directory first
        stats_path = 'cluster_stats.json'
        if not os.path.exists(stats_path):
            stats_path = MODEL_PATH + 'cluster_stats.json'
        
        with open(stats_path, 'r') as f:
            stats_data = json.load(f)
        
        # Convert keys to integers for consistency
        stats_dict = {int(k): v for k, v in stats_data.items()}
        
        return jsonify({'status': 'success', 'stats': stats_dict})
    
    except Exception as e:
        print(f"Error loading cluster stats: {e}")
        # Return empty stats if file not found
        return jsonify({'status': 'success', 'stats': {}})

@app.route('/api/predict_duration', methods=['POST'])
def predict_duration():
    """Predict travel duration between two points"""
    try:
        data = request.json
        print(f"Received duration prediction request: {data}")
        
        # FIX: Debug waktu
        dt = datetime.strptime(data['datetime'], '%Y-%m-%dT%H:%M')
        print(f"Parsed datetime: {dt}")
        print(f"Hour: {dt.hour}, Minute: {dt.minute}, Day: {dt.weekday()}")
        
        # Validate input
        p_lat = float(data.get('pickup_lat', 0))
        p_lon = float(data.get('pickup_lon', 0))
        d_lat = float(data.get('dropoff_lat', 0))
        d_lon = float(data.get('dropoff_lon', 0))
        passengers = int(data.get('passengers', 1))
        
        if not (-90 <= p_lat <= 90) or not (-180 <= p_lon <= 180):
            return jsonify({'status': 'error', 'message': 'Invalid pickup coordinates'}), 400
        
        dt = datetime.strptime(data['datetime'], '%Y-%m-%dT%H:%M')
        
        # Feature Engineering
        dist_km = calculate_haversine(p_lat, p_lon, d_lat, d_lon)
        bearing = calculate_bearing(p_lat, p_lon, d_lat, d_lon)
        manhattan = (abs(d_lat - p_lat) + abs(d_lon - p_lon)) * 111
        log_dist = np.log1p(dist_km)
        
        hour = dt.hour
        month = dt.month
        day = dt.weekday()
        is_weekend = 1 if day >= 5 else 0
        is_rush = 1 if hour in [7, 8, 9, 16, 17, 18, 19] else 0
        
        # Cyclical Features
        h_sin = np.sin(2 * np.pi * hour / 24)
        h_cos = np.cos(2 * np.pi * hour / 24)
        m_sin = np.sin(2 * np.pi * month / 12)
        m_cos = np.cos(2 * np.pi * month / 12)
        
        # K-Means Clustering
        p_cluster = int(models['kmeans'].predict([[p_lat, p_lon]])[0])
        d_cluster = int(models['kmeans'].predict([[d_lat, d_lon]])[0])
        
        # Prepare input for Model
        input_data = {
            'distance_km': dist_km,
            'pickup_longitude': p_lon,
            'pickup_latitude': p_lat,
            'dropoff_longitude': d_lon,
            'dropoff_latitude': d_lat,
            'bearing': bearing,
            'manhattan_distance': manhattan,
            'log_distance': log_dist,
            'hour': hour,
            'month': month,
            'is_weekend': is_weekend,
            'is_rush_hour': is_rush,
            'passenger_count': passengers,
            'pickup_cluster': p_cluster,
            'dropoff_cluster': d_cluster,
            'day_of_week_idx': day + 1,
            'hour_sin': h_sin,
            'hour_cos': h_cos,
            'month_sin': m_sin,
            'month_cos': m_cos
        }
        
        # Create DataFrame
        df_in = pd.DataFrame([input_data])
        
        # Select only features needed by the model
        available_features = [c for c in models['feat_duration'] if c in df_in.columns]
        missing_features = [c for c in models['feat_duration'] if c not in df_in.columns]
        
        if missing_features:
            print(f"WARNING: Missing features for duration model: {missing_features}")
            # Add missing features with default values
            for feat in missing_features:
                df_in[feat] = 0
        
        # Ensure correct column order
        df_in = df_in[models['feat_duration']]
        
        # Predict Duration
        log_dur = models['xgb_duration'].predict(df_in)[0]
        duration_minutes = max(1, round(np.expm1(log_dur), 0))
        
        # Get cluster info
        pickup_cluster_info = models['cluster_centroids'][p_cluster]
        dropoff_cluster_info = models['cluster_centroids'][d_cluster]
        
        response = {
            'status': 'success',
            'duration_minutes': int(duration_minutes),
            'distance_km': round(dist_km, 2),
            'pickup_cluster': p_cluster,
            'pickup_cluster_name': pickup_cluster_info['name'],
            'pickup_cluster_color': pickup_cluster_info['color'],
            'dropoff_cluster': d_cluster,
            'dropoff_cluster_name': dropoff_cluster_info['name'],
            'dropoff_cluster_color': dropoff_cluster_info['color'],
            'pickup_coords': [p_lat, p_lon],
            'dropoff_coords': [d_lat, d_lon],
            'time_info': {
                'hour': hour,
                'day': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][day],
                'is_rush_hour': bool(is_rush),
                'is_weekend': bool(is_weekend)
            }
        }
        
        print(f"Duration prediction successful: {response['duration_minutes']} minutes")
        return jsonify(response)
        
    except Exception as e:
        print(f"Error in predict_duration: {e}")
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 400

@app.route('/api/predict_destination', methods=['POST'])
def predict_destination():
    """Predict top 3 destination clusters based on pickup location"""
    try:
        data = request.json
        print(f"Received destination prediction request: {data}")
        
        # Validate input
        p_lat = float(data.get('pickup_lat', 40.7580))
        p_lon = float(data.get('pickup_lon', -73.9855))
        passengers = int(data.get('passengers', 1))
        
        dt = datetime.strptime(data['datetime'], '%Y-%m-%dT%H:%M')
        
        # Feature Engineering
        hour = dt.hour
        month = dt.month
        day = dt.weekday()  # 0=Monday, 1=Tuesday, ...
        day_of_week = day + 1  # Convert to 1=Monday, 2=Tuesday, ...
        is_weekend = 1 if day >= 5 else 0
        is_rush = 1 if hour in [7, 8, 9, 16, 17, 18, 19] else 0
        
        # Cyclical Features
        h_sin = np.sin(2 * np.pi * hour / 24)
        h_cos = np.cos(2 * np.pi * hour / 24)
        m_sin = np.sin(2 * np.pi * month / 12)
        m_cos = np.cos(2 * np.pi * month / 12)
        
        # K-Means Clustering
        p_cluster = int(models['kmeans'].predict([[p_lat, p_lon]])[0])
        
        # PERBAIKAN: Gunakan hanya fitur yang dibutuhkan model
        input_data = {
            'pickup_cluster': p_cluster,
            'passenger_count': passengers,
            'hour': hour,
            'day_of_week': day_of_week,
            'month': month,
            'is_weekend': is_weekend,
            'is_rush_hour': is_rush,
            'hour_sin': h_sin,
            'hour_cos': h_cos,
            'month_sin': m_sin,
            'month_cos': m_cos
        }
        
        print(f"Input features: {input_data}")
        
        # Create DataFrame
        df_in = pd.DataFrame([input_data])
        
        # Ambil fitur yang dibutuhkan model
        expected_features = models['feat_dest']
        print(f"Expected features ({len(expected_features)}): {expected_features}")
        
        # Tambahkan fitur yang hilang
        missing_features = [f for f in expected_features if f not in df_in.columns]
        if missing_features:
            print(f"⚠️  Adding missing features: {missing_features}")
            for feat in missing_features:
                if 'day_of_week_idx' in feat:
                    df_in[feat] = day_of_week
                elif 'day' in feat:
                    df_in[feat] = day_of_week
                elif 'sin' in feat or 'cos' in feat:
                    df_in[feat] = 0.0
                else:
                    df_in[feat] = 0
        
        # Pastikan urutan kolom sesuai dengan training
        df_in = df_in[expected_features]
        
        print(f"✅ Final dataframe shape: {df_in.shape}")
        
        # --- PREDIKSI ---
        try:
            # LightGBM predict
            probabilities = models['lgb_dest'].predict(df_in)
            
            # Jika output 2D, ambil baris pertama
            if len(probabilities.shape) == 2:
                probabilities = probabilities[0]
            
            # Pastikan probabilities valid
            if np.sum(probabilities) == 0:
                print("⚠️  All probabilities zero, using fallback")
                probabilities = np.ones(len(models['cluster_centroids'])) / len(models['cluster_centroids'])
            
        except Exception as e:
            print(f"LightGBM prediction error: {e}")
            
            # Fallback: probabilities berdasarkan cluster pickup
            probabilities = np.zeros(len(models['cluster_centroids']))
            probabilities[p_cluster] = 0.4  # 40% untuk cluster pickup
            
            # Beri probabilitas ke cluster lain
            for i in range(len(probabilities)):
                if i != p_cluster:
                    probabilities[i] = np.random.rand() * 0.1
            
            # Normalisasi
            probabilities = probabilities / probabilities.sum()
        
        # Get top 3 predictions
        top_3_indices = np.argsort(probabilities)[-3:][::-1]
        
        print(f"Top 3 indices: {top_3_indices}")
        print(f"Top 3 probabilities: {[probabilities[i] for i in top_3_indices]}")
        
        top_3_predictions = []
        for idx in top_3_indices:
            if idx < len(models['cluster_centroids']):
                prob = float(probabilities[idx])
                cluster_info = models['cluster_centroids'][idx]
                
                description = CLUSTER_NAMES.get(idx, {}).get('description', 'No description available')
                
                top_3_predictions.append({
                    'cluster': int(idx),
                    'name': cluster_info['name'],
                    'type': cluster_info['type'],
                    'color': cluster_info['color'],
                    'probability': round(prob * 100, 1),
                    'confidence': get_confidence_label(prob),
                    'center': cluster_info['coordinates'],
                    'description': description
                })
        
        # Get pickup cluster info
        pickup_cluster_info = models['cluster_centroids'][p_cluster]
        
        response = {
            'status': 'success',
            'pickup_cluster': p_cluster,
            'pickup_cluster_name': pickup_cluster_info['name'],
            'pickup_cluster_color': pickup_cluster_info['color'],
            'pickup_coords': [p_lat, p_lon],
            'hour': hour,
            'day_of_week': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][day],
            'top_predictions': top_3_predictions
        }
        
        print(f"Destination prediction successful!")
        print(f"   Pickup: Zone {p_cluster} ({pickup_cluster_info['name']})")
        
        return jsonify(response)
        
    except Exception as e:
        print(f"❌ Critical Error in predict_destination: {e}")
        
        # Fallback response sederhana
        return jsonify({
            'status': 'error', 
            'message': str(e)
        }), 500

@app.route('/api/search', methods=['GET'])
def search_location():
    """Search for locations in NYC area"""
    query = request.args.get('q', '')
    limit = request.args.get('limit', type=int, default=10)
    
    if len(query) < 2:
        return jsonify([])
    
    try:
        # Focus search on NYC area
        url = f'https://nominatim.openstreetmap.org/search?format=json&q={query}&viewbox=-74.25,40.49,-73.70,40.91&bounded=1&limit={limit}'
        headers = {'User-Agent': 'NYC-Taxi-App/1.0'}
        response = requests.get(url, headers=headers, timeout=5)
        data = response.json()
        
        results = []
        for item in data[:limit]:
            results.append({
                'display_name': item['display_name'],
                'lat': float(item['lat']),
                'lon': float(item['lon'])
            })
        return jsonify(results)
    except Exception as e:
        print(f"Search error: {e}")
        return jsonify([])

@app.route('/api/route', methods=['GET'])
def get_route():
    """Get route geometry between two points"""
    try:
        p_lat = request.args.get('p_lat', type=float)
        p_lon = request.args.get('p_lon', type=float)
        d_lat = request.args.get('d_lat', type=float)
        d_lon = request.args.get('d_lon', type=float)
        
        if None in [p_lat, p_lon, d_lat, d_lon]:
            return jsonify({'status': 'error', 'message': 'Missing coordinates'}), 400
        
        url = f'https://router.project-osrm.org/route/v1/driving/{p_lon},{p_lat};{d_lon},{d_lat}?overview=full&geometries=geojson'
        
        response = requests.get(url, timeout=10)
        data = response.json()
        
        if data.get('code') == 'Ok' and data.get('routes'):
            route = data['routes'][0]
            return jsonify({
                'status': 'success',
                'geometry': route['geometry'],
                'distance': route['distance'],
                'duration': route['duration']
            })
        
        return jsonify({'status': 'error', 'message': 'No route found'}), 404
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    print("\n" + "="*50)
    print("NYC TAXI AI SYSTEM STARTING")
    print("="*50)
    print(f"Model path: {MODEL_PATH}")
    print(f"Total clusters: {len(models.get('cluster_centroids', []))}")
    print(f"Duration model: {'Loaded' if 'xgb_duration' in models else 'Not loaded'}")
    print(f"Destination model: {'Loaded' if 'lgb_dest' in models else 'Not loaded'}")
    print("="*50)
    print("\nServer running at http://localhost:5000")
    print("Available routes:")
    print("   /                   - Home page")
    print("   /duration           - Duration prediction")
    print("   /destination        - Destination prediction")
    print("   /test               - Cluster visualization")
    print("   /api/clusters       - Get clusters data")
    print("   /api/cluster_stats  - Get cluster statistics")
    print("   /api/predict_duration   - Duration API")
    print("   /api/predict_destination - Destination API")
    print("="*50 + "\n")
    
    app.run(debug=True, port=5000)