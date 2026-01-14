# WellPro System Architecture Diagram

## Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WELLPRO SYSTEM OVERVIEW                             │
└─────────────────────────────────────────────────────────────────────────────┘

                                  FRONTEND
                            ┌───────────────────┐
                            │   Next.js (3000)  │
                            │  • UI Components  │
                            │  • Real-time UI   │
                            │  • Graphs/Charts  │
                            └────────┬──────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                │                    │                    │
         HTTP Upload          WebSocket               HTTP Query
         POST /file           /ws                 GET /status
                │                    │                    │
                ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BACKEND (FastAPI:8000)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                  main.py                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ POST /file       │  │ WS /ws           │  │ CORS Middleware  │          │
│  │ • File parsing   │  │ • Real-time      │  │ • http://localhost:3000 │
│  │ • Analysis       │  │ • State mgmt     │  │ • http://127.0.0.1:3000 │
│  │ • Response       │  │ • Live updates   │  └──────────────────┘          │
│  └────────┬─────────┘  └────────┬─────────┘                                 │
│           │                     │                                            │
│           └─────────┬───────────┘                                            │
│                     │                                                        │
│     ┌───────────────▼───────────────────────────────────┐                   │
│     │          Data Processing Layer                    │                   │
│     │ ┌────────────────┐  ┌────────────────────────┐   │                   │
│     │ │  data_utils.py │  │  analysis_utils.py     │   │                   │
│     │ │                │  │                        │   │                   │
│     │ │ • parse_data   │  │ • AnalysisState class  │   │                   │
│     │ │ • filter_req   │  │ • update_method()      │   │                   │
│     │ │ • validate_val │  │ • handle_ws_message()  │   │                   │
│     │ │ • get_inertia  │  │ • apply_analysis()     │   │                   │
│     │ │                │  │                        │   │                   │
│     │ │ PARAMS: 12     │  │ STATE MGMT:            │   │                   │
│     │ │ • Ranges       │  │ • Method               │   │                   │
│     │ │ • Inertia      │  │ • Window size          │   │                   │
│     │ │ • Config       │  │ • Threshold            │   │                   │
│     │ │                │  │ • Buffers              │   │                   │
│     │ └────────────────┘  └────────────────────────┘   │                   │
│     └───────────────┬─────────────────────────────────┘                    │
│                     │                                                        │
│                     ▼                                                        │
│     ┌───────────────────────────────────────┐                               │
│     │      Analysis Algorithms Layer         │                              │
│     │         methods.py                    │                              │
│     │ ┌─────────────┐  ┌─────────────┐     │                              │
│     │ │ FFT         │  │ Z-score     │     │                              │
│     │ │ • Frequency │  │ • Stdev     │     │                              │
│     │ │ • Vibration │  │ • Outliers  │     │                              │
│     │ │ • Stuck     │  │ • Sudden    │     │                              │
│     │ │ Window: 64  │  │ • Window:50 │     │                              │
│     │ └─────────────┘  └─────────────┘     │                              │
│     │ ┌─────────────────────────────────┐  │                              │
│     │ │ LOF (Local Outlier Factor)      │  │                              │
│     │ │ • Context-aware                 │  │                              │
│     │ │ • Local density                 │  │                              │
│     │ │ • Neighbor-based                │  │                              │
│     │ │ • Window: 50                    │  │                              │
│     │ └─────────────────────────────────┘  │                              │
│     └───────────────────────────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────┘

                                  DATABASE
                            (Future: Persist Results)
                           ┌───────────────────┐
                           │ • Analysis Results│
                           │ • Anomalies       │
                           │ • Trends          │
                           └───────────────────┘
