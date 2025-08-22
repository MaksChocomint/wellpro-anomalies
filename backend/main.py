import asyncio
import random
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from io import StringIO

import pandas as pd
from fastapi import FastAPI, APIRouter, UploadFile, File, WebSocket, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from methods import METHODS, FFT_WINDOW_SIZE, LOF_WINDOW_SIZE, Z_SCORE_WINDOW_SIZE

DEFAULT_FILENAME = "default.TXT"
DEFAULT_WINDOWS_SIZE = max(FFT_WINDOW_SIZE, LOF_WINDOW_SIZE, Z_SCORE_WINDOW_SIZE)
router = APIRouter()


async def parse_data(text=None):
    if text is None:
        with open(DEFAULT_FILENAME, 'rb') as file:
            text = file.read()
    df = pd.read_csv(
        StringIO(text.decode("utf-8")),
        sep='\t',
        header=0,
        decimal=',',
        skiprows=2
    )
    df.columns = df.columns.str.lower()
    if 'время' not in df.columns:
        return None
    return df.to_dict(orient="records")


@router.post("/analyze/file")
async def analyze_file(
        method: str,
        window_size: int = Query(None),
        score_threshold: float = Query(None),
        file: UploadFile = File(...),
):
    method = method.lower()
    if method not in METHODS:
        return JSONResponse(content={"error": f"Incorrect method. Choose from {list(METHODS.keys())}"}, status_code=400)
    method_params = {}
    if window_size and window_size >= 0:
        method_params["window_size"] = window_size
    if score_threshold and score_threshold >= 0:
        method_params["score_threshold"] = score_threshold
    text = await file.read()
    parsed_data = await parse_data(text)
    if parsed_data is None:
        return JSONResponse(content={"error": 'Column "Время" is compulsory in file'}, status_code=400)

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
    await ws.accept()
    try:
        message = await ws.receive_json()
        method = message.get("method", "").lower()
        window_size = message.get("window_size")
        score_threshold = message.get("score_threshold")
        method_params = {}
        if window_size and window_size >= 0:
            method_params["window_size"] = window_size
        if score_threshold and score_threshold >= 0:
            method_params["score_threshold"] = score_threshold

        if method not in METHODS:
            reason = f"Skipped or wrong method. Choose from {list(METHODS.keys())}"
            await ws.close(code=1011, reason=reason)
            return

        parsed_data = app.state.default_data

        while True:
            deque_length = (window_size if window_size and window_size >= 0 else DEFAULT_WINDOWS_SIZE) + 1
            prev = defaultdict(lambda: deque(maxlen=deque_length))
            for record in parsed_data:
                data = {}
                for key, value in record.items():
                    if key.lower() == "время":
                        data[key] = value
                        continue

                    prev[key].append(value)
                    is_anomaly = await METHODS[method](list(prev[key]), **method_params)
                    data[key] = [value, is_anomaly]

                await ws.send_json({"data": data})
                await asyncio.sleep(random.randint(1, 5))

    except Exception as e:
        print(e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.default_data = await parse_data()
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
