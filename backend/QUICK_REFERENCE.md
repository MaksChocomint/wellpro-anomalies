# WellPro Backend - Quick Reference Guide

## 📋 Structure Overview

### Before Refactoring

```
backend/
├── main.py (240 lines) - Mixed concerns
├── methods.py (70 lines) - Algorithms only
└── requirements.txt
```

### After Refactoring ✅

```
backend/
├── main.py (159 lines) - API routes only
├── methods.py (70 lines) - Algorithms only
├── data_utils.py (107 lines) - Data handling
├── analysis_utils.py (116 lines) - Analysis state
├── README.md - Architecture documentation
├── PARAMETERS_INFO.md - Parameter documentation
└── requirements.txt
```

**Reduction: 240 → 159 lines in main.py (-34%)**

---

## 🎯 12 Key Drilling Parameters

| #   | Parameter         | Range        | Inertia   | Critical Value    |
| --- | ----------------- | ------------ | --------- | ----------------- |
| 1   | Глубина (Depth)   | 0-10000 m    | Very High | Jump > 10m        |
| 2   | Скорость бурения  | 0-300 m/h    | High      | Change > ±50%     |
| 3   | Вес на крюке      | 0-1000 t     | High      | Drop > 100 t      |
| 4   | Момент ротора     | 0-1000 kNm   | Low       | Jump > ±200 kNm   |
| 5   | Обороты ротора    | 0-300 RPM    | Very Low  | Jump > ±50 RPM    |
| 6   | Давление на входе | 0-500 bar    | Medium    | Jump > ±30 bar    |
| 7   | Расход на входе   | 0-2000 l/min | Low       | Jump > ±100 l/min |
| 8   | Температура выход | -20-100°C    | Very High | Jump > ±10°C      |
| 9   | Уровень в емкости | 0-100%       | Medium    | Jump > ±10%       |
| 10  | Скорость СПО      | 0-300 m/h    | High      | Deviation > ±30%  |
| 11  | Нагрузка          | 0-500 t      | High      | Jump > ±50 t      |
| 12  | ДМК               | 0-10 mm      | Very High | Jump > ±1 mm      |

---

## 🏗️ Architecture Benefits

### 1. Separation of Concerns ✓

- **data_utils.py**: Pure data functions
- **analysis_utils.py**: State management
- **methods.py**: Algorithms
- **main.py**: API routes only

### 2. Reusability ✓

- Use data_utils for file parsing anywhere
- Use analysis_utils for parameter management
- Use methods for offline analysis

### 3. Testability ✓

- Each module independently testable
- No mixed concerns
- Clear dependencies

### 4. Maintainability ✓

- Easy to find and modify parameter definitions
- Clear algorithm implementations
- Centralized state management

### 5. Extensibility ✓

- Add new parameters to `REQUIRED_PARAMETERS`
- Add new algorithms to `methods.py`
- Add new validation rules to `data_utils.py`

---

## 📦 New Utilities

### `data_utils.py`

```python
# Parse data file
data = await parse_data(text, filename)

# Filter to required parameters only
filtered = filter_required_parameters(data)

# Validate parameter value
is_valid = validate_parameter_value("глубина", 500)

# Get inertia level
level = get_parameter_inertia("скорость_бурения")
```

### `analysis_utils.py`

```python
# Create analysis state
state = AnalysisState(default_window_size=64)

# Update parameters
state.update_method("z_score")
state.update_window_size(50)
state.update_score_threshold(3.0)

# Handle WebSocket message
await handle_websocket_message(json_message, state)

# Apply analysis
is_anomaly = await apply_analysis_method(
    param_name="момент_ротора",
    data_buffer=state.data_buffers[param_name],
    method="fft",
    method_params=state.get_method_params()
)
```

---

## 🔄 Data Flow

```
┌─────────────────────────────────────────────────────────┐
│ Client (Frontend)                                       │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ File Upload or WebSocket
                     ▼
┌─────────────────────────────────────────────────────────┐
│ main.py                                                 │
│  • POST /analyze/file                                   │
│  • WS /ws                                               │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
    data_utils   analysis_utils  methods.py
    • Parse      • State Mgmt    • FFT
    • Filter     • WebSocket     • Z-score
    • Validate   • Handlers      • LOF

        ▼            ▼            ▼
        └────────────┼────────────┘
                     │
              Analysis Results
                     │
        ┌────────────▼────────────┐
        │ Client (Frontend) ✓     │
        │ Shows anomalies         │
        └────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Run Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### 2. Run Frontend

```bash
cd frontend
bun install
bun run dev
```

### 3. Test File Upload

```bash
curl -X POST "http://localhost:8000/api/v1/analyze/file?method=fft" \
  -F "file=@default.TXT"
```

### 4. Test WebSocket

```bash
# Use frontend UI or WebSocket client
ws://localhost:8000/api/v1/ws
```

---

## 📚 Documentation Files

### `README.md`

Complete backend architecture documentation

- File descriptions
- Design patterns
- API endpoints
- Configuration

### `PARAMETERS_INFO.md`

Detailed parameter reference (12 parameters)

- Normal behavior
- Inertia levels
- Acceptable changes
- Parameter relationships
- Critical combinations

---

## ✨ Key Features

✅ **Clean Architecture**: Separated concerns
✅ **12 Parameters**: Carefully selected drilling parameters  
✅ **3 Algorithms**: FFT, Z-score, LOF for anomaly detection
✅ **Real-time**: WebSocket for live monitoring
✅ **Documented**: Comprehensive parameter documentation
✅ **Extensible**: Easy to add parameters, algorithms, methods
✅ **Maintainable**: Clear code organization
✅ **Fast**: Async/await for performance

---

## 🔧 Common Tasks

### Add New Parameter

1. Add to `REQUIRED_PARAMETERS` in `data_utils.py`
2. Add range to `PARAMETER_RANGES`
3. Add inertia to `PARAMETER_INERTIA`
4. Update `PARAMETERS_INFO.md`

### Change Detection Algorithm

1. Modify thresholds in WebSocket message or file upload parameters
2. Or add new algorithm to `methods.py`

### Modify Buffer Window Size

Send WebSocket message:

```json
{ "window_size": 100 }
```

### Switch Analysis Method

Send WebSocket message:

```json
{ "method": "z_score" }
```

---

## 📞 Support

For questions or issues:

1. Check `README.md` for architecture details
2. Check `PARAMETERS_INFO.md` for parameter info
3. Review code comments in each utility file
4. Check method implementations in `methods.py`