```

---

## 12 Drilling Parameters

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DRILLING PARAMETERS (12)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  GROUP 1: DEPTH & SPEED                                                    │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐   │
│  │ 1. Глубина (Depth) │  │ 2. Скорость        │  │ 10. Скорость СПО   │   │
│  │ Range: 0-10000 m   │  │    Бурения         │  │ Range: 0-300 m/h   │   │
│  │ Inertia: Very High │  │ Range: 0-300 m/h   │  │ Inertia: High      │   │
│  │ Jump Anomaly: >10m │  │ Inertia: High      │  │ Deviation: >±30%   │   │
│  └────────────────────┘  │ Change: >±50%      │  └────────────────────┘   │
│                          └────────────────────┘                             │
│                                                                              │
│  GROUP 2: WEIGHT & LOAD                                                    │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐   │
│  │ 3. Вес на крюке    │  │ 11. Нагрузка       │  │                    │   │
│  │    (Hook Load)     │  │     (Weight)       │  │                    │   │
│  │ Range: 0-1000 t    │  │ Range: 0-500 t     │  │                    │   │
│  │ Inertia: High      │  │ Inertia: High      │  │                    │   │
│  │ Jump: >±100 t      │  │ Jump: >±50 t       │  │                    │   │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘   │
│                                                                              │
│  GROUP 3: ROTATION & TORQUE                                                │
│  ┌────────────────────┐  ┌────────────────────┐                            │
│  │ 4. Момент ротора   │  │ 5. Обороты ротора  │                            │
│  │    (Torque)        │  │    (RPM)           │                            │
│  │ Range: 0-1000 kNm  │  │ Range: 0-300 RPM   │                            │
│  │ Inertia: Low       │  │ Inertia: Very Low  │                            │
│  │ Jump: >±200 kNm    │  │ Jump: >±50 RPM     │                            │
│  └────────────────────┘  └────────────────────┘                            │
│                                                                              │
│  GROUP 4: PRESSURE & FLOW                                                  │
│  ┌────────────────────┐  ┌────────────────────┐                            │
│  │ 6. Давление        │  │ 7. Расход на       │                            │
│  │    на входе        │  │    входе (Flow)    │                            │
│  │ Range: 0-500 bar   │  │ Range: 0-2000 l/min│                            │
│  │ Inertia: Medium    │  │ Inertia: Low       │                            │
│  │ Jump: >±30 bar     │  │ Jump: >±100 l/min  │                            │
│  └────────────────────┘  └────────────────────┘                            │
│                                                                              │
│  GROUP 5: TEMPERATURE & LEVELS                                             │
│  ┌────────────────────┐  ┌────────────────────┐                            │
│  │ 8. Температура     │  │ 9. Уровень в       │                            │
│  │    на выходе       │  │    емкости (Tank)  │                            │
│  │ Range: -20 to 100°C│  │ Range: 0-100%      │                            │
│  │ Inertia: Very High │  │ Inertia: Medium    │                            │
│  │ Jump: >±10°C       │  │ Jump: >±10%        │                            │
│  └────────────────────┘  └────────────────────┘                            │
│                                                                              │
│  GROUP 6: GEOLOGICAL                                                       │
│  ┌────────────────────────────────────────────┐                            │
│  │ 12. ДМК (Mud Cake Thickness)              │                            │
│  │ Range: 0-10 mm                            │                            │
│  │ Inertia: Very High (Cumulative)           │                            │
│  │ Jump: >±1 mm (Indicates issue)            │                            │
│  └────────────────────────────────────────────┘                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow During Real-time Monitoring

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      REAL-TIME DATA FLOW                                 │
└──────────────────────────────────────────────────────────────────────────┘

  TIME: t=0
  ┌────────────────────────────────────────────────────┐
  │ Frontend Client                                    │
  │ • Establishes WebSocket connection                │
  │ • Default: FFT, window_size=64, threshold=0.5     │
  └────────────────┬─────────────────────────────────┘
                   │
                   │ WS Connection: /api/v1/ws
                   ▼
  ┌────────────────────────────────────────────────────┐
  │ Backend WebSocket Handler                          │
  │ analysis_state = AnalysisState(DEFAULT_WINDOWS)   │
  │ record_index = 0                                  │
  └────────────────┬─────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼ TIME: t=1          ▼ TIME: t=2 (Client sends update)
   ┌─────────────┐    ┌────────────────────────────────┐
   │ Read record │    │ Client message:                │
   │ index: 0    │    │ {"method": "z_score",          │
   └──────┬──────┘    │  "window_size": 50}            │
          │           └────────┬───────────────────────┘
          │                    │
          ▼                    ▼
   ┌────────────────────────────────┐
   │ For each parameter in record:  │
   │ • Append to buffer             │
   │ • Apply current method:        │
   │   - Call METHODS[method]()     │
   │   - Get anomaly: true/false    │
   └────────┬───────────────────────┘
            │
            ▼
   ┌────────────────────────────────┐
   │ Build response object:         │
   │ {                              │
   │   "data": {                    │
   │     "глубина": [500, false],   │
   │     "момент": [350, true],     │ ← ANOMALY!
   │     "время": 1234567890        │
   │   }                            │
   │ }                              │
   └────────┬───────────────────────┘
            │
            ▼
   ┌────────────────────────────────┐
   │ Send to Frontend               │
   │ ws.send_json(response)         │
   │ record_index += 1              │
   │ sleep(1-3 seconds)             │
   └────────┬───────────────────────┘
            │
            ▼
   ┌────────────────────────────────┐
   │ Frontend receives update       │
   │ • Display in real-time graph   │
   │ • Highlight anomalies          │
   │ • Update dashboard             │
   └────────────────────────────────┘
```

