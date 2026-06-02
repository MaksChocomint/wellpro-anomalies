"""
Generate a demo rig with real active-drilling fragments and early anomalies.

The generated files are placed into app/data/rig_files, so the regular
WebSocket stream can replay them when the matching cluster/well is selected.
Each trip copies an active interval from a real rig file and injects a
demonstration anomaly that starts within the first 50 rows.
"""

from __future__ import annotations

import asyncio
import math
import shutil
import sys
from collections import defaultdict, deque
from datetime import datetime
from io import StringIO
from pathlib import Path
from typing import Any

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))

from app.methods import (  # noqa: E402
    AMMAD_SCORE_THRESHOLD,
    AMMAD_WINDOW_SIZE,
    FFT_SCORE_THRESHOLD,
    FFT_WINDOW_SIZE,
    LOF_SCORE_THRESHOLD,
    LOF_WINDOW_SIZE,
    METHODS,
    Z_SCORE_THRESHOLD,
    Z_SCORE_WINDOW_SIZE,
    reset_ammad_detectors,
)

SOURCE_FILE = (
    BACKEND_ROOT
    / "app"
    / "data"
    / "rig_files"
    / "cluster_122_well_120"
    / "23-26.12.2014 рейс 15.txt"
)
RIG_FILES_ROOT = BACKEND_ROOT / "app" / "data" / "rig_files"
LEGACY_OUTPUT_DIR = RIG_FILES_ROOT / "cluster_9001_well_AMMAD-DEMO"
REPORT_DIR = BACKEND_ROOT / "analysis_results" / "demo_ammad_rig"

ROWS_PER_TRIP = 240
ACTIVE_MIN_POINTS = ROWS_PER_TRIP
EARLY_WINDOW_ROWS = 50

PARAMETERS = [
    "глубина",
    "скорость_бурения",
    "вес_на_крюке",
    "момент_ротора",
    "обороты_ротора",
    "давление_на_входе",
    "расход_на_входе",
    "температура_на_выходе",
    "уровень_в_емкости",
    "скорость_спо",
    "нагрузка",
    "дмк",
]
TIME_COLUMN = "время"

METHOD_CONFIGS = {
    "z_score": {"window_size": Z_SCORE_WINDOW_SIZE, "score_threshold": Z_SCORE_THRESHOLD},
    "lof": {"window_size": LOF_WINDOW_SIZE, "score_threshold": LOF_SCORE_THRESHOLD},
    "fft": {"window_size": FFT_WINDOW_SIZE, "score_threshold": FFT_SCORE_THRESHOLD},
    "ammad": {"window_size": AMMAD_WINDOW_SIZE, "score_threshold": AMMAD_SCORE_THRESHOLD},
}


