import asyncio
import random
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from io import StringIO
import json
from typing import Dict

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

    # Начальные параметры
    current_method = "fft"
    current_window_size = DEFAULT_WINDOWS_SIZE
    current_score_threshold = 0.5
    method_params = {
        "window_size": current_window_size,
        "score_threshold": current_score_threshold
    }

    # Создаем буферы данных для каждого параметра
    data_buffers: Dict[str, deque] = defaultdict(lambda: deque(maxlen=current_window_size + 1))

    try:
        parsed_data = app.state.default_data

        # Индекс текущей записи
        record_index = 0

        while True:
            try:
                # Проверяем наличие новых сообщений от клиента
                message_data = await asyncio.wait_for(ws.receive_text(), timeout=0.01)
                try:
                    message = json.loads(message_data)

                    print(f"[WebSocket] Received message: {message}")

                    # Обновляем параметры анализа
                    if "method" in message:
                        method = message["method"].lower()
                        if method in METHODS:
                            current_method = method
                            print(f"[WebSocket] Method changed to: {current_method}")
                            # Очищаем буферы при смене метода
                            data_buffers.clear()
                            data_buffers = defaultdict(lambda: deque(maxlen=current_window_size + 1))

                    if "window_size" in message:
                        window_size = message["window_size"]
                        if window_size and window_size >= 0:
                            current_window_size = window_size
                            method_params["window_size"] = window_size
                            print(f"[WebSocket] Window size changed to: {current_window_size}")
                            # Обновляем размер буферов
                            for key in data_buffers:
                                data_buffers[key] = deque(data_buffers[key], maxlen=current_window_size + 1)

                    if "score_threshold" in message:
                        score_threshold = message["score_threshold"]
                        if score_threshold and score_threshold >= 0:
                            current_score_threshold = score_threshold
                            method_params["score_threshold"] = score_threshold
                            print(f"[WebSocket] Score threshold changed to: {current_score_threshold}")

                    # Обновляем специфичные параметры метода
                    # Эти параметры уже переданы через score_threshold, но оставим для обратной совместимости
                    if current_method == "fft" and "FFT" in message:
                        method_params["score_threshold"] = message["FFT"]
                    elif current_method == "z_score" and "Z_score" in message:
                        method_params["score_threshold"] = message["Z_score"]
                    elif current_method == "lof" and "LOF" in message:
                        method_params["score_threshold"] = message["LOF"]

                except json.JSONDecodeError:
                    print(f"[WebSocket] Invalid JSON received: {message_data}")

            except asyncio.TimeoutError:
                # Таймаут - нет новых сообщений, продолжаем отправку данных
                pass
            except Exception as e:
                print(f"[WebSocket] Error receiving message: {e}")

            # Обрабатываем текущую запись данных
            if record_index < len(parsed_data):
                record = parsed_data[record_index]
                data = {}

                for key, value in record.items():
                    if key.lower() == "время":
                        data[key] = value
                        continue

                    # Добавляем значение в буфер
                    data_buffers[key].append(value)

                    # Применяем текущий метод с текущими параметрами
                    if len(data_buffers[key]) >= 2:  # Нужно как минимум 2 точки для анализа
                        try:
                            # Создаем копию параметров для текущего метода
                            current_method_params = method_params.copy()

                            # Удаляем лишние параметры в зависимости от метода
                            if current_method == "fft":
                                # У FFT обычно есть специфичные параметры
                                pass
                            elif current_method == "z_score":
                                # Для z-score можем передать дополнительный параметр
                                if "Z_score" in method_params:
                                    current_method_params["z_threshold"] = method_params.get("Z_score", 3.0)
                            elif current_method == "lof":
                                # Для LOF можем передать дополнительный параметр
                                if "LOF" in method_params:
                                    current_method_params["lof_threshold"] = method_params.get("LOF", 25.0)

                            is_anomaly = await METHODS[current_method](
                                list(data_buffers[key]),
                                **current_method_params
                            )
                            data[key] = [value, is_anomaly]
                        except Exception as e:
                            print(f"[WebSocket] Error in {current_method} method: {e}")
                            print(f"Method params: {method_params}")
                            print(f"Buffer length: {len(data_buffers[key])}")
                            data[key] = [value, False]
                    else:
                        data[key] = [value, False]

                try:
                    await ws.send_json({"data": data})
                    record_index += 1
                    await asyncio.sleep(random.uniform(1, 3))  # Случайная задержка
                except Exception as e:
                    print(f"[WebSocket] Error sending data: {e}")
                    break
            else:
                # Достигли конца данных, начинаем заново
                record_index = 0
                # Очищаем буферы при перезапуске цикла
                data_buffers.clear()
                data_buffers = defaultdict(lambda: deque(maxlen=current_window_size + 1))

    except Exception as e:
        print(f"[WebSocket] Connection error: {e}")
    finally:
        print("[WebSocket] Connection closed")


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