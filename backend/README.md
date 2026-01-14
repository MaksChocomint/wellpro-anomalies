# WellPro Backend Architecture

## Project Structure

```
backend/
├── main.py                    # FastAPI application and routes
├── methods.py                 # Anomaly detection algorithms (FFT, Z-score, LOF)
├── data_utils.py              # Data parsing and validation utilities
├── analysis_utils.py          # Analysis state management and WebSocket handling
├── requirements.txt           # Python dependencies
├── PARAMETERS_INFO.md          # Detailed parameter descriptions
└── README.md                  # This file
```

## File Descriptions

### `main.py`

FastAPI application with:

- **POST /api/v1/analyze/file**: Upload and analyze a file
- **WS /api/v1/ws**: WebSocket endpoint for real-time analysis
- CORS middleware configuration
- Application lifespan management

### `methods.py`

Three anomaly detection algorithms:

- **FFT (Fast Fourier Transform)**: Detects frequency anomalies (vibrations, stuck situations)
- **Z-score**: Statistical outlier detection using standard deviation
- **LOF (Local Outlier Factor)**: Context-aware anomaly detection

### `data_utils.py` (NEW)

Utility functions for data handling:

- `parse_data()`: Parse tab-separated drilling data files
- `filter_required_parameters()`: Extract only the 12 key parameters
- `validate_parameter_value()`: Check if value is within valid range
- `get_parameter_inertia()`: Get inertia level for parameter
- Constants: `REQUIRED_PARAMETERS`, `PARAMETER_RANGES`, `PARAMETER_INERTIA`

### `analysis_utils.py` (NEW)

Analysis state management:

- `AnalysisState`: Class managing current method, thresholds, and data buffers
- `handle_websocket_message()`: Parse and handle client parameter updates
- `apply_analysis_method()`: Execute anomaly detection algorithm

### `PARAMETERS_INFO.md` (NEW)

Comprehensive documentation of 12 drilling parameters:

- Normal behavior ranges
- Inertia levels (very high to very low)
- Acceptable sudden changes
- Relationships with other parameters
- Anomaly detection logic
- Critical combinations

## Key Design Patterns

### 1. Separation of Concerns

- **Data layer** (data_utils.py): File parsing, validation, filtering
- **Analysis layer** (analysis_utils.py): Algorithm management, state
- **API layer** (main.py): HTTP/WebSocket endpoints, routing
- **Algorithm layer** (methods.py): Anomaly detection implementations

### 2. State Management

`AnalysisState` class encapsulates:

- Current analysis method
- Window size and score threshold
- Data buffers for each parameter
- Automatic buffer management

### 3. Parameter Management

12 key parameters configured in `data_utils.py`:

- Valid ranges for each parameter
- Inertia levels (affects anomaly detection sensitivity)
- Easy to extend or modify

### 4. Backward Compatibility

WebSocket handler maintains support for legacy parameter names:

- `FFT`, `Z_score`, `LOF` (legacy)
- Maps to modern `score_threshold` (current)

## API Endpoints

### File Analysis

```http
POST /api/v1/analyze/file?method=fft&window_size=64&score_threshold=0.3
Content-Type: multipart/form-data

file: <binary>
```

Response:

```json
{
  "data": [
    {
      "глубина": [500.5, false],
      "скорость_бурения": [80.2, false],
      "момент_ротора": [350.1, true],
      "время": 1234567890
    }
  ]
}
```

### Real-time Analysis

```http
WS /api/v1/ws
```

Client message to update parameters:

```json
{
  "method": "z_score",
  "window_size": 50,
  "score_threshold": 3.0
}
```

Server response (periodic):

```json
{
  "data": {
    "глубина": [500.5, false],
    "скорость_бурения": [80.2, false],
    "момент_ротора": [350.1, true],
    "время": 1234567890
  }
}
```

## Running the Backend

### Installation

```bash
pip install -r requirements.txt
```

### Development

```bash
uvicorn main:app --reload
```

### Production

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

## Configuration

### Default Parameters

- **Default window size**: 64 (FFT), 50 (Z-score, LOF)
- **Default method**: FFT
- **Default threshold**: 0.5
- **Data file**: default.TXT

### CORS Configuration

Allowed origins:

- `http://localhost:3000`
- `http://127.0.0.1:3000`
- Add more as needed in `main.py`

## Dependencies

- `fastapi`: Web framework
- `uvicorn`: ASGI server
- `pandas`: Data processing
- `numpy`: Numerical computations
- `python-multipart`: File upload support

## Future Improvements

1. **Database Integration**: Store analysis results and anomaly history
2. **Machine Learning**: Train models on historical data
3. **Parameter Grouping**: Analyze parameter relationships
4. **Alerts**: Send notifications for critical anomalies
5. **Configuration API**: Manage parameters and thresholds via API
6. **Performance Metrics**: Track detection accuracy and latency
7. **Data Validation**: More sophisticated parameter validation
8. **Caching**: Cache frequently used analyses
