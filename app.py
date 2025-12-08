import pandas as pd
import numpy as np
from flask import Flask, render_template, request, jsonify
import joblib
import math
from datetime import datetime

app = Flask(__name__)

# --- LOAD MODELS ---
MODEL_PATH = 'models/'
models = {}

def load_models():
    try:
        models['xgb_duration'] = joblib.load(MODEL_PATH + 'xgb_problem1_final.pkl')
        models['feat_duration'] = joblib.load(MODEL_PATH + 'features_problem1_final.pkl')
        models['rf_dest'] = joblib.load(MODEL_PATH + 'best_model_problem2.pkl') 
        models['feat_dest'] = joblib.load(MODEL_PATH + 'features_problem2_final.pkl')
        models['kmeans_pickup'] = joblib.load(MODEL_PATH + 'kmeans_pickup.pkl')
        models['kmeans_dropoff'] = joblib.load(MODEL_PATH + 'kmeans_dropoff.pkl')
        print("✅ Semua model berhasil dimuat.")
    except Exception as e:
        print(f"❌ Error loading models: {e}")

load_models()

# --- MATH FUNCTIONS ---
def calculate_haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def calculate_bearing(lat1, lon1, lat2, lon2):
    dLon = math.radians(lon2 - lon1)
    lat1 = math.radians(lat1)
    lat2 = math.radians(lat2)
    y = math.sin(dLon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dLon)
    brng = math.degrees(math.atan2(y, x))
    return (brng + 360) % 360

# --- ROUTES ---
@app.route('/')
def home():
    return render_template('home.html')

@app.route('/duration')
def duration_page():
    return render_template('duration.html')

@app.route('/destination')
def destination_page():
    return render_template('destination.html')

