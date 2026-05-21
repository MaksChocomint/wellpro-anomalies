import asyncio
import random
import sys
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import APIRouter, FastAPI, File, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api import router as entities_router
from app.db import engine
from app.methods import (
    AMMAD_WINDOW_SIZE,
    FFT_WINDOW_SIZE,
    LOF_WINDOW_SIZE,
    METHODS,
    Z_SCORE_WINDOW_SIZE,
    reset_ammad_detectors,
)
from app.models import *  # noqa: F401,F403 - register models
from app.models.base import Base
from app.utils.analysis_utils import AnalysisState, apply_analysis_method, handle_websocket_message
from app.utils.data_utils import filter_required_parameters, parse_data
from app.utils.rig_data_utils import resolve_rig_file_paths, summarize_bindings

DEFAULT_FILENAME = "data/default.TXT"
DEFAULT_FILE_PATH = (Path(__file__).resolve().parent / "data" / "default.TXT").resolve()
DEFAULT_WINDOWS_SIZE = max(FFT_WINDOW_SIZE, LOF_WINDOW_SIZE, Z_SCORE_WINDOW_SIZE)
DEFAULT_REALTIME_WINDOW_SIZE = AMMAD_WINDOW_SIZE
router = APIRouter()


def _to_float(value: Any) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:  # NaN
        return None
    return number


def _build_row_context(current_row: dict, previous_row: Optional[dict]) -> dict:
    depth_current = _to_float(current_row.get("глубина"))
    depth_prev = _to_float(previous_row.get("глубина")) if previous_row else None
    depth_delta = (
        depth_current - depth_prev
        if depth_current is not None and depth_prev is not None
        else None
    )
    return {
        "current_row": current_row,
        "previous_row": previous_row,
        "depth_current": depth_current,
        "depth_prev": depth_prev,
        "depth_delta": depth_delta,
    }


@router.get("/health")
async def health_check():
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        return {"status": result.scalar()}


@router.get("/realtime/file-bindings")
async def realtime_file_bindings():
    """Показывает привязку локальных TXT-файлов к кусту/скважине."""
    return summarize_bindings()


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
            status_code=400,
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
            status_code=400,
        )

    parsed_data = filter_required_parameters(parsed_data)
    detector_scope = None
    if method == "ammad":
        detector_scope = f"file:{id(parsed_data)}"
        method_params["detector_scope"] = detector_scope
        reset_ammad_detectors(detector_scope)

    data = [{} for _ in range(len(parsed_data))]
    deque_length = (window_size if window_size and window_size >= 0 else DEFAULT_WINDOWS_SIZE) + 1
    prev = defaultdict(lambda: deque(maxlen=deque_length))

    total_anomalies = 0

    for i, record in enumerate(parsed_data):
        tasks = []
        previous_row = parsed_data[i - 1] if i > 0 else None
        row_context = _build_row_context(record, previous_row)
        time = record.get("время")
        keys = [key for key in record.keys() if key != "время"]

        for key in keys:
            value = record[key]
            prev[key].append(value)

            current_params = method_params.copy()
            if method == "ammad":
                current_params["param_name"] = key
                current_params["context"] = row_context

            tasks.append(METHODS[method](data=list(prev[key]), **current_params))

        results = await asyncio.gather(*tasks)

        for j, key in enumerate(keys):
            is_anomaly = bool(results[j])
            data[i][key] = [record[key], is_anomaly]

            if is_anomaly:
                total_anomalies += 1

        data[i]["время"] = time

    if detector_scope:
        reset_ammad_detectors(detector_scope)

    return {
        "total_records": len(data),
        "total_anomalies": total_anomalies,
        "data": data,
    }


async def _load_next_valid_dataset(
    file_paths: list[Path],
    start_index: int,
    fallback_data: list[dict],
) -> tuple[list[dict], int, str]:
    if not file_paths:
        return fallback_data, 0, DEFAULT_FILE_PATH.name

    current_index = start_index % len(file_paths)
    checked = 0

    while checked < len(file_paths):
        source_path = file_paths[current_index]
        raw_data = await parse_data(filename=str(source_path))

        if raw_data:
            filtered = filter_required_parameters(raw_data)
            if filtered:
                return filtered, current_index, source_path.name

        print(f"[WebSocket] Пропуск пустого/некорректного файла: {source_path}")
        current_index = (current_index + 1) % len(file_paths)
        checked += 1

    return fallback_data, 0, DEFAULT_FILE_PATH.name