---

## Decision Flow for Anomaly Detection

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   ANOMALY DETECTION FLOW                               │
└─────────────────────────────────────────────────────────────────────────┘

                         New Data Point Arrives
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │ Is buffer length >= 2?  │
                    └─────────┬───────────────┘
                              │
                    ┌─────────┴─────────┐
                    │ NO              YES
                    ▼                  ▼
            ┌──────────────┐  ┌──────────────────────────┐
            │ Return False │  │ Select Analysis Method:  │
            └──────────────┘  └──────────┬───────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
            ┌────────────┐      ┌────────────┐      ┌────────────┐
            │ FFT        │      │ Z-score    │      │ LOF        │
            │ ↓          │      │ ↓          │      │ ↓          │
            │ Frequency  │      │ Statistical│      │ Local      │
            │ analysis   │      │ outlier    │      │ density    │
            │ (Vibration)│      │ detection  │      │ (Context)  │
            │ (Stuck)    │      │            │      │            │
            └────┬───────┘      └────┬───────┘      └────┬───────┘
                 │                   │                   │
                 └───────────────────┼───────────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────┐
                     │ Compare with Threshold:   │
                     │ FFT: 0.3                  │
                     │ Z-score: 3.0              │
                     │ LOF: 25                   │
                     └───────────┬───────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │ EXCEEDED           NOT EXCEEDED
                    ▼                  ▼
            ┌──────────────┐  ┌──────────────┐
            │ Anomaly=TRUE │  │ Anomaly=FALSE│
            └──────┬───────┘  └──────┬───────┘
                   │                │
                   └────────┬────────┘
                            │
                            ▼
                  ┌────────────────────┐
                  │ Return is_anomaly  │
                  │ [value, anomaly]   │
                  └────────┬───────────┘
                           │
                           ▼
                  ┌────────────────────┐
                  │ Send to Frontend   │
                  │ in data packet     │
                  └────────────────────┘
```

---

## Critical Combinations Alert

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CRITICAL COMBINATIONS                               │
└─────────────────────────────────────────────────────────────────────────┘

COMBINATION 1: Drill Pipe Break Risk
┌────────────────────────────────────────────┐
│ ↓ Hook Load + ↓ Torque + ⚠ Sudden Drop   │ ──► CRITICAL!
└────────────────────────────────────────────┘
Action: STOP immediately

COMBINATION 2: System Blockage
┌────────────────────────────────────────────┐
│ ↑ Pressure + ↓ Flow (Inverse)             │ ──► CRITICAL!
└────────────────────────────────────────────┘
Action: Flush system

COMBINATION 3: Drill Pipe Stuck
┌────────────────────────────────────────────┐
│ ↑ Torque + ↓ Speed + ↑ Hook Load          │ ──► CRITICAL!
└────────────────────────────────────────────┘
Action: Free the stuck section

COMBINATION 4: Thermal Runaway
┌────────────────────────────────────────────┐
│ ↑↑ Torque + ↑↑ RPM + ↑ Temperature        │ ──► CRITICAL!
└────────────────────────────────────────────┘
Action: Reduce RPM and load

COMBINATION 5: Loss of Circulation
┌────────────────────────────────────────────┐
│ ↓ Tank Level + ↓ Pressure + ↓ Flow        │ ──► CRITICAL!
└────────────────────────────────────────────┘
Action: Check for leaks

```

---

## File Organization Comparison

```
BEFORE:                          AFTER:
────────                         ──────

main.py (240 lines)              main.py (159 lines)
├─ Data parsing                  ├─ API routes only
├─ WebSocket logic               └─ Clean, focused
├─ State management
├─ Analysis calls                 data_utils.py (107 lines)
├─ Mixed concerns                 ├─ parse_data()
└─ Hard to test                   ├─ validate_parameter()
                                  ├─ get_parameter_inertia()
methods.py (70 lines)             └─ Constants (RANGES, INERTIA)
├─ FFT
├─ Z-score                        analysis_utils.py (198 lines)
└─ LOF                            ├─ AnalysisState class
                                  ├─ handle_websocket_message()
requirements.txt                  ├─ apply_analysis_method()
└─ Dependencies                   └─ State management

README.md                          methods.py (70 lines)
                                  ├─ FFT
No docs!                          ├─ Z-score
                                  └─ LOF

                                  README.md (Architecture)
                                  PARAMETERS_INFO.md (Detailed)
                                  QUICK_REFERENCE.md (Quick)
                                  REFACTORING_SUMMARY.md (Summary)

                                  Total: 4 documentation files!
```
