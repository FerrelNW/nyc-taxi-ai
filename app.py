import pandas as pd
import numpy as np
from flask import Flask, render_template, request, jsonify
import joblib
import math
from datetime import datetime
import json
import os
import requests

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
        print("🔄 Loading models from:", MODEL_PATH)
        
        # Model 1: Duration Prediction
        print("  Loading XGBoost duration model...")
        models['xgb_duration'] = joblib.load(MODEL_PATH + 'xgb_problem1_final.pkl')
        models['feat_duration'] = joblib.load(MODEL_PATH + 'features_problem1_final.pkl')
        
        # Model 2: Destination Prediction (NEW LightGBM)
        print("  Loading LightGBM destination model...")
        models['lgb_dest'] = joblib.load(MODEL_PATH + 'lgbm_destination_prediction.pkl')
        models['feat_dest'] = joblib.load(MODEL_PATH + 'features_problem2_final.pkl')
        
        # NEW K-Means Clustering Model (10 clusters)
        print("  Loading K-Means clustering model...")
        models['kmeans'] = joblib.load(MODEL_PATH + 'kmeans_pickup.pkl')
        
        # Load NEW cluster centroids from JSON (10 clusters)
        print("  Loading cluster centroids...")
        with open(MODEL_PATH + 'cluster_centroids.json', 'r') as f:
            cluster_data = json.load(f)
        
        # VERIFY CENTROIDS
        print(f"  Found {len(cluster_data['pickup_clusters'])} pickup centroids")
        print(f"  Found {len(cluster_data['dropoff_clusters'])} dropoff centroids")
        
        # Process unified centroids
        models['cluster_centroids'] = []
        for i, centroid in enumerate(cluster_data['pickup_clusters']):
            if i >= len(CLUSTER_NAMES):
                print(f"⚠️  Warning: More centroids ({len(cluster_data['pickup_clusters'])}) than cluster names ({len(CLUSTER_NAMES)})")
                break
                
            models['cluster_centroids'].append({
                'id': i,
                'coordinates': centroid,
                'name': CLUSTER_NAMES[i]['name'],
                'type': CLUSTER_NAMES[i]['type'],
                'color': CLUSTER_NAMES[i]['color']
            })
        
        print("\n✅ All models loaded successfully")
        print(f"✅ Destination model: {type(models['lgb_dest']).__name__}")
        print(f"✅ K-Means n_clusters: {models['kmeans'].n_clusters}")
        print(f"✅ Cluster centroids loaded: {len(models['cluster_centroids'])} zones")
        
        # Print cluster info for verification
        print("\n🔍 Cluster Information:")
        for i, cluster in enumerate(models['cluster_centroids']):
            print(f"  Zone {i}: {cluster['name']} ({cluster['type']})")
            print(f"    Coordinates: {cluster['coordinates'][0]:.4f}, {cluster['coordinates'][1]:.4f}")
        
        # Verify K-Means compatibility
        if models['kmeans'].n_clusters != len(models['cluster_centroids']):
            print(f"⚠️  WARNING: K-Means has {models['kmeans'].n_clusters} clusters, but centroids has {len(models['cluster_centroids'])}")
        
    except Exception as e:
        print(f"❌ Error loading models: {e}")
        import traceback
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

from datetime import datetime  # Pastikan ini sudah di import

# --- ROUTES ---
@app.route('/')
def home():
    return render_template('home.html')

@app.route('/duration')
def duration_page():
    # Kirim waktu sekarang ke template
    now = datetime.now()
    return render_template('duration.html', now=now)

@app.route('/destination')
def destination_page():
    # Kirim waktu sekarang ke template
    now = datetime.now()
    return render_template('destination.html', now=now)


# --- API ENDPOINTS ---
@app.route('/api/clusters', methods=['GET'])
def get_clusters():
    """Return cluster information for map visualization"""
    try:
        clusters = []
        for cluster in models['cluster_centroids']:
            cluster_info = {
                'id': cluster['id'],
                'center': cluster['coordinates'],
                'name': cluster['name'],
                'type': cluster['type'],
                'color': cluster['color'],
                'radius': 1.5,  # km
                'description': CLUSTER_NAMES.get(cluster['id'], {}).get('description', '')
            }
            clusters.append(cluster_info)
        
        return jsonify({'status': 'success', 'clusters': clusters})
    
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400

