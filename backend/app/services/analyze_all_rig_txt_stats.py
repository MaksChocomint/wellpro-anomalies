"""
Batch analysis of all rig TXT files for 12 key drilling parameters.

Outputs:
- per-file stats: mean/min/max/count by parameter
- global parameter windows: observed min/max + quantile windows + anomaly indicators
- context rules candidates: ready-to-use thresholds for contextual analysis
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from collections import defaultdict
from datetime import datetime
from io import StringIO
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))

from app.utils.data_utils import REQUIRED_PARAMETERS, filter_required_parameters, parse_data

DEFAULT_INPUT_ROOT = BACKEND_ROOT / "app" / "data" / "rig_files"
DEFAULT_OUTPUT_DIR = BACKEND_ROOT / "analysis_results"

PARAMETERS = sorted(REQUIRED_PARAMETERS)


def _max_run(mask: np.ndarray) -> int:
    if mask.size == 0:
        return 0
    max_len = 0
    current = 0
    for flag in mask:
        if flag:
            current += 1
            if current > max_len:
                max_len = current
        else:
            current = 0
    return int(max_len)


async def _read_file_rows(file_path: Path) -> List[Dict]:
    raw = await parse_data(filename=str(file_path.resolve()))
    if raw is not None:
        return filter_required_parameters(raw)

    # Fallback for non-UTF8 files (cp1251/cp866 etc.)
    raw_bytes = file_path.read_bytes()
    for encoding in ("utf-8", "utf-8-sig", "cp1251", "cp866", "latin1"):
        try:
            text = raw_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue

        lines = text.strip().split("\n")
        if len(lines) < 3:
            continue

        try:
            df = pd.read_csv(
                StringIO("\n".join(lines[2:])),
                sep="\t",
                header=0,
                decimal=",",
                dtype=float,
            )
        except Exception:
            continue

        df.columns = df.columns.str.lower().str.strip()
        if "время" not in df.columns:
            continue

        data = df.to_dict(orient="records")
        return filter_required_parameters(data)

    return []


async def analyze_all_files(input_root: Path) -> Dict[str, object]:
    txt_files = sorted(
        [p for p in input_root.rglob("*") if p.is_file() and p.suffix.lower() == ".txt"],
        key=lambda p: str(p).lower(),
    )

    per_file_rows: List[Dict[str, object]] = []
    file_meta_rows: List[Dict[str, object]] = []
    global_values: Dict[str, List[np.ndarray]] = defaultdict(list)
    global_deltas: Dict[str, List[np.ndarray]] = defaultdict(list)

    zero_run_global_max: Dict[str, int] = {param: 0 for param in PARAMETERS}
    flat_run_global_max: Dict[str, int] = {param: 0 for param in PARAMETERS}
    missing_files: List[str] = []
    files_by_hash: Dict[str, List[str]] = defaultdict(list)

    total_rows = 0
    total_duration_days = 0.0

    for file_path in txt_files:
        file_hash = hashlib.md5(file_path.read_bytes()).hexdigest()
        files_by_hash[file_hash].append(str(file_path.resolve()))
        rows = await _read_file_rows(file_path)
        if not rows:
            missing_files.append(str(file_path.resolve()))
            continue

        df = pd.DataFrame(rows)
        total_rows += len(df)

        duration_days = 0.0
        if "время" in df.columns:
            time_values = pd.to_numeric(df["время"], errors="coerce").dropna()
            if not time_values.empty:
                duration_days = float(time_values.max() - time_values.min())

        total_duration_days += duration_days
        file_meta_rows.append(
            {
                "file": str(file_path.resolve()),
                "file_hash": file_hash,
                "rows": int(len(df)),
                "duration_days": float(duration_days),
                "duration_hours": float(duration_days * 24.0),
                "available_parameters_count": int(
                    sum(1 for param in PARAMETERS if param in df.columns and pd.to_numeric(df[param], errors="coerce").notna().any())
                ),
            }
        )

        for param in PARAMETERS:
            if param not in df.columns:
                per_file_rows.append(
                    {
                        "file": str(file_path.resolve()),
                        "parameter": param,
                        "rows": len(df),
                        "count": 0,
                        "mean": np.nan,
                        "min": np.nan,
                        "max": np.nan,
                    }
                )
                continue

            series = pd.to_numeric(df[param], errors="coerce").dropna()
            arr = series.to_numpy(dtype=np.float64)
            if arr.size == 0:
                per_file_rows.append(
                    {
                        "file": str(file_path.resolve()),
                        "parameter": param,
                        "rows": len(df),
                        "count": 0,
                        "mean": np.nan,
                        "min": np.nan,
                        "max": np.nan,
                    }
                )
                continue

            per_file_rows.append(
                {
                    "file": str(file_path.resolve()),
                    "parameter": param,
                    "rows": len(df),
                    "count": int(arr.size),
                    "mean": float(np.mean(arr)),
                    "min": float(np.min(arr)),
                    "max": float(np.max(arr)),
                }
            )

            global_values[param].append(arr)

            if arr.size > 1:
                deltas = np.abs(np.diff(arr))
                global_deltas[param].append(deltas)

                # Flat run by tiny step (sensor "залип")
                near_const = np.isclose(np.diff(arr), 0.0, atol=1e-9)
                flat_run = _max_run(near_const) + (1 if near_const.size > 0 else 0)
                if flat_run > flat_run_global_max[param]:
                    flat_run_global_max[param] = flat_run

            zero_run = _max_run(arr == 0.0)
            if zero_run > zero_run_global_max[param]:
                zero_run_global_max[param] = zero_run

    global_rows: List[Dict[str, object]] = []
    rules_rows: List[Dict[str, object]] = []

    for param in PARAMETERS:
        arrays = global_values.get(param, [])
        if not arrays:
            global_rows.append({"parameter": param, "count": 0})
            continue

        values = np.concatenate(arrays)
        count = values.size

        q01, q05, q25, q50, q75, q95, q99 = np.quantile(
            values, [0.01, 0.05, 0.25, 0.50, 0.75, 0.95, 0.99]
        )
        iqr = q75 - q25
        low_fence = q25 - 3.0 * iqr
        high_fence = q75 + 3.0 * iqr

        zero_pct = float(np.mean(values == 0.0) * 100.0)
        neg_pct = float(np.mean(values < 0.0) * 100.0)
        fence_outlier_pct = float(
            np.mean((values < low_fence) | (values > high_fence)) * 100.0
        )

        deltas_arrays = global_deltas.get(param, [])
        if deltas_arrays:
            deltas = np.concatenate(deltas_arrays)
            d95, d99 = np.quantile(deltas, [0.95, 0.99])
            jump_spike_pct = float(np.mean(deltas > d99) * 100.0)
            delta_p99 = float(d99)
            delta_p95 = float(d95)
        else:
            jump_spike_pct = 0.0
            delta_p99 = 0.0
            delta_p95 = 0.0

        global_rows.append(
            {
                "parameter": param,
                "count": int(count),
                "mean": float(np.mean(values)),
                "std": float(np.std(values)),
                "observed_min": float(np.min(values)),
                "observed_max": float(np.max(values)),
                "q01": float(q01),
                "q05": float(q05),
                "q50": float(q50),
                "q95": float(q95),
                "q99": float(q99),
                "iqr": float(iqr),
                "soft_window_min": float(q05),
                "soft_window_max": float(q95),
                "hard_window_min": float(q01),
                "hard_window_max": float(q99),
                "tukey_low_fence": float(low_fence),
                "tukey_high_fence": float(high_fence),
                "zero_pct": zero_pct,
                "negative_pct": neg_pct,
                "fence_outlier_pct": fence_outlier_pct,
                "delta_p95": delta_p95,
                "delta_p99": delta_p99,
                "jump_spike_pct": jump_spike_pct,
                "max_zero_run": int(zero_run_global_max[param]),
                "max_flat_run": int(flat_run_global_max[param]),
            }
        )

        rule_flags: List[str] = []
        if zero_pct >= 10.0:
            rule_flags.append("много нулевых значений")
        if zero_run_global_max[param] >= 100:
            rule_flags.append("длинные нулевые плато")
        if flat_run_global_max[param] >= 100:
            rule_flags.append("длинные плато (залипание датчика)")
        if neg_pct > 0.0:
            rule_flags.append("есть отрицательные значения")
        if fence_outlier_pct >= 1.0:
            rule_flags.append("выраженные хвостовые выбросы")

        rules_rows.append(
            {
                "parameter": param,
                "context_soft_window": f"[{q05:.6g}; {q95:.6g}]",
                "context_hard_window": f"[{q01:.6g}; {q99:.6g}]",
                "critical_fence_window": f"[{low_fence:.6g}; {high_fence:.6g}]",
                "max_step_threshold": float(delta_p99),
                "flags": "; ".join(rule_flags) if rule_flags else "нет критичных паттернов",
            }
        )

    unique_meta_map: Dict[str, Dict[str, object]] = {}
    for item in file_meta_rows:
        file_hash = str(item["file_hash"])
        if file_hash not in unique_meta_map:
            unique_meta_map[file_hash] = item

    duplicate_groups = [group for group in files_by_hash.values() if len(group) > 1]
    unique_files_count = len(unique_meta_map)
    total_duration_days_unique = float(sum(float(item["duration_days"]) for item in unique_meta_map.values()))

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "input_root": str(input_root.resolve()),
        "files_total": len(txt_files),
        "files_parsed": len(txt_files) - len(missing_files),
        "files_unique_by_content": unique_files_count,
        "duplicate_groups": duplicate_groups,
        "rows_total": int(total_rows),
        "total_duration_days_all_files": float(total_duration_days),
        "total_duration_hours_all_files": float(total_duration_days * 24.0),
        "total_duration_days_unique_files": total_duration_days_unique,
        "total_duration_hours_unique_files": float(total_duration_days_unique * 24.0),
        "parameters": PARAMETERS,
        "missing_or_invalid_files": missing_files,
        "file_meta": file_meta_rows,
        "per_file_stats": per_file_rows,
        "global_parameter_stats": global_rows,
        "context_rules_candidates": rules_rows,
    }


def save_reports(report: Dict[str, object], out_dir: Path) -> Dict[str, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    json_path = out_dir / f"rig_files_12params_report_{ts}.json"
    per_file_csv = out_dir / f"rig_files_12params_per_file_{ts}.csv"
    file_meta_csv = out_dir / f"rig_files_file_meta_{ts}.csv"
    global_csv = out_dir / f"rig_files_12params_global_{ts}.csv"
    rules_csv = out_dir / f"rig_files_12params_context_rules_{ts}.csv"

    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    pd.DataFrame(report["file_meta"]).to_csv(file_meta_csv, index=False, encoding="utf-8-sig")
    pd.DataFrame(report["per_file_stats"]).to_csv(per_file_csv, index=False, encoding="utf-8-sig")
    pd.DataFrame(report["global_parameter_stats"]).to_csv(global_csv, index=False, encoding="utf-8-sig")
    pd.DataFrame(report["context_rules_candidates"]).to_csv(rules_csv, index=False, encoding="utf-8-sig")

    return {
        "json": json_path,
        "file_meta_csv": file_meta_csv,
        "per_file_csv": per_file_csv,
        "global_csv": global_csv,
        "rules_csv": rules_csv,
    }


def print_console_summary(report: Dict[str, object]) -> None:
    print("=== Анализ TXT по 12 параметрам ===")
    print(f"Папка: {report['input_root']}")
    print(f"Файлов всего: {report['files_total']}")
    print(f"Файлов обработано: {report['files_parsed']}")
    print(f"Уникальных файлов (по контенту): {report['files_unique_by_content']}")
    print(f"Всего строк: {report['rows_total']}")
    print(
        f"Длительность (все файлы): {report['total_duration_days_all_files']:.2f} дней "
        f"({report['total_duration_hours_all_files']:.1f} ч)"
    )
    print(
        f"Длительность (уникальные файлы): {report['total_duration_days_unique_files']:.2f} дней "
        f"({report['total_duration_hours_unique_files']:.1f} ч)"
    )

    print("\n--- Глобальные окна (q05..q95 / q01..q99) ---")
    for row in report["global_parameter_stats"]:
        if row.get("count", 0) == 0:
            print(f"{row['parameter']:<30} | нет данных")
            continue
        print(
            f"{row['parameter']:<30} | "
            f"mean={row['mean']:.4f} | "
            f"min..max=[{row['observed_min']:.4f}; {row['observed_max']:.4f}] | "
            f"soft=[{row['soft_window_min']:.4f}; {row['soft_window_max']:.4f}] | "
            f"hard=[{row['hard_window_min']:.4f}; {row['hard_window_max']:.4f}]"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Прогоняет все TXT в rig_files и формирует окна допустимых параметров по 12 каналам."
    )
    parser.add_argument(
        "--input-root",
        type=Path,
        default=DEFAULT_INPUT_ROOT,
        help="Папка с TXT файлами",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Папка для отчетов",
    )
    return parser.parse_args()


async def _main_async() -> None:
    args = parse_args()
    report = await analyze_all_files(args.input_root)
    print_console_summary(report)
    saved = save_reports(report, args.out_dir)

    print("\nСохранено:")
    print(f"- JSON: {saved['json']}")
    print(f"- CSV (file meta): {saved['file_meta_csv']}")
    print(f"- CSV (per file): {saved['per_file_csv']}")
    print(f"- CSV (global): {saved['global_csv']}")
    print(f"- CSV (rules): {saved['rules_csv']}")


if __name__ == "__main__":
    asyncio.run(_main_async())
