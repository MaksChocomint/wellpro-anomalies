"""
Build 15-file benchmark tables for FFT / AMMAD / Z-score / LOF.

What this script does:
1) Finds all TXT files in app/data/rig_files and keeps 15 unique files by content hash.
2) Picks method params (window + threshold) from a small tuning grid on sampled data.
3) Runs full anomaly pass on each file and creates:
   - 15 per-file tables: method, parameter, anomalies_count, percent_of_parameter_points
   - summary table across methods
   - markdown report with 15 tables and model comparison notes
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import re
import sys
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))

from app.methods import METHODS, _ammad_detectors  # noqa: E402
from app.utils.data_utils import REQUIRED_PARAMETERS, filter_required_parameters, parse_data  # noqa: E402

METHOD_ORDER = ("z_score", "lof", "fft", "ammad")

# Candidate (window, threshold) pairs for quick tuning.
METHOD_CANDIDATES: Dict[str, List[Tuple[int, float]]] = {
    "z_score": [(24, 3.0), (32, 3.2), (48, 3.5)],
    "lof": [(40, 18.0), (60, 22.0), (80, 25.0)],
    "fft": [(48, 0.26), (64, 0.30), (96, 0.34)],
    "ammad": [(24, 0.72), (32, 0.75), (48, 0.80)],
}

# Target anomaly rates for unsupervised tuning heuristic (% of evaluated points).
TARGET_RATE_BY_METHOD = {
    "z_score": 1.5,
    "lof": 1.0,
    "fft": 0.6,
    "ammad": 0.4,
}


@dataclass
class FileData:
    path: Path
    rel_path: str
    hash_md5: str
    rows: List[Dict[str, Any]]
    active_params: List[str]


def _timestamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def _is_valid_number(value: Any) -> bool:
    if value is None or isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return math.isfinite(float(value))
    return False


def _to_float(value: Any) -> float | None:
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


def _sample_rows(rows: List[Dict[str, Any]], max_points: int) -> List[Dict[str, Any]]:
    if len(rows) <= max_points:
        return rows
    step = max(1, len(rows) // max_points)
    sampled = rows[::step]
    return sampled[:max_points]


def _downsample_rows(rows: List[Dict[str, Any]], max_rows_per_file: int | None) -> List[Dict[str, Any]]:
    if max_rows_per_file is None or max_rows_per_file <= 0 or len(rows) <= max_rows_per_file:
        return rows
    return _sample_rows(rows, max_rows_per_file)


def _slug(text: str) -> str:
    text = text.replace("\\", "_").replace("/", "_")
    text = re.sub(r"\s+", "_", text)
    text = re.sub(r"[^0-9A-Za-zА-Яа-я._-]", "_", text)
    return text[:120]


async def _collect_unique_files(
    input_root: Path,
    limit_unique: int = 15,
    max_rows_per_file: int | None = None,
) -> List[FileData]:
    txt_files = sorted(
        [p for p in input_root.rglob("*") if p.is_file() and p.suffix.lower() == ".txt"],
        key=lambda p: str(p).lower(),
    )

    unique: List[FileData] = []
    seen_hashes: set[str] = set()

    for path in txt_files:
        file_hash = hashlib.md5(path.read_bytes()).hexdigest()
        if file_hash in seen_hashes:
            continue

        raw = await parse_data(filename=str(path.resolve()))
        if raw is None:
            continue

        filtered = filter_required_parameters(raw)
        filtered = _downsample_rows(filtered, max_rows_per_file=max_rows_per_file)
        if not filtered:
            continue

        active = sorted(
            [param for param in REQUIRED_PARAMETERS if any(param in row for row in filtered)]
        )

        unique.append(
            FileData(
                path=path.resolve(),
                rel_path=str(path.resolve().relative_to(input_root.resolve().parent)),
                hash_md5=file_hash,
                rows=filtered,
                active_params=active,
            )
        )
        seen_hashes.add(file_hash)
        if len(unique) >= limit_unique:
            break

    return unique


async def _run_single_method(
    rows: List[Dict[str, Any]],
    params: Iterable[str],
    method_name: str,
    window_size: int,
    score_threshold: float,
) -> Dict[str, Dict[str, int]]:
    if method_name == "ammad":
        _ammad_detectors.clear()

    buffers: Dict[str, deque] = defaultdict(lambda: deque(maxlen=window_size + 1))
    result: Dict[str, Dict[str, int]] = {
        param: {"anomalies": 0, "evaluated": 0} for param in params
    }

    method_fn = METHODS[method_name]
    params_list = list(params)

    for i, row in enumerate(rows):
        previous_row = rows[i - 1] if i > 0 else None
        row_context = _build_row_context(row, previous_row)

        for param in params_list:
            value = row.get(param)
            if not _is_valid_number(value):
                continue

            buffers[param].append(float(value))
            kwargs: Dict[str, Any] = {
                "window_size": window_size,
                "score_threshold": score_threshold,
            }
            if method_name == "ammad":
                kwargs["param_name"] = param
                kwargs["context"] = row_context

            is_anomaly = bool(await method_fn(data=list(buffers[param]), **kwargs))
            result[param]["evaluated"] += 1
            if is_anomaly:
                result[param]["anomalies"] += 1

    return result


def _score_candidate(
    method_name: str,
    file_rates: List[float],
    files_with_anomaly: int,
    total_files: int,
) -> float:
    if not file_rates:
        return 10_000.0

    overall_rate = sum(file_rates) / len(file_rates)
    target = TARGET_RATE_BY_METHOD[method_name]
    std = pd.Series(file_rates).std(ddof=0) if len(file_rates) > 1 else 0.0
    coverage = files_with_anomaly / max(total_files, 1)

    score = abs(overall_rate - target) + (0.3 * float(std))
    if overall_rate < 0.05:
        score += 4.0
    if overall_rate > 12.0:
        score += 4.0
    if coverage < 0.6:
        score += (0.6 - coverage) * 5.0

    return float(score)


async def _tune_method_params(files: List[FileData], sample_rows_per_file: int) -> Dict[str, Dict[str, float]]:
    selected: Dict[str, Dict[str, float]] = {}

    for method_name in METHOD_ORDER:
        best_score = float("inf")
        best_pair = METHOD_CANDIDATES[method_name][0]
        tuning_log: List[Dict[str, Any]] = []

        for window_size, score_threshold in METHOD_CANDIDATES[method_name]:
            file_rates: List[float] = []
            files_with_anomaly = 0

            for file_data in files:
                sampled_rows = _sample_rows(file_data.rows, sample_rows_per_file)
                stats = await _run_single_method(
                    rows=sampled_rows,
                    params=file_data.active_params,
                    method_name=method_name,
                    window_size=window_size,
                    score_threshold=score_threshold,
                )

                anomalies = sum(item["anomalies"] for item in stats.values())
                evaluated = sum(item["evaluated"] for item in stats.values())
                rate = (anomalies / evaluated * 100.0) if evaluated > 0 else 0.0
                file_rates.append(rate)
                if anomalies > 0:
                    files_with_anomaly += 1

            score = _score_candidate(method_name, file_rates, files_with_anomaly, len(files))
            tuning_log.append(
                {
                    "window_size": window_size,
                    "score_threshold": score_threshold,
                    "score": score,
                    "mean_rate": float(sum(file_rates) / max(len(file_rates), 1)),
                    "files_with_anomaly": files_with_anomaly,
                }
            )

            if score < best_score:
                best_score = score
                best_pair = (window_size, score_threshold)

        selected[method_name] = {
            "window_size": float(best_pair[0]),
            "score_threshold": float(best_pair[1]),
            "tuning_score": float(best_score),
            "candidates": tuning_log,
        }

    return selected


def _table_to_markdown(rows: List[Dict[str, Any]], headers: List[str]) -> str:
    if not rows:
        return "| " + " | ".join(headers) + " |\n|" + "|".join(["---"] * len(headers)) + "|\n"
    lines = []
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("| " + " | ".join(["---"] * len(headers)) + " |")
    for row in rows:
        lines.append("| " + " | ".join(str(row.get(h, "")) for h in headers) + " |")
    return "\n".join(lines)


async def run_benchmark(
    input_root: Path,
    out_root: Path,
    sample_rows_per_file: int,
    max_rows_per_file: int | None,
) -> Dict[str, Any]:
    files = await _collect_unique_files(
        input_root=input_root,
        limit_unique=15,
        max_rows_per_file=max_rows_per_file,
    )
    if len(files) < 15:
        raise RuntimeError(f"Найдено только {len(files)} уникальных файлов, требуется 15.")

    selected_params = await _tune_method_params(files, sample_rows_per_file=sample_rows_per_file)

    per_file_tables: Dict[str, List[Dict[str, Any]]] = {}
    per_file_method_totals: List[Dict[str, Any]] = []
    summary_method_totals: Dict[str, Dict[str, int]] = {
        method: {"anomalies": 0, "evaluated": 0} for method in METHOD_ORDER
    }
    summary_method_parameter_totals: Dict[Tuple[str, str], Dict[str, int]] = defaultdict(
        lambda: {"anomalies": 0, "evaluated": 0}
    )

    for idx, file_data in enumerate(files, start=1):
        rows_for_file: List[Dict[str, Any]] = []
        method_param_stats_by_name: Dict[str, Dict[str, Dict[str, int]]] = {}

        for method_name in METHOD_ORDER:
            window_size = int(selected_params[method_name]["window_size"])
            threshold = float(selected_params[method_name]["score_threshold"])
            stats = await _run_single_method(
                rows=file_data.rows,
                params=file_data.active_params,
                method_name=method_name,
                window_size=window_size,
                score_threshold=threshold,
            )
            method_param_stats_by_name[method_name] = stats

            anomalies_total = sum(item["anomalies"] for item in stats.values())
            evaluated_total = sum(item["evaluated"] for item in stats.values())
            summary_method_totals[method_name]["anomalies"] += anomalies_total
            summary_method_totals[method_name]["evaluated"] += evaluated_total

            per_file_method_totals.append(
                {
                    "file_index": idx,
                    "file": str(file_data.path),
                    "method": method_name,
                    "window_size": window_size,
                    "score_threshold": threshold,
                    "anomalies_total": anomalies_total,
                    "evaluated_total": evaluated_total,
                    "percent_total": round((anomalies_total / evaluated_total * 100.0), 4)
                    if evaluated_total > 0
                    else 0.0,
                }
            )

        for method_name in METHOD_ORDER:
            for param in file_data.active_params:
                anomalies = method_param_stats_by_name[method_name][param]["anomalies"]
                evaluated = method_param_stats_by_name[method_name][param]["evaluated"]
                key = (method_name, param)
                summary_method_parameter_totals[key]["anomalies"] += int(anomalies)
                summary_method_parameter_totals[key]["evaluated"] += int(evaluated)
                percent = (anomalies / evaluated * 100.0) if evaluated > 0 else 0.0
                rows_for_file.append(
                    {
                        "method": method_name,
                        "parameter": param,
                        "anomalies_count": anomalies,
                        "percent_of_parameter_points": round(percent, 4),
                    }
                )

        per_file_tables[str(file_data.path)] = rows_for_file

    out_root.mkdir(parents=True, exist_ok=True)

    selected_params_path = out_root / "selected_params.json"
    selected_params_path.write_text(
        json.dumps(
            {
                "generated_at": datetime.now().isoformat(timespec="seconds"),
                "sample_rows_per_file": sample_rows_per_file,
                "selected_params": {
                    m: {
                        "window_size": int(selected_params[m]["window_size"]),
                        "score_threshold": selected_params[m]["score_threshold"],
                    }
                    for m in METHOD_ORDER
                },
                "tuning_details": selected_params,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    file_paths = list(per_file_tables.keys())
    for idx, path in enumerate(file_paths, start=1):
        df = pd.DataFrame(per_file_tables[path]).sort_values(["method", "parameter"])
        csv_path = out_root / f"table_{idx:02d}_{_slug(Path(path).name)}.csv"
        df.to_csv(csv_path, index=False, encoding="utf-8-sig")

    summary_rows: List[Dict[str, Any]] = []
    for method_name in METHOD_ORDER:
        anomalies = summary_method_totals[method_name]["anomalies"]
        evaluated = summary_method_totals[method_name]["evaluated"]
        summary_rows.append(
            {
                "method": method_name,
                "window_size": int(selected_params[method_name]["window_size"]),
                "score_threshold": float(selected_params[method_name]["score_threshold"]),
                "anomalies_total": anomalies,
                "evaluated_total": evaluated,
                "percent_total": round((anomalies / evaluated * 100.0), 4) if evaluated > 0 else 0.0,
            }
        )

    summary_df = pd.DataFrame(summary_rows).sort_values("anomalies_total", ascending=False)
    summary_csv = out_root / "summary_method_totals.csv"
    summary_df.to_csv(summary_csv, index=False, encoding="utf-8-sig")

    method_parameter_rows: List[Dict[str, Any]] = []
    for method_name in METHOD_ORDER:
        method_params = sorted(
            [item for item in summary_method_parameter_totals.items() if item[0][0] == method_name],
            key=lambda pair: pair[1]["anomalies"],
            reverse=True,
        )
        for (m_name, param_name), values in method_params:
            evaluated = values["evaluated"]
            anomalies = values["anomalies"]
            method_parameter_rows.append(
                {
                    "method": m_name,
                    "parameter": param_name,
                    "anomalies_total": anomalies,
                    "evaluated_total": evaluated,
                    "percent_of_parameter_points": round((anomalies / evaluated * 100.0), 4)
                    if evaluated > 0
                    else 0.0,
                }
            )

    method_parameter_df = pd.DataFrame(method_parameter_rows)
    method_parameter_csv = out_root / "summary_method_parameter_totals.csv"
    method_parameter_df.to_csv(method_parameter_csv, index=False, encoding="utf-8-sig")

    method_parameter_pivot = method_parameter_df.pivot_table(
        index="parameter",
        columns="method",
        values="anomalies_total",
        aggfunc="sum",
        fill_value=0,
    )
    method_parameter_pivot_csv = out_root / "summary_method_parameter_totals_pivot.csv"
    method_parameter_pivot.to_csv(method_parameter_pivot_csv, encoding="utf-8-sig")

    per_file_totals_df = pd.DataFrame(per_file_method_totals)
    per_file_totals_csv = out_root / "summary_per_file_method_totals.csv"
    per_file_totals_df.to_csv(per_file_totals_csv, index=False, encoding="utf-8-sig")

    # Build markdown report with 15 tables + summary + notes.
    md_lines: List[str] = []
    md_lines.append("# Сравнение методов на 15 уникальных файлах\n")
    md_lines.append("## Параметры прогона\n")
    md_lines.append(
        f"- Файлов: {len(files)}"
    )
    md_lines.append(
        f"- Режим по строкам: {'полный файл' if not max_rows_per_file or max_rows_per_file <= 0 else f'равномерная выборка до {max_rows_per_file} строк на файл'}"
    )
    md_lines.append(
        f"- Размер выборки для подбора параметров: до {sample_rows_per_file} строк на файл\n"
    )
    md_lines.append("## Подобранные параметры\n")
    md_lines.append(
        _table_to_markdown(
            [
                {
                    "method": row["method"],
                    "window_size": row["window_size"],
                    "score_threshold": row["score_threshold"],
                }
                for row in summary_rows
            ],
            headers=["method", "window_size", "score_threshold"],
        )
    )
    md_lines.append("\n## Итоговое сравнение по числу выявленных аномалий\n")
    md_lines.append(
        _table_to_markdown(
            summary_df.to_dict(orient="records"),
            headers=["method", "window_size", "score_threshold", "anomalies_total", "evaluated_total", "percent_total"],
        )
    )
    md_lines.append("\n## Итог по параметрам и методам (сумма по 15 файлам)\n")
    md_lines.append(
        _table_to_markdown(
            method_parameter_df.to_dict(orient="records"),
            headers=[
                "method",
                "parameter",
                "anomalies_total",
                "evaluated_total",
                "percent_of_parameter_points",
            ],
        )
    )

    md_lines.append("\n## Таблицы по 15 файлам\n")
    for idx, file_data in enumerate(files, start=1):
        file_rows = sorted(
            per_file_tables[str(file_data.path)],
            key=lambda x: (x["method"], x["parameter"]),
        )
        md_lines.append(f"\n### Файл {idx}: `{file_data.path.name}`")
        md_lines.append(f"- Путь: `{file_data.path}`")
        md_lines.append(f"- Параметров в файле: {len(file_data.active_params)}")
        md_lines.append(
            _table_to_markdown(
                file_rows,
                headers=[
                    "method",
                    "parameter",
                    "anomalies_count",
                    "percent_of_parameter_points",
                ],
            )
        )

    # Notes: derive concise conclusions from measured totals.
    totals = {row["method"]: row["anomalies_total"] for row in summary_rows}
    sorted_methods = sorted(summary_rows, key=lambda x: x["anomalies_total"])
    best_method = sorted_methods[0]["method"]
    max_method = sorted_methods[-1]["method"]
    md_lines.append("\n## Выводы по тестам\n")
    md_lines.append(
        f"- Наименьшее суммарное число срабатываний: `{best_method}` ({totals[best_method]})."
    )
    md_lines.append(
        f"- Наибольшее суммарное число срабатываний: `{max_method}` ({totals[max_method]})."
    )
    md_lines.append("- `Z-score`: чувствителен к локальным резким отклонениям, но может переоценивать шум и переходные режимы.")
    md_lines.append("- `LOF`: хорошо ловит локальные нестандартные формы, но сильно зависит от окна и плотности точек.")
    md_lines.append("- `FFT`: эффективен для колебаний/периодики, слабее для медленных трендов и единичных скачков.")
    md_lines.append("- `AMMAD`: учитывает физические лимиты + контекст движения глубины + комбинированные сигналы, за счет чего обычно дает более инженерно-интерпретируемые срабатывания.")

    markdown_path = out_root / "benchmark_15_files_report.md"
    markdown_path.write_text("\n".join(md_lines), encoding="utf-8")

    return {
        "files_count": len(files),
        "files": [str(item.path) for item in files],
        "max_rows_per_file": max_rows_per_file,
        "sample_rows_per_file": sample_rows_per_file,
        "selected_params_path": str(selected_params_path),
        "summary_csv": str(summary_csv),
        "summary_method_parameter_csv": str(method_parameter_csv),
        "summary_method_parameter_pivot_csv": str(method_parameter_pivot_csv),
        "summary_per_file_csv": str(per_file_totals_csv),
        "markdown_report": str(markdown_path),
        "output_dir": str(out_root),
    }


async def _main_async(args: argparse.Namespace) -> None:
    ts = _timestamp()
    out_dir = args.out_dir / f"method_benchmark_15files_{ts}"
    result = await run_benchmark(
        input_root=args.input_root,
        out_root=out_dir,
        sample_rows_per_file=args.sample_rows_per_file,
        max_rows_per_file=args.max_rows_per_file,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Сравнение FFT/AMMAD/Z-score/LOF по 15 уникальным файлам с генерацией таблиц."
    )
    parser.add_argument(
        "--input-root",
        type=Path,
        default=BACKEND_ROOT / "app" / "data" / "rig_files",
        help="Папка с TXT-файлами",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=BACKEND_ROOT / "analysis_results",
        help="Папка для результатов",
    )
    parser.add_argument(
        "--sample-rows-per-file",
        type=int,
        default=3000,
        help="Размер выборки на файл для этапа подбора параметров",
    )
    parser.add_argument(
        "--max-rows-per-file",
        type=int,
        default=12000,
        help="Максимум строк на файл в основном прогоне (0 = без ограничений)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    asyncio.run(_main_async(args))


if __name__ == "__main__":
    main()