@app.route('/api/predict_duration', methods=['POST'])
def predict_duration():
    """Predict travel duration between two points"""
    try:
        data = request.json
        p_lat = float(data['pickup_lat'])
        p_lon = float(data['pickup_lon'])
        d_lat = float(data['dropoff_lat'])
        d_lon = float(data['dropoff_lon'])
        passengers = int(data['passengers'])
        
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
        
        # NEW K-Means Clustering (10 clusters)
        p_cluster = models['kmeans'].predict([[p_lat, p_lon]])[0]
        d_cluster = models['kmeans'].predict([[d_lat, d_lon]])[0]

        # Prepare input for Model 1
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
        
        df_in = pd.DataFrame([input_data])
        feat_1 = [c for c in models['feat_duration'] if c in df_in.columns]
        
        # Predict Duration
        log_dur = models['xgb_duration'].predict(df_in[feat_1])[0]
        duration_minutes = round(np.expm1(log_dur), 0)
        
        # Get cluster info
        pickup_cluster_info = models['cluster_centroids'][p_cluster]
        dropoff_cluster_info = models['cluster_centroids'][d_cluster]
        
        return jsonify({
            'status': 'success',
            'duration_minutes': int(duration_minutes),
            'distance_km': round(dist_km, 2),
            'pickup_cluster': int(p_cluster),
            'pickup_cluster_name': pickup_cluster_info['name'],
            'pickup_cluster_color': pickup_cluster_info['color'],
            'dropoff_cluster': int(d_cluster),
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
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400

@app.route('/api/predict_destination', methods=['POST'])
def predict_destination():
    """Predict top 3 destination clusters based on pickup location"""
    try:
        data = request.json
        p_lat = float(data['pickup_lat'])
        p_lon = float(data['pickup_lon'])
        passengers = int(data['passengers'])
        
        dt = datetime.strptime(data['datetime'], '%Y-%m-%dT%H:%M')
        
        # Feature Engineering
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
        
        # NEW K-Means Clustering for pickup (10 clusters)
        p_cluster = models['kmeans'].predict([[p_lat, p_lon]])[0]
        
        # Prepare input for NEW LightGBM model
        input_data = {
            'pickup_longitude': p_lon,
            'pickup_latitude': p_lat,
            'hour': hour,
            'month': month,
            'is_weekend': is_weekend,
            'is_rush_hour': is_rush,
            'passenger_count': passengers,
            'pickup_cluster': p_cluster,
            'day_of_week_idx': day + 1,
            'hour_sin': h_sin,
            'hour_cos': h_cos,
            'month_sin': m_sin,
            'month_cos': m_cos
        }
        
        # Add placeholder features if needed
        df_in = pd.DataFrame([input_data])
        for f in models['feat_dest']:
            if f not in df_in.columns:
                df_in[f] = 0
        
        # Get TOP 3 predictions with probabilities
        try:
            probabilities = models['lgb_dest'].predict_proba(df_in[models['feat_dest']])[0]
            top_3_indices = np.argsort(probabilities)[-3:][::-1]
            top_3_predictions = []
            
            for idx in top_3_indices:
                prob = float(probabilities[idx])
                cluster_info = models['cluster_centroids'][idx]
                
                top_3_predictions.append({
                    'cluster': int(idx),
                    'name': cluster_info['name'],
                    'type': cluster_info['type'],
                    'color': cluster_info['color'],
                    'probability': round(prob * 100, 1),
                    'confidence': get_confidence_label(prob),
                    'center': cluster_info['coordinates'],
                    'description': CLUSTER_NAMES[idx]['description']
                })
            
        except Exception as e:
            print(f"LightGBM prediction error: {e}")
            # Fallback: return top cluster
            pred_cluster = models['lgb_dest'].predict(df_in[models['feat_dest']])[0]
            cluster_info = models['cluster_centroids'][pred_cluster]
            
            top_3_predictions = [{
                'cluster': int(pred_cluster),
                'name': cluster_info['name'],
                'type': cluster_info['type'],
                'color': cluster_info['color'],
                'probability': 85.0,
                'confidence': 'High',
                'center': cluster_info['coordinates'],
                'description': CLUSTER_NAMES[pred_cluster]['description']
            }]
        
        # Get pickup cluster info
        pickup_cluster_info = models['cluster_centroids'][p_cluster]
        
        return jsonify({
            'status': 'success',
            'pickup_cluster': int(p_cluster),
            'pickup_cluster_name': pickup_cluster_info['name'],
            'pickup_cluster_color': pickup_cluster_info['color'],
            'pickup_coords': [p_lat, p_lon],
            'hour': hour,
            'month': month,
            'day_of_week': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][day],
            'top_predictions': top_3_predictions,
            'total_clusters': len(models['cluster_centroids']),
            'model_info': {
                'type': 'LightGBM',
                'clusters_unified': True,
                'n_clusters': len(models['cluster_centroids'])
            }
        })
        
    except Exception as e:
        print(f"Error in predict_destination: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 400

@app.route('/api/search', methods=['GET'])
def search_location():
    """Search for locations in NYC area"""
    query = request.args.get('q', '')
    if len(query) < 3:
        return jsonify([])
    
    try:
        # Focus search on NYC area
        url = f'https://nominatim.openstreetmap.org/search?format=json&q={query}&viewbox=-74.25,40.49,-73.70,40.91&bounded=1&limit=10'
        headers = {'User-Agent': 'NYC-Taxi-App/1.0'}
        response = requests.get(url, headers=headers, timeout=5)
        data = response.json()
        
        results = []
        for item in data[:8]:  # Limit to 8 results
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
        
        url = f'https://router.project-osrm.org/route/v1/driving/{p_lon},{p_lat};{d_lon},{d_lat}?overview=full&geometries=geojson&steps=true'
        
        response = requests.get(url, timeout=10)
        data = response.json()
        
        if data.get('code') == 'Ok' and data.get('routes'):
            route = data['routes'][0]
            return jsonify({
                'status': 'success',
                'geometry': route['geometry'],
                'distance': route['distance'],
                'duration': route['duration'],
                'steps': route.get('legs', [{}])[0].get('steps', [])
            })
        
        return jsonify({'status': 'error', 'message': 'No route found'}), 404
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)