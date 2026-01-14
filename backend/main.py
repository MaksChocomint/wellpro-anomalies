import asyncio
import random
from collections import defaultdict, deque
from contextlib import asynccontextmanager
import json
from typing import Dict

from fastapi import FastAPI, APIRouter, UploadFile, File, WebSocket, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from methods import METHODS, FFT_WINDOW_SIZE, LOF_WINDOW_SIZE, Z_SCORE_WINDOW_SIZE
from data_utils import parse_data, filter_required_parameters
from analysis_utils import AnalysisState, handle_websocket_message, apply_analysis_method

DEFAULT_FILENAME = "default.TXT"
DEFAULT_WINDOWS_SIZE = max(FFT_WINDOW_SIZE, LOF_WINDOW_SIZE, Z_SCORE_WINDOW_SIZE)
router = APIRouter()


@router.post("/analyze/file")
async def analyze_file(
        method: str,
        window_size: int = Query(None),
        score_threshold: float = Query(None),
        file: UploadFile = File(...),
):
    """Analyze uploaded file for anomalies."""
    method = method.lower()
    if method not in METHODS:
        return JSONResponse(
            content={"error": f"Incorrect method. Choose from {list(METHODS.keys())}"},
            status_code=400
        )
    
    method_params = {}
    if window_size and window_size >= 0:
        method_params["window_size"] = window_size
    if score_threshold and score_threshold >= 0:
        method_params["score_threshold"] = score_threshold
    
    text = await file.read()
    parsed_data = await parse_data(text, DEFAULT_FILENAME)
    
    if parsed_data is None:
        return JSONResponse(
            content={"error": 'Column "Время" is compulsory in file'},
            status_code=400
        )
    
    # Filter to keep only 12 required parameters
    parsed_data = filter_required_parameters(parsed_data)

    data = [{} for _ in range(len(parsed_data))]
    deque_length = (window_size if window_size and window_size >= 0 else DEFAULT_WINDOWS_SIZE) + 1
    prev = defaultdict(lambda: deque(maxlen=deque_length))

    for i, record in enumerate(parsed_data):
        tasks = []
        time = record.pop("время")
        for key, value in record.items():
            prev[key].append(value)
            tasks.append(METHODS[method](data=prev[key], **method_params))
        results = await asyncio.gather(*tasks)
        for j, (key, value) in enumerate(record.items()):
            data[i][key] = [value, results[j]]
        data[i]["время"] = time

    return {"data": data}


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """WebSocket endpoint for real-time anomaly detection."""
    await ws.accept()
    
    # Initialize analysis state
    analysis_state = AnalysisState(default_window_size=DEFAULT_WINDOWS_SIZE)
    
    try:
        parsed_data = app.state.default_data
        record_index = 0

        while True:
            try:
                # Check for new messages from client (non-blocking)
                message_data = await asyncio.wait_for(ws.receive_text(), timeout=0.01)
                await handle_websocket_message(message_data, analysis_state)

            except asyncio.TimeoutError:
                # No new messages, continue sending data
                pass
            except Exception as e:
                print(f"[WebSocket] Error receiving message: {e}")

            # Process current data record
            if record_index < len(parsed_data):
                record = parsed_data[record_index]
                data = {}

                for key, value in record.items():
                    if key.lower() == "время":
                        data[key] = value
                        continue

                    # Add value to buffer
                    analysis_state.data_buffers[key].append(value)

                    # Apply analysis method
                    if len(analysis_state.data_buffers[key]) >= 2:
                        is_anomaly = await apply_analysis_method(
                            key,
                            analysis_state.data_buffers[key],
                            analysis_state.method,
                            analysis_state.get_method_params()
                        )
                        data[key] = [value, is_anomaly]
                    else:
                        data[key] = [value, False]

                try:
                    await ws.send_json({"data": data})
                    record_index += 1
                    await asyncio.sleep(random.uniform(1, 3))
                except Exception as e:
                    print(f"[WebSocket] Error sending data: {e}")
                    break
            else:
                # Reached end of data, restart
                record_index = 0
                analysis_state.data_buffers.clear()

    except Exception as e:
        print(f"[WebSocket] Connection error: {e}")
    finally:
        print("[WebSocket] Connection closed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    raw_data = await parse_data()
    # Filter to keep only 12 required parameters
    app.state.default_data = filter_required_parameters(raw_data) if raw_data else []
    print(f"[StartUp] Loaded {len(app.state.default_data)} records with 12 required parameters")
    yield


app = FastAPI(lifespan=lifespan)

# Добавление CORSMiddleware
origins = [
    "http://localhost",
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router, prefix="/api/v1")