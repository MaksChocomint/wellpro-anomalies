import asyncio
import random
import sys
from collections import defaultdict, deque
from contextlib import asynccontextmanager

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI, APIRouter, UploadFile, File, WebSocket, Query, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from sqlalchemy import text

from app.db import engine
from app.api import router as entities_router

from app.methods import METHODS, FFT_WINDOW_SIZE, LOF_WINDOW_SIZE, Z_SCORE_WINDOW_SIZE
from app.utils.data_utils import parse_data, filter_required_parameters
from app.utils.analysis_utils import (
    AnalysisState,
    handle_websocket_message,
    apply_analysis_method,
)

from app.models.base import Base
from app.models import *  # важно чтобы модели зарегистрировались




DEFAULT_FILENAME = "data/default.TXT"
DEFAULT_WINDOWS_SIZE = max(FFT_WINDOW_SIZE, LOF_WINDOW_SIZE, Z_SCORE_WINDOW_SIZE)
router = APIRouter()

@router.get("/health")
async def health_check():
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        return {"status": result.scalar()}


@router.post("/analyze/file")
async def analyze_file(
        method: str,
        window_size: int = Query(None),
        score_threshold: float = Query(None),
        file: UploadFile = File(...),
):
    """Анализ загруженного файла на аномалии с подсчетом количества."""
    method = method.lower()
    if method not in METHODS:
        return JSONResponse(
            content={"error": f"Неверный метод. Выберите из {list(METHODS.keys())}"},
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
            content={"error": 'Столбец "Время" обязателен в файле'},
            status_code=400
        )
    
    parsed_data = filter_required_parameters(parsed_data)

    data = [{} for _ in range(len(parsed_data))]
    deque_length = (window_size if window_size and window_size >= 0 else DEFAULT_WINDOWS_SIZE) + 1
    prev = defaultdict(lambda: deque(maxlen=deque_length))
    
    # Счётчик аномалий
    total_anomalies = 0

    for i, record in enumerate(parsed_data):
        tasks = []
        time = record.pop("время")
        
        # Собираем ключи, чтобы сохранить порядок после gather
        keys = list(record.keys())
        
        for key in keys:
            value = record[key]
            prev[key].append(value)
            
            # Подготовка параметров для метода
            current_params = method_params.copy()
            if method == "ammad":
                current_params["param_name"] = key
            
            # ВАЖНО: передаем list(prev[key]), так как deque не поддерживает срезы в методах
            tasks.append(METHODS[method](data=list(prev[key]), **current_params))
            
        # Выполняем анализ всех параметров для текущей строки одновременно
        results = await asyncio.gather(*tasks)
        
        for j, key in enumerate(keys):
            is_anomaly = bool(results[j]) # Приводим к bool для безопасности JSON
            data[i][key] = [record[key], is_anomaly]
            
            # Если обнаружена аномалия, увеличиваем счетчик
            if is_anomaly:
                total_anomalies += 1
                
        data[i]["время"] = time

    # Возвращаем данные и агрегированную информацию
    return {
        "total_records": len(data),
        "total_anomalies": total_anomalies,
        "data": data
    }


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """WebSocket endpoint для обнаружения аномалий в реальном времени."""
    await ws.accept()
    
    # Инициализация состояния анализа
    analysis_state = AnalysisState(default_window_size=DEFAULT_WINDOWS_SIZE)
    
    try:
        parsed_data = app.state.default_data
        record_index = 0

        while True:
            try:
                # Проверка новых сообщений от клиента (неблокирующая)
                message_data = await asyncio.wait_for(ws.receive_text(), timeout=0.01)
                await handle_websocket_message(message_data, analysis_state)

            except asyncio.TimeoutError:
                # Нет новых сообщений, продолжаем отправку данных
                pass
            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"[WebSocket] Ошибка при получении сообщения: {e}")
                break

            # Обработка текущей записи данных
            if record_index < len(parsed_data):
                record = parsed_data[record_index]
                data = {}

                for key, value in record.items():
                    if key.lower() == "время":
                        data[key] = value
                        continue

                    # Добавляем значение в буфер
                    analysis_state.data_buffers[key].append(value)

                    # Применяем метод анализа
                    if len(analysis_state.data_buffers[key]) >= 2:
                        # Для AMMAD метода передаем имя параметра
                        method_params = analysis_state.get_method_params()
                        if analysis_state.method == "ammad":
                            method_params["param_name"] = key
                            
                        is_anomaly = await apply_analysis_method(
                            key,
                            analysis_state.data_buffers[key],
                            analysis_state.method,
                            method_params
                        )
                        data[key] = [value, is_anomaly]
                    else:
                        data[key] = [value, False]

                try:
                    await ws.send_json({"data": data})
                    record_index += 1
                    await asyncio.sleep(random.uniform(1, 3))
                except WebSocketDisconnect:
                    break
                except Exception as e:
                    print(f"[WebSocket] Ошибка отправки данных: {e}")
                    break
            else:
                # Достигнут конец данных, начинаем заново
                record_index = 0
                analysis_state.data_buffers.clear()

    except Exception as e:
        print(f"[WebSocket] Ошибка соединения: {e}")
    finally:
        print("[WebSocket] Соединение закрыто")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP ---
    print("[DB] Подключение к базе и создание таблиц...")
    async with engine.begin() as conn:
        # Важно: здесь должны быть импортированы все модели!
        # from app.models import MyModel 
        await conn.run_sync(Base.metadata.create_all)
    print("[DB] Таблицы проверены/созданы")

    # Загрузка дефолтных данных
    try:
        raw_data = await parse_data() # Убедись, что путь к файлу внутри верный
        app.state.default_data = filter_required_parameters(raw_data) if raw_data else []
        print(f"[StartUp] Загружено {len(app.state.default_data)} записей")
    except Exception as e:
        print(f"[StartUp] Ошибка загрузки данных: {e}")
        app.state.default_data = []

    yield  # Здесь приложение работает

    # --- SHUTDOWN ---
    print("[Shutdown] Закрытие соединений...")
    await engine.dispose()
    


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
app.include_router(entities_router, prefix="/api/v1")
