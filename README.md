# 🚖 NYC Taxi Intelligence System

![Python](https://img.shields.io/badge/Python-3.11-blue?style=for-the-badge&logo=python)
![Apache Spark](https://img.shields.io/badge/Apache%20Spark-PySpark-orange?style=for-the-badge&logo=apachespark)
![Flask](https://img.shields.io/badge/Flask-Web%20App-black?style=for-the-badge&logo=flask)
![XGBoost](https://img.shields.io/badge/XGBoost-Regressor-red?style=for-the-badge)
![LightGBM](https://img.shields.io/badge/LightGBM-Classifier-green?style=for-the-badge)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-Modern_UI-38B2AC?style=for-the-badge&logo=tailwind-css)

**NYC Taxi Intelligence System** is an End-to-End Data Science solution designed to predict trip durations and optimize pickup strategies for taxi drivers in New York City.

This project demonstrates a **hybrid architecture**: leveraging **Apache Spark** for high-volume data processing and feature engineering, combined with lightweight **XGBoost** and **LightGBM** models for real-time inference via a **Flask** web application.

---

## 🌟 Key Features

### 1. ⏱️ Trip Duration Predictor (Regression)
* **Precision Estimation:** Predicts travel time (in minutes) based on pickup/dropoff coordinates and departure time.
* **Context Aware:** Accounts for historical traffic patterns, rush hours, and weekend dynamics.
* **Real-time Calculation:** Provides accurate arrival time estimates directly on the dashboard.

### 2. 🎯 Destination & Route Recommender (Classification)
* **Predictive Intelligence:** Forecasts the top 3 most likely destination zones from a driver's current location.
* **Anti-Deadhead Strategy:** Analyzes probability distributions to recommend optimal standby locations for drivers looking for passengers heading towards specific zones (minimizing empty trips).

### 3. 🗺️ Interactive Zone Visualization
* **Clustering Analysis:** Visualizes 10 strategic taxi zones generated via K-Means clustering.
* **Operational Insights:** Displays real statistics per zone, including average speed, passenger volume, and peak hours.

---

## 🛠️ Tech Stack

### Big Data & Engineering
* **Apache Spark (PySpark):** Utilized for cleaning, preprocessing, and engineering features on a dataset of 1.4M+ records.
* **Pandas & NumPy:** Data manipulation for the final modeling stage.

### Machine Learning
* **XGBoost Regressor:** Optimized for Problem 1 (Duration Prediction) using log-transformed targets.
* **LightGBM Classifier:** Optimized for Problem 2 (Destination Prediction) using multiclass objective.
* **Scikit-Learn:** Used for K-Means Clustering and metric evaluation.

### Web Application
* **Backend:** Flask (Python).
* **Frontend:** HTML5, Tailwind CSS (Responsive UI), Leaflet.js (Interactive Maps).

---

## 📊 Data Science Methodology

This project follows a rigorous data pipeline:

### 1. Data Cleaning (PySpark)
* **Outlier Removal:** Filtered trips with duration > 2 hours or < 1 minute, and speeds > 120 km/h (GPS anomalies).
* **Geo-Fencing:** Restricted coordinates to the NYC metropolitan area bounding box.
* **Quality Control:** Handled null values and removed duplicate entries using Spark DataFrame operations.

### 2. Strategic Clustering (K-Means)
Instead of using static administrative boroughs, we employed **Data-Driven K-Means Clustering (K=10)**.
* **Rationale:** Captures actual demand hotspots (e.g., JFK Airport, Times Square) that transcend administrative boundaries.
* **Implementation:** Clustered pickup and dropoff coordinates to create dynamic zones.

### 3. Advanced Feature Engineering
* **Geospatial Features:** Calculated Haversine Distance, Manhattan Distance, and Bearing (direction).
* **Cyclical Time Features:** Transformed Hour and Month into Sine/Cosine components to preserve cyclical continuity for the model.
* **Traffic Estimation:** Aggregated historical average speeds per cluster and hour.
* **Boolean Flags:** `is_rush_hour`, `is_weekend`.

### 4. Model Performance
* **Problem 1 (Duration):** XGBoost achieved superior performance on the Log-Transformed target (`log_trip_duration`), minimizing MAPE (Mean Absolute Percentage Error).
* **Problem 2 (Destination):** LightGBM achieved high Top-3 Accuracy in predicting one of the 10 destination clusters.

---

## 🚀 Installation & Usage

Follow these steps to set up the project locally.

### Prerequisites
* Python 3.10 or higher.
* Git.

### Step-by-Step Guide

1.  **Clone the Repository**
    ```bash
    git clone [https://github.com/FerrelNW/nyc-taxi-ai.git](https://github.com/FerrelNW/nyc-taxi-ai.git)
    cd nyc-taxi-ai
    ```

2.  **Create a Virtual Environment (Recommended)**
    * **Windows:**
        ```bash
        python -m venv venv
        venv\Scripts\activate
        ```
    * **Mac/Linux:**
        ```bash
        python3 -m venv venv
        source venv/bin/activate
        ```

3.  **Install Dependencies**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Verify Model Files**
    Ensure that the `models/` directory contains the necessary pre-trained files:
    * `xgb_problem1_final.pkl`
    * `lgbm_destination_prediction.pkl`
    * `cluster_centroids.json`
    * `cluster_stats.json`
    
    *(Note: If these files are missing, you may need to run the training notebook `final-notebook.ipynb` first).*

5.  **Run the Application**
    ```bash
    python app.py
    ```

6.  **Access the Dashboard**
    Open your web browser and navigate to:
    **[http://localhost:5000](http://localhost:5000)**

---

## 📸 Screenshots

| **Smart Dashboard** | **Duration Estimator** |
| :---: | :---: |
| ![Dashboard](https://placehold.co/600x400?text=Dashboard+Screenshot) | ![Duration](https://placehold.co/600x400?text=Duration+Page) |

| **Destination Prediction** | **Zone Visualization** |
| :---: | :---: |
| ![Destination](https://placehold.co/600x400?text=Destination+Prediction) | ![Cluster](https://placehold.co/600x400?text=Cluster+Map) |

---

## 👨‍💻 Author
**Ferrel N W**