def _read_text_with_fallback(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8", "utf-8-sig", "cp1251", "cp866"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("unknown", b"", 0, 0, f"cannot decode {path}")


def _load_source_frame(path: Path) -> pd.DataFrame:
    text = _read_text_with_fallback(path)
    lines = text.strip().splitlines()
    if len(lines) < 3:
        raise RuntimeError(f"Source file is too short: {path}")

    frame = pd.read_csv(
        StringIO("\n".join(lines[2:])),
        sep="\t",
        decimal=",",
        low_memory=False,
    )
    frame.columns = frame.columns.str.strip()
    return frame


def _column_map(frame: pd.DataFrame) -> dict[str, str]:
    return {str(column).strip().lower(): str(column).strip() for column in frame.columns}


def _numeric_series(frame: pd.DataFrame, col_map: dict[str, str], name: str) -> pd.Series:
    return pd.to_numeric(frame[col_map[name]], errors="coerce")


def _find_active_slice(frame: pd.DataFrame) -> tuple[int, int]:
    col_map = _column_map(frame)
    missing = [name for name in (TIME_COLUMN, *PARAMETERS) if name not in col_map]
    if missing:
        raise RuntimeError(f"Source file misses required columns: {missing}")

    depth = _numeric_series(frame, col_map, "глубина")
    time_values = _numeric_series(frame, col_map, "время")
    drilling_speed = _numeric_series(frame, col_map, "скорость_бурения").fillna(0.0)
    depth_delta = depth.diff().fillna(0.0)
    time_delta = time_values.diff().fillna(0.0)
    required_columns = [TIME_COLUMN, *PARAMETERS]
    numeric_required = pd.DataFrame(
        {
            name: _numeric_series(frame, col_map, name)
            for name in required_columns
        }
    )
    has_required_values = numeric_required.notna().all(axis=1)
    active = (
        has_required_values
        & (time_delta > 0.0)
        & ((drilling_speed > 0.05) | (depth_delta > 0.003))
    )

    best: tuple[int, int, int] | None = None
    start: int | None = None
    flags = active.to_numpy()
    for index, flag in enumerate(flags):
        if flag and start is None:
            start = index

        is_run_end = (not flag) or index == len(flags) - 1
        if is_run_end and start is not None:
            end = index if not flag else index + 1
            length = end - start
            if best is None or length > best[2]:
                best = (start, end, length)
            start = None

    if best is None or best[2] < ACTIVE_MIN_POINTS:
        raise RuntimeError("Cannot find a long enough active-drilling interval")

    return best[0], best[0] + ROWS_PER_TRIP


def _base_trip_frame(source: pd.DataFrame) -> pd.DataFrame:
    start, end = _find_active_slice(source)
    frame = source.iloc[start:end].copy().reset_index(drop=True)
    col_map = _column_map(frame)

    for name in PARAMETERS:
        frame[col_map[name]] = pd.to_numeric(frame[col_map[name]], errors="coerce").astype(float)

    time_values = pd.to_numeric(frame[col_map[TIME_COLUMN]], errors="coerce")
    if not bool((time_values.diff().iloc[1:] > 0.0).all()):
        raise RuntimeError("Selected base interval has non-monotonic time values")

    return frame


def _set_range(frame: pd.DataFrame, start: int, end: int, values: dict[str, float]) -> None:
    col_map = _column_map(frame)
    for name, value in values.items():
        frame.loc[start : end - 1, col_map[name]] = float(value)


def _set_alternating(
    frame: pd.DataFrame,
    start: int,
    end: int,
    values: dict[str, tuple[float, float]],
) -> None:
    col_map = _column_map(frame)
    for index in range(start, min(end, len(frame))):
        sign_index = (index - start) % 2
        for name, pair in values.items():
            frame.at[index, col_map[name]] = float(pair[sign_index])


def _make_physical_limits(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    _set_range(
        result,
        0,
        46,
        {
            "давление_на_входе": 340.0,
            "расход_на_входе": -2.0,
            "температура_на_выходе": -30.0,
            "уровень_в_емкости": 2.4,
            "вес_на_крюке": 105.0,
            "момент_ротора": 12.0,
            "обороты_ротора": 52.0,
            "нагрузка": 24.0,
            "скорость_бурения": 12.0,
            "скорость_спо": 2.4,
            "дмк": 235.0,
        },
    )
    return result


def _make_statistical_spikes(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    for start in (0, 18, 32):
        _set_range(
            result,
            start,
            start + 6,
            {
                "давление_на_входе": 315.0,
                "расход_на_входе": 16.4,
                "температура_на_выходе": 47.5,
                "уровень_в_емкости": 1.76,
                "вес_на_крюке": 88.0,
                "момент_ротора": 9.4,
                "обороты_ротора": 42.0,
                "нагрузка": 18.2,
                "скорость_бурения": 8.2,
                "скорость_спо": 1.8,
                "дмк": 216.0,
            },
        )
    return result


def _make_context_stuck_sensors(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    _set_range(
        result,
        0,
        50,
        {
            "скорость_бурения": 0.0,
            "дмк": 0.0,
            "нагрузка": 0.0,
            "обороты_ротора": 0.0,
            "момент_ротора": 0.0,
            "расход_на_входе": 0.0,
            "давление_на_входе": 0.0,
            "вес_на_крюке": 55.0,
        },
    )
    return result


def _make_fft_oscillations(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    _set_alternating(
        result,
        0,
        92,
        {
            "давление_на_входе": (150.0, 340.0),
            "расход_на_входе": (-2.0, 18.0),
            "момент_ротора": (-3.0, 12.0),
            "обороты_ротора": (0.0, 52.0),
            "нагрузка": (-4.0, 24.0),
            "вес_на_крюке": (20.0, 105.0),
            "дмк": (5.0, 235.0),
            "скорость_бурения": (0.4, 12.0),
        },
    )
    return result


def _make_mixed_all_types(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    _set_range(
        result,
        0,
        13,
        {
            "температура_на_выходе": -35.0,
            "уровень_в_емкости": 2.5,
            "скорость_спо": 2.3,
            "скорость_бурения": 12.0,
        },
    )
    _set_range(
        result,
        14,
        26,
        {
            "давление_на_входе": 315.0,
            "расход_на_входе": 16.3,
            "вес_на_крюке": 88.0,
        },
    )
    _set_range(
        result,
        22,
        50,
        {
            "скорость_бурения": 0.0,
            "дмк": 0.0,
            "нагрузка": 0.0,
        },
    )
    _set_alternating(
        result,
        32,
        96,
        {
            "момент_ротора": (-1.0, 8.8),
            "обороты_ротора": (12.0, 41.5),
            "вес_на_крюке": (32.0, 87.0),
        },
    )
    return result


PRESSURE_EVENT_PRIMARY = "давление_на_входе"
PRESSURE_EVENT_RELATED = [
    "расход_на_входе",
    "нагрузка",
    "вес_на_крюке",
    "скорость_бурения",
]
PRESSURE_RELAXATION_EVENTS = [
    {
        "start_row": 26,
        "profile": (0.0, 0.18, 0.41, 0.67, 0.87, 1.0, 0.91, 0.72, 0.46, 0.19, 0.0),
        "deltas": {
            "давление_на_входе": 8.4,
            "расход_на_входе": -0.42,
            "нагрузка": 0.52,
            "вес_на_крюке": 0.67,
            "скорость_бурения": -0.95,
        },
        "cause": "Кратковременное накопление шлама после разгона проходки.",
    },
    {
        "start_row": 74,
        "profile": (0.0, 0.11, 0.27, 0.46, 0.64, 0.82, 0.96, 1.0, 0.92, 0.76, 0.54, 0.29, 0.12, 0.0),
        "deltas": {
            "давление_на_входе": 9.7,
            "расход_на_входе": -0.58,
            "нагрузка": 0.71,
            "вес_на_крюке": 0.91,
            "скорость_бурения": -1.28,
        },
        "cause": "Частичное подпаковывание кольцевого пространства шламом.",
    },
    {
        "start_row": 121,
        "profile": (0.0, 0.16, 0.35, 0.58, 0.79, 0.95, 1.0, 0.89, 0.66, 0.39, 0.17, 0.0),
        "deltas": {
            "давление_на_входе": 7.9,
            "расход_на_входе": -0.37,
            "нагрузка": 0.48,
            "вес_на_крюке": 0.63,
            "скорость_бурения": -0.88,
        },
        "cause": "Локальное ухудшение очистки долота и рост гидросопротивления.",
    },
    {
        "start_row": 167,
        "profile": (0.0, 0.13, 0.31, 0.52, 0.74, 0.9, 1.0, 0.95, 0.81, 0.6, 0.36, 0.15, 0.0),
        "deltas": {
            "давление_на_входе": 10.6,
            "расход_на_входе": -0.63,
            "нагрузка": 0.79,
            "вес_на_крюке": 1.04,
            "скорость_бурения": -1.44,
        },
        "cause": "Повторное сужение циркуляции на фоне возросшей нагрузки на долото.",
    },
    {
        "start_row": 208,
        "profile": (0.0, 0.19, 0.43, 0.69, 0.9, 1.0, 0.86, 0.61, 0.34, 0.12, 0.0),
        "deltas": {
            "давление_на_входе": 8.8,
            "расход_на_входе": -0.47,
            "нагрузка": 0.57,
            "вес_на_крюке": 0.73,
            "скорость_бурения": -1.07,
        },
        "cause": "Короткий возврат к подпаковыванию перед восстановлением нормальной циркуляции.",
    },
]


def _apply_profile_offsets(
    frame: pd.DataFrame,
    start_row: int,
    profile: tuple[float, ...],
    deltas: dict[str, float],
) -> None:
    col_map = _column_map(frame)
    floors = {
        "расход_на_входе": 12.6,
        "нагрузка": 0.0,
        "вес_на_крюке": 0.0,
        "скорость_бурения": 0.05,
    }
    ceilings = {
        "давление_на_входе": 165.0,
    }

    for offset, weight in enumerate(profile):
        index = start_row + offset
        if index >= len(frame):
            break
        for name, delta in deltas.items():
            column = col_map[name]
            current = float(frame.at[index, column])
            updated = current + (delta * weight)
            if name in floors:
                updated = max(updated, floors[name])
            if name in ceilings:
                updated = min(updated, ceilings[name])
            frame.at[index, column] = updated


def _make_related_pressure_events(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    for event in PRESSURE_RELAXATION_EVENTS:
        _apply_profile_offsets(
            result,
            int(event["start_row"]),
            tuple(event["profile"]),
            dict(event["deltas"]),
        )
    return result


CASES = [
    {
        "cluster_number": 9101,
        "well_name": "AMMAD-01-PHYS",
        "rig_name": "WR-AMMAD-01-PHYS",
        "filename": "01_physical_limits_first50.txt",
        "title": "Физические пределы",
        "injected_rows": "0-45",
        "factory": _make_physical_limits,
    },
    {
        "cluster_number": 9102,
        "well_name": "AMMAD-02-SPIKES",
        "rig_name": "WR-AMMAD-02-SPIKES",
        "filename": "02_statistical_spikes_first50.txt",
        "title": "Статистические и рабочие выбросы",
        "injected_rows": "0-5, 18-23, 32-37",
        "factory": _make_statistical_spikes,
    },
    {
        "cluster_number": 9103,
        "well_name": "AMMAD-03-STUCK",
        "rig_name": "WR-AMMAD-03-STUCK",
        "filename": "03_context_stuck_sensors_first50.txt",
        "title": "Контекстное залипание каналов при росте глубины",
        "injected_rows": "0-49",
        "factory": _make_context_stuck_sensors,
    },
    {
        "cluster_number": 9104,
        "well_name": "AMMAD-04-OSC",
        "rig_name": "WR-AMMAD-04-OSC",
        "filename": "04_fft_oscillations_starts_first50.txt",
        "title": "Высокочастотные колебания",
        "injected_rows": "0-91",
        "factory": _make_fft_oscillations,
    },
    {
        "cluster_number": 9105,
        "well_name": "AMMAD-05-MIXED",
        "rig_name": "WR-AMMAD-05-MIXED",
        "filename": "05_mixed_all_types_first50.txt",
        "title": "Смешанный сценарий",
        "injected_rows": "0-95",
        "factory": _make_mixed_all_types,
    },
    {
        "cluster_number": 9106,
        "well_name": "AMMAD-06-REL-PRESS",
        "rig_name": "WR-AMMAD-06-REL-PRESS",
        "filename": "06_related_pressure_events.txt",
        "title": "Связанные импульсы давления",
        "injected_rows": "26-36, 74-87, 121-132, 167-179, 208-218",
        "factory": _make_related_pressure_events,
        "event_specs": PRESSURE_RELAXATION_EVENTS,
    },
]


def _format_number(value: Any) -> str:
    if value is None:
        return ""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if not math.isfinite(number):
        return ""
    text = f"{number:.12f}".rstrip("0").rstrip(".")
    return text.replace(".", ",")


def _write_trip_file(path: Path, frame: pd.DataFrame, title: str) -> None:
    lines = [
        f"Начало рейса - демо AMMAD: {title}",
        "Окончание рейса - активный участок реального рейса с внесенной аномалией",
        "",
        "\t".join(str(column) for column in frame.columns),
    ]
    for _, row in frame.iterrows():
        lines.append("\t".join(_format_number(row[column]) for column in frame.columns))

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def generate_files() -> dict[str, Path]:
    source = _load_source_frame(SOURCE_FILE)
    base_frame = _base_trip_frame(source)
    if LEGACY_OUTPUT_DIR.exists():
        if not LEGACY_OUTPUT_DIR.resolve().is_relative_to(RIG_FILES_ROOT.resolve()):
            raise RuntimeError(f"Refusing to remove unexpected path: {LEGACY_OUTPUT_DIR}")
        shutil.rmtree(LEGACY_OUTPUT_DIR)

    generated: dict[str, Path] = {}
    for case in CASES:
        frame = case["factory"](base_frame)
        output_dir = RIG_FILES_ROOT / f"cluster_{case['cluster_number']}_well_{case['well_name']}"
        output_dir.mkdir(parents=True, exist_ok=True)
        for old_file in output_dir.glob("*.txt"):
            old_file.unlink()
        path = output_dir / case["filename"]
        _write_trip_file(path, frame, case["title"])
        generated[case["filename"]] = path

    return generated


def _parse_generated_file(path: Path) -> list[dict[str, Any]]:
    frame = _load_source_frame(path)
    frame.columns = frame.columns.str.strip().str.lower()
    available = [TIME_COLUMN, *[param for param in PARAMETERS if param in frame.columns]]
    frame = frame[available].apply(pd.to_numeric, errors="coerce")
    return frame.to_dict(orient="records")


def _is_valid_number(value: Any) -> bool:
    if value is None or isinstance(value, bool):
        return False
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def _to_float(value: Any) -> float | None:
    return float(value) if _is_valid_number(value) else None


def _build_row_context(current_row: dict[str, Any], previous_row: dict[str, Any] | None) -> dict[str, Any]:
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


async def _run_method(rows: list[dict[str, Any]], method_name: str, file_name: str) -> dict[str, Any]:
    if method_name == "ammad":
        reset_ammad_detectors()

    config = METHOD_CONFIGS[method_name]
    window_size = int(config["window_size"])
    method = METHODS[method_name]
    buffers: dict[str, deque] = defaultdict(lambda: deque(maxlen=window_size + 1))
    by_param = {
        param: {"total": 0, "first_50": 0, "first_index": None}
        for param in PARAMETERS
    }

    for index, row in enumerate(rows):
        previous_row = rows[index - 1] if index > 0 else None
        row_context = _build_row_context(row, previous_row)

        for param in PARAMETERS:
            value = row.get(param)
            if not _is_valid_number(value):
                continue

            buffers[param].append(float(value))
            kwargs = dict(config)
            if method_name == "ammad":
                kwargs["param_name"] = param
                kwargs["context"] = row_context
                kwargs["detector_scope"] = f"demo-rig-{file_name}-{method_name}"

            is_anomaly = bool(await method(data=list(buffers[param]), **kwargs))
            if not is_anomaly:
                continue

            by_param[param]["total"] += 1
            if index < EARLY_WINDOW_ROWS:
                by_param[param]["first_50"] += 1
            if by_param[param]["first_index"] is None:
                by_param[param]["first_index"] = index

    if method_name == "ammad":
        reset_ammad_detectors()

    total = sum(item["total"] for item in by_param.values())
    first_50 = sum(item["first_50"] for item in by_param.values())
    first_indices = [
        item["first_index"]
        for item in by_param.values()
        if item["first_index"] is not None
    ]

    return {
        "total": total,
        "first_50": first_50,
        "first_index": min(first_indices) if first_indices else None,
        "by_param": by_param,
    }


async def analyze_files(generated: dict[str, Path]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    case_by_name = {case["filename"]: case for case in CASES}

    for file_name, path in generated.items():
        rows = _parse_generated_file(path)
        method_results = {}
        for method_name in METHOD_CONFIGS:
            method_results[method_name] = await _run_method(rows, method_name, file_name)
        results.append(
            {
                "file": path,
                "case": case_by_name[file_name],
                "rows": rows,
                "rows_count": len(rows),
                "method_results": method_results,
            }
        )

    return results


def _seconds_to_label(seconds: float) -> str:
    rounded = max(0, int(round(seconds)))
    hours, remainder = divmod(rounded, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def _signed(value: float) -> str:
    return f"{value:+.2f}"


def _event_report_rows(result: dict[str, Any]) -> list[dict[str, Any]]:
    case = result["case"]
    event_specs = case.get("event_specs", [])
    if not event_specs:
        return []

    rows = result["rows"]
    event_rows: list[dict[str, Any]] = []
    start_time = _to_float(rows[0].get(TIME_COLUMN))
    if start_time is None:
        return []

    for event_index, event in enumerate(event_specs, start=1):
        start_row = int(event["start_row"])
        end_row = min(start_row + len(tuple(event["profile"])) - 1, len(rows) - 1)
        signal_rows = rows[start_row : end_row + 1]
        if not signal_rows:
            continue

        raw_start = _to_float(rows[start_row].get(TIME_COLUMN))
        raw_end = _to_float(rows[end_row].get(TIME_COLUMN))
        if raw_start is None or raw_end is None:
            continue

        related = ", ".join(PRESSURE_EVENT_RELATED)
        sensor_pattern = (
            f"давление {_signed(float(event['deltas']['давление_на_входе']))} бар, "
            f"расход {_signed(float(event['deltas']['расход_на_входе']))} л/с, "
            f"нагрузка {_signed(float(event['deltas']['нагрузка']))} т, "
            f"вес на крюке {_signed(float(event['deltas']['вес_на_крюке']))} т, "
            f"скорость бурения {_signed(float(event['deltas']['скорость_бурения']))} м/ч "
            "относительно локального фона"
        )
        why_anomaly = (
            "Это не похоже на обычный шум датчика: давление растет не само по себе, "
            "а вместе с просадкой расхода и проходки. Такой согласованный рисунок "
            "указывает на кратковременный рост гидравлического сопротивления."
        )

        event_rows.append(
            {
                "file": result["file"].name,
                "scenario": case["title"],
                "cluster_number": case["cluster_number"],
                "well_name": case["well_name"],
                "rig_name": case["rig_name"],
                "event_number": event_index,
                "row_start": start_row,
                "row_end": end_row,
                "time_start": _seconds_to_label((raw_start - start_time) * 86400.0),
                "time_end": _seconds_to_label((raw_end - start_time) * 86400.0),
                "raw_time_start": raw_start,
                "raw_time_end": raw_end,
                "primary_parameter": PRESSURE_EVENT_PRIMARY,
                "related_parameters": related,
                "cause": event["cause"],
                "sensor_pattern": sensor_pattern,
                "why_anomaly": why_anomaly,
            }
        )

    return event_rows


def _write_reports(results: list[dict[str, Any]]) -> tuple[Path, Path, Path]:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    summary_path = REPORT_DIR / "method_comparison_summary.csv"
    details_path = REPORT_DIR / "method_parameter_details.csv"
    markdown_path = REPORT_DIR / "method_comparison_summary.md"
    event_csv_path = REPORT_DIR / "anomaly_event_timeline.csv"
    event_markdown_path = REPORT_DIR / "anomaly_event_timeline.md"

    summary_rows: list[dict[str, Any]] = []
    detail_rows: list[dict[str, Any]] = []
    event_rows: list[dict[str, Any]] = []

    for result in results:
        file_name = result["file"].name
        case = result["case"]
        row: dict[str, Any] = {
            "file": file_name,
            "scenario": case["title"],
            "cluster_number": case["cluster_number"],
            "well_name": case["well_name"],
            "rig_name": case["rig_name"],
            "injected_rows": case["injected_rows"],
            "rows_count": result["rows_count"],
        }
        for method_name, method_result in result["method_results"].items():
            row[f"{method_name}_total"] = method_result["total"]
            row[f"{method_name}_first_50"] = method_result["first_50"]
            row[f"{method_name}_first_index"] = method_result["first_index"]

            for param, counts in method_result["by_param"].items():
                if counts["total"] == 0:
                    continue
                detail_rows.append(
                    {
                        "file": file_name,
                        "scenario": case["title"],
                        "cluster_number": case["cluster_number"],
                        "well_name": case["well_name"],
                        "rig_name": case["rig_name"],
                        "method": method_name,
                        "parameter": param,
                        "total": counts["total"],
                        "first_50": counts["first_50"],
                        "first_index": counts["first_index"],
                    }
                )

        summary_rows.append(row)
        event_rows.extend(_event_report_rows(result))

    pd.DataFrame(summary_rows).to_csv(summary_path, index=False, encoding="utf-8-sig")
    pd.DataFrame(detail_rows).to_csv(details_path, index=False, encoding="utf-8-sig")
    pd.DataFrame(event_rows).to_csv(event_csv_path, index=False, encoding="utf-8-sig")

    lines = [
        "# Demo AMMAD Rig Method Comparison",
        "",
        f"Generated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"Source active section: `{SOURCE_FILE}`",
        f"Demo rig files root: `{RIG_FILES_ROOT}`",
        "",
        "| Cluster | Well | Rig | File | Scenario | Injected rows | Z-score | LOF | FFT | AMMAD | AMMAD first index |",
        "| ---: | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in summary_rows:
        lines.append(
            "| {cluster_number} | {well_name} | {rig_name} | {file} | {scenario} | {injected_rows} | {z_score_total} ({z_score_first_50}) | "
            "{lof_total} ({lof_first_50}) | {fft_total} ({fft_first_50}) | "
            "{ammad_total} ({ammad_first_50}) | {ammad_first_index} |".format(**row)
        )

    lines.extend(
        [
            "",
            "Values in parentheses are detections inside the first 50 rows.",
        ]
    )
    markdown_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    event_lines = [
        "# Demo AMMAD Event Timeline",
        "",
        "Ниже перечислены реалистичные импульсные аномалии для сценария со связанным давлением.",
        "В этом файле основной аномальный канал один: `давление_на_входе`, но его отклонение",
        "сопровождается согласованными изменениями `расход_на_входе`, `нагрузка`,",
        "`вес_на_крюке` и `скорость_бурения`, чтобы рисунок был похож на реальные телеметрические кейсы.",
        "",
        "| File | Event | Time start | Time end | Rows | Cause | Sensor pattern | Why this is anomalous |",
        "| --- | ---: | ---: | ---: | --- | --- | --- | --- |",
    ]
    for row in event_rows:
        event_lines.append(
            "| {file} | {event_number} | {time_start} | {time_end} | {row_start}-{row_end} | "
            "{cause} | {sensor_pattern} | {why_anomaly} |".format(**row)
        )
    event_markdown_path.write_text("\n".join(event_lines) + "\n", encoding="utf-8")
    return summary_path, details_path, event_markdown_path


async def main() -> None:
    generated = generate_files()
    results = await analyze_files(generated)
    summary_path, details_path, event_path = _write_reports(results)

    print(f"Demo rig files root: {RIG_FILES_ROOT}")
    print(f"Summary: {summary_path}")
    print(f"Details: {details_path}")
    print(f"Timeline: {event_path}")
    for result in results:
        totals = {
            method_name: method_result["total"]
            for method_name, method_result in result["method_results"].items()
        }
        first_50 = {
            method_name: method_result["first_50"]
            for method_name, method_result in result["method_results"].items()
        }
        print(result["file"].name, "totals", totals, "first_50", first_50)


if __name__ == "__main__":
    asyncio.run(main())