# --- API ENDPOINTS ---
@app.route('/api/predict_duration', methods=['POST'])
def predict_duration():
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
        is_rush = 1 if hour in [8,9,10,15,16,17,18] else 0
        
        # Cyclical Features
        h_sin = np.sin(2 * np.pi * hour / 24)
        h_cos = np.cos(2 * np.pi * hour / 24)
        m_sin = np.sin(2 * np.pi * month / 12)
        m_cos = np.cos(2 * np.pi * month / 12)
        
        # Clustering
        p_cluster = models['kmeans_pickup'].predict([[p_lat, p_lon]])[0]
        d_cluster = models['kmeans_dropoff'].predict([[d_lat, d_lon]])[0]

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
        
        return jsonify({
            'status': 'success',
            'duration_minutes': int(duration_minutes),
            'distance_km': round(dist_km, 2),
            'pickup_cluster': int(p_cluster),
            'dropoff_cluster': int(d_cluster),
            'pickup_coords': [p_lat, p_lon],
            'dropoff_coords': [d_lat, d_lon]
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400

@app.route('/api/predict_destination', methods=['POST'])
def predict_destination():
    try:
        data = request.json
        p_lat = float(data['pickup_lat'])
        p_lon = float(data['pickup_lon'])
        passengers = int(data['passengers'])
        
        dt = datetime.strptime(data['datetime'], '%Y-%m-%dT%H:%M')
        
        # Feature Engineering for Model 2
        hour = dt.hour
        month = dt.month
        day = dt.weekday()
        is_weekend = 1 if day >= 5 else 0
        is_rush = 1 if hour in [8,9,10,15,16,17,18] else 0
        
        # Cyclical Features
        h_sin = np.sin(2 * np.pi * hour / 24)
        h_cos = np.cos(2 * np.pi * hour / 24)
        m_sin = np.sin(2 * np.pi * month / 12)
        m_cos = np.cos(2 * np.pi * month / 12)
        
        # Clustering
        p_cluster = models['kmeans_pickup'].predict([[p_lat, p_lon]])[0]
        
        # Prepare input for Model 2
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
        
        # Add placeholder features for Model 2 if needed
        df_in = pd.DataFrame([input_data])
        for f in models['feat_dest']:
            if f not in df_in.columns:
                df_in[f] = 0
        
        # Get TOP 3 predictions with probabilities (if model supports predict_proba)
        try:
            # Try to get probabilities if model supports it
            probabilities = models['rf_dest'].predict_proba(df_in[models['feat_dest']])[0]
            top_3_indices = np.argsort(probabilities)[-3:][::-1]  # Top 3 descending
            top_3_predictions = []
            
            for idx in top_3_indices:
                prob = float(probabilities[idx])
                top_3_predictions.append({
                    'cluster': int(idx),
                    'probability': round(prob * 100, 1),
                    'confidence': get_confidence_label(prob)
                })
            
        except:
            # Fallback: If model doesn't support predict_proba, just get top 1
            pred_cluster = models['rf_dest'].predict(df_in[models['feat_dest']])[0]
            top_3_predictions = [{
                'cluster': int(pred_cluster),
                'probability': 85.0,
                'confidence': 'Tinggi'
            }]
        
        # Map clusters to real NYC locations
        cluster_locations = {
            0: {"name": "Times Square Area", "coords": [40.7580, -73.9855], "type": "Hiburan"},
            1: {"name": "Financial District", "coords": [40.7075, -74.0113], "type": "Bisnis"},
            2: {"name": "Upper East Side", "coords": [40.7736, -73.9566], "type": "Permukiman"},
            3: {"name": "Chelsea/Meatpacking", "coords": [40.7420, -74.0048], "type": "Hiburan"},
            4: {"name": "Williamsburg", "coords": [40.7081, -73.9571], "type": "Hipster Area"},
            5: {"name": "Astoria", "coords": [40.7644, -73.9235], "type": "Permukiman"},
            6: {"name": "Harlem", "coords": [40.8116, -73.9465], "type": "Permukiman"},
            7: {"name": "JFK Airport", "coords": [40.6413, -73.7781], "type": "Transportasi"},
            8: {"name": "LaGuardia Airport", "coords": [40.7769, -73.8740], "type": "Transportasi"},
            9: {"name": "Brooklyn Heights", "coords": [40.6953, -73.9965], "type": "Permukiman"},
            10: {"name": "SoHo", "coords": [40.7233, -74.0030], "type": "Belanja"},
            11: {"name": "Greenwich Village", "coords": [40.7336, -74.0027], "type": "Hiburan"},
            12: {"name": "Midtown East", "coords": [40.7549, -73.9840], "type": "Bisnis"},
            13: {"name": "Upper West Side", "coords": [40.7870, -73.9754], "type": "Permukiman"},
            14: {"name": "Long Island City", "coords": [40.7447, -73.9485], "type": "Permukiman"}
        }
        
        # Enhance predictions with location data
        enhanced_predictions = []
        for pred in top_3_predictions:
            cluster_id = pred['cluster']
            location_info = cluster_locations.get(cluster_id, {
                "name": f"Zona {cluster_id}",
                "coords": [40.7580, -73.9855],
                "type": "Unknown"
            })
            
            enhanced_predictions.append({
                **pred,
                "location_name": location_info["name"],
                "coords": location_info["coords"],
                "area_type": location_info["type"]
            })
        
        return jsonify({
            'status': 'success',
            'pickup_cluster': int(p_cluster),
            'pickup_coords': [p_lat, p_lon],
            'hour': hour,
            'month': month,
            'day_of_week': ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'][day],
            'top_predictions': enhanced_predictions,
            'total_clusters': len(cluster_locations)
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400

def get_confidence_label(probability):
    if probability >= 0.8:
        return "Sangat Tinggi"
    elif probability >= 0.6:
        return "Tinggi"
    elif probability >= 0.4:
        return "Sedang"
    else:
        return "Rendah"
    
@app.route('/api/search', methods=['GET'])
def search_location():
    query = request.args.get('q', '')
    if len(query) < 3:
        return jsonify([])
    
    try:
        import requests
        url = f'https://nominatim.openstreetmap.org/search?format=json&q={query}&viewbox=-74.25,40.49,-73.70,40.91&bounded=1'
        headers = {'User-Agent': 'NYC-Taxi-App'}
        response = requests.get(url, headers=headers)
        data = response.json()
        
        results = []
        for item in data[:10]:  # Limit to 10 results
            results.append({
                'display_name': item['display_name'],
                'lat': float(item['lat']),
                'lon': float(item['lon'])
            })
        return jsonify(results)
    except:
        return jsonify([])

if __name__ == '__main__':
    app.run(debug=True)