@router.websocket("/ws")
async def websocket_endpoint(
    ws: WebSocket,
    cluster_number: int | None = Query(None),
    well_name: str | None = Query(None),
):
    """WebSocket endpoint для обнаружения аномалий в реальном времени."""
    await ws.accept()

    analysis_state = AnalysisState(default_window_size=DEFAULT_REALTIME_WINDOW_SIZE)

    try:
        fallback_data = app.state.default_data
        rig_file_paths = resolve_rig_file_paths(cluster_number, well_name)
        current_file_index = 0
        parsed_data, current_file_index, current_file_name = await _load_next_valid_dataset(
            rig_file_paths,
            current_file_index,
            fallback_data,
        )
        record_index = 0

        if rig_file_paths:
            print(
                f"[WebSocket] Подключение для cluster={cluster_number}, well={well_name}. "
                f"Назначено файлов: {len(rig_file_paths)}. Стартовый файл: {current_file_name}"
            )
        else:
            print(
                f"[WebSocket] Для cluster={cluster_number}, well={well_name} привязок нет. "
                f"Используется {DEFAULT_FILE_PATH.name}"
            )

        while True:
            try:
                message_data = await asyncio.wait_for(ws.receive_text(), timeout=0.01)
                await handle_websocket_message(message_data, analysis_state)
            except asyncio.TimeoutError:
                pass
            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"[WebSocket] Ошибка при получении сообщения: {e}")
                break

            if record_index < len(parsed_data):
                record = parsed_data[record_index]
                previous_row = parsed_data[record_index - 1] if record_index > 0 else None
                row_context = _build_row_context(record, previous_row)
                data = {}

                for key, value in record.items():
                    if key.lower() == "время":
                        data[key] = value
                        continue

                    analysis_state.data_buffers[key].append(value)

                    if len(analysis_state.data_buffers[key]) >= 2:
                        method_params = analysis_state.get_method_params()
                        if analysis_state.method == "ammad":
                            method_params["param_name"] = key
                            method_params["context"] = row_context

                        is_anomaly = await apply_analysis_method(
                            key,
                            analysis_state.data_buffers[key],
                            analysis_state.method,
                            method_params,
                        )
                        data[key] = [value, is_anomaly]
                    else:
                        data[key] = [value, False]

                try:
                    await ws.send_json({"data": data, "source_file": current_file_name})
                    record_index += 1
                    await asyncio.sleep(random.uniform(1, 3))
                except WebSocketDisconnect:
                    break
                except Exception as e:
                    print(f"[WebSocket] Ошибка отправки данных: {e}")
                    break
            else:
                if rig_file_paths:
                    current_file_index += 1
                    parsed_data, current_file_index, current_file_name = await _load_next_valid_dataset(
                        rig_file_paths,
                        current_file_index,
                        fallback_data,
                    )
                else:
                    parsed_data = fallback_data
                    current_file_name = DEFAULT_FILE_PATH.name

                record_index = 0
                analysis_state.reset_stream_state()

    except Exception as e:
        print(f"[WebSocket] Ошибка соединения: {e}")
    finally:
        print("[WebSocket] Соединение закрыто")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[DB] Подключение к базе и создание таблиц...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[DB] Таблицы проверены/созданы")

    try:
        raw_data = await parse_data()
        app.state.default_data = filter_required_parameters(raw_data) if raw_data else []
        print(f"[StartUp] Загружено {len(app.state.default_data)} записей")

        rig_bindings = summarize_bindings()
        print(
            f"[StartUp] Привязано TXT-файлов к буровым: {rig_bindings['files_count']} "
            f"(буровых: {rig_bindings['rigs_count']})"
        )
    except Exception as e:
        print(f"[StartUp] Ошибка загрузки данных: {e}")
        app.state.default_data = []

    yield

    print("[Shutdown] Закрытие соединений...")
    await engine.dispose()


app = FastAPI(lifespan=lifespan)

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
