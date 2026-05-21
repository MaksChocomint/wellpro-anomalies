"""
Run one telemetry TXT file through all 4 anomaly methods and save summary stats.

Outputs:
- JSON summary (file-level + method-level + per-parameter)
- CSV table for quick comparison
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import math
import sys
from collections import defaultdict, deque
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))

from app.methods import (  # noqa: E402
    AMMAD_SCORE_THRESHOLD,
    AMMAD_WINDOW_SIZE,
    METHODS,
    FFT_SCORE_THRESHOLD,
    FFT_WINDOW_SIZE,
    LOF_SCORE_THRESHOLD,
    LOF_WINDOW_SIZE,
    Z_SCORE_THRESHOLD,
    Z_SCORE_WINDOW_SIZE,
    _ammad_detectors,
)
from app.utils.data_utils import (  # noqa: E402
    REQUIRED_PARAMETERS,
    filter_required_parameters,
    parse_data,
)


METHOD_ORDER = ("z_score", "lof", "fft", "ammad")
METHOD_DEFAULTS = {
    "z_score": {
        "window_size": Z_SCORE_WINDOW_SIZE,
        "score_threshold": Z_SCORE_THRESHOLD,
    },
    "lof": {
        "window_size": LOF_WINDOW_SIZE,
        "score_threshold": LOF_SCORE_THRESHOLD,
    },
    "fft": {
        "window_size": FFT_WINDOW_SIZE,
        "score_threshold": FFT_SCORE_THRESHOLD,
    },
    "ammad": {
        "window_size": AMMAD_WINDOW_SIZE,
        "score_threshold": AMMAD_SCORE_THRESHOLD,
    },
}


def _is_valid_number(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return math.isfinite(float(value))
    return False


def _to_float(value: Any) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _build_row_context(current_row: Dict[str, Any], previous_row: Dict[str, Any] | None) -> Dict[str, Any]:
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


def _percent(part: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return (part / total) * 100.0


def _timestamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


async def analyze_file_all_methods(
    file_path: Path,
    limit_rows: int | None = None,
) -> Dict[str, Any]:
    raw_data = await parse_data(filename=str(file_path))
    if raw_data is None:
        raise RuntimeError(
            "Не удалось распарсить файл. Убедитесь, что в файле есть столбец 'Время'."
        )

    data = filter_required_parameters(raw_data)
    if limit_rows is not None and limit_rows > 0:
        data = data[:limit_rows]
    if not data:
        raise RuntimeError("После фильтрации нет данных для анализа.")

    all_required_params = sorted(REQUIRED_PARAMETERS)
    active_params = [param for param in all_required_params if any(param in row for row in data)]
    total_rows = len(data)

    method_totals: Dict[str, Dict[str, int]] = {
        method: {"anomalies": 0, "evaluated": 0}
        for method in METHOD_ORDER
    }
    per_param_stats: Dict[str, Dict[str, Dict[str, int]]] = {
        param: {
            method: {"anomalies": 0, "evaluated": 0}
            for method in METHOD_ORDER
        }
        for param in active_params
    }

    # Analyze each method separately to avoid state bleed.
    for method_name in METHOD_ORDER:
        method_fn = METHODS[method_name]
        defaults = METHOD_DEFAULTS[method_name]
        window_size = defaults["window_size"]
        score_threshold = defaults["score_threshold"]

        if method_name == "ammad":
            _ammad_detectors.clear()

        buffers: Dict[str, deque] = defaultdict(
            lambda: deque(maxlen=window_size + 1)
        )

        for row_index, row in enumerate(data):
            previous_row = data[row_index - 1] if row_index > 0 else None
            row_context = _build_row_context(row, previous_row)

            for param in active_params:
                value = row.get(param)
                if not _is_valid_number(value):
                    continue

                numeric_value = float(value)
                buffers[param].append(numeric_value)

                kwargs: Dict[str, Any]
                if method_name == "ammad":
                    kwargs = {"param_name": param, "context": row_context}
                else:
                    kwargs = {
                        "window_size": window_size,
                        "score_threshold": score_threshold,
                    }

                is_anomaly = bool(await method_fn(data=list(buffers[param]), **kwargs))
                per_param_stats[param][method_name]["evaluated"] += 1
                method_totals[method_name]["evaluated"] += 1

                if is_anomaly:
                    per_param_stats[param][method_name]["anomalies"] += 1
                    method_totals[method_name]["anomalies"] += 1

    method_summary = []
    for method_name in METHOD_ORDER:
        anomalies = method_totals[method_name]["anomalies"]
        evaluated = method_totals[method_name]["evaluated"]
        method_summary.append(
            {
                "method": method_name,
                "anomalies_count": anomalies,
                "evaluated_points": evaluated,
                "percent_of_total_rows": round(_percent(anomalies, total_rows), 4),
                "percent_of_evaluated_points": round(_percent(anomalies, evaluated), 4),
            }
        )

    parameter_summary = []
    for param in active_params:
        param_row: Dict[str, Any] = {
            "parameter": param,
            "present_in_file": True,
        }

        total_param_anomalies = 0
        for method_name in METHOD_ORDER:
            anomalies = per_param_stats[param][method_name]["anomalies"]
            evaluated = per_param_stats[param][method_name]["evaluated"]
            total_param_anomalies += anomalies
            param_row[method_name] = {
                "anomalies_count": anomalies,
                "evaluated_points": evaluated,
                "percent_of_total_rows": round(_percent(anomalies, total_rows), 4),
                "percent_of_evaluated_points": round(_percent(anomalies, evaluated), 4),
            }

        param_row["total_anomalies_all_methods"] = total_param_anomalies
        parameter_summary.append(param_row)

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "file_path": str(file_path.resolve()),
        "total_rows": total_rows,
        "required_parameters_count": len(all_required_params),
        "available_parameters_count": len(active_params),
        "method_summary": method_summary,
        "parameter_summary": parameter_summary,
    }


def _build_csv_rows(summary: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    total_rows = summary["total_rows"]

    for param_item in summary["parameter_summary"]:
        param = param_item["parameter"]
        present = param_item["present_in_file"]
        for method_name in METHOD_ORDER:
            item = param_item[method_name]
            rows.append(
                {
                    "parameter": param,
                    "present_in_file": int(bool(present)),
                    "method": method_name,
                    "anomalies_count": item["anomalies_count"],
                    "evaluated_points": item["evaluated_points"],
                    "percent_of_total_rows": item["percent_of_total_rows"],
                    "percent_of_evaluated_points": item["percent_of_evaluated_points"],
                    "total_rows": total_rows,
                }
            )
    return rows


def save_summary(summary: Dict[str, Any], out_dir: Path, stem: str) -> Dict[str, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    suffix = _timestamp()
    json_path = out_dir / f"{stem}_methods_summary_{suffix}.json"
    csv_path = out_dir / f"{stem}_methods_summary_{suffix}.csv"

    json_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    csv_rows = _build_csv_rows(summary)
    if csv_rows:
        with csv_path.open("w", encoding="utf-8", newline="") as file_obj:
            writer = csv.DictWriter(file_obj, fieldnames=list(csv_rows[0].keys()))
            writer.writeheader()
            writer.writerows(csv_rows)

    return {"json": json_path, "csv": csv_path}


def print_short_report(summary: Dict[str, Any]) -> None:
    print("\n=== Сводка анализа файла ===")
    print(f"Файл: {summary['file_path']}")
    print(f"Всего строк: {summary['total_rows']}")
    print(f"Параметров (требуемых): {summary['required_parameters_count']}")
    print(f"Параметров (в файле): {summary['available_parameters_count']}")

    print("\n--- По методам ---")
    for item in summary["method_summary"]:
        print(
            f"{item['method']:>7} | "
            f"аномалий: {item['anomalies_count']:>6} | "
            f"% от строк: {item['percent_of_total_rows']:>7.3f} | "
            f"% от точек: {item['percent_of_evaluated_points']:>7.3f}"
        )

    print("\n--- По доступным параметрам (сумма по всем методам) ---")
    for item in summary["parameter_summary"]:
        print(
            f"{item['parameter']:<30} | "
            f"аномалий(все методы): {item['total_anomalies_all_methods']:>6}"
        )


async def _main_async(args: argparse.Namespace) -> None:
    file_path = args.file.resolve()
    if not file_path.exists():
        raise FileNotFoundError(f"Файл не найден: {file_path}")

    summary = await analyze_file_all_methods(file_path=file_path, limit_rows=args.limit)
    print_short_report(summary)

    out_dir = args.out_dir.resolve()
    stem = file_path.stem.replace(" ", "_")
    saved = save_summary(summary, out_dir=out_dir, stem=stem)
    print("\nСохранено:")
    print(f"- JSON: {saved['json']}")
    print(f"- CSV : {saved['csv']}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Прогоняет файл всеми 4 методами (z_score, lof, fft, ammad) "
            "и формирует итоговую статистику по доступным параметрам."
        )
    )
    parser.add_argument(
        "--file",
        type=Path,
        default=BACKEND_ROOT / "app" / "data" / "default.TXT",
        help="Путь к входному TXT-файлу",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=BACKEND_ROOT / "analysis_results",
        help="Папка для сохранения отчётов JSON/CSV",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Ограничение числа строк для прогона (для быстрого теста)",
    )
    args = parser.parse_args()
    asyncio.run(_main_async(args))


if __name__ == "__main__":
    main()
