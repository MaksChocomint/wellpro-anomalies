"""
Generate visual validation TXT files for anomaly-detection methods and run tests.

The files use the same 2-line preamble + tab-separated numeric table format as
the real drilling TXT files parsed by app.utils.data_utils.parse_data.
"""

from __future__ import annotations

import asyncio
import math
import sys
from collections import defaultdict, deque
from datetime import datetime
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))

from app.methods import METHODS, reset_ammad_detectors
from app.utils.data_utils import filter_required_parameters, parse_data

OUTPUT_DIR = BACKEND_ROOT / "app" / "data" / "validation_cases"
REPORT_DIR = BACKEND_ROOT / "analysis_results"

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

HEADERS = ["Время", *PARAMETERS]
METHOD_CONFIGS = {
    "z_score": {"window_size": 48, "score_threshold": 3.5},
    "lof": {"window_size": 40, "score_threshold": 18.0},
    "fft": {"window_size": 64, "score_threshold": 0.3},
    "ammad": {"window_size": 48, "score_threshold": 0.8},
}


def _excel_time(index: int) -> float:
    # 10-second step from 2020-01-01 in Excel serial-day units.
    return 43831.0 + (index * 10.0 / 86400.0)


def _base_row(index: int) -> dict[str, float]:
    return {
        "время": _excel_time(index),
        "глубина": 3000.0 + index * 0.02,
        "скорость_бурения": 1.25 + 0.12 * math.sin(index / 3.2),
        "вес_на_крюке": 55.0 + 1.4 * math.sin(index / 3.7),
        "момент_ротора": 2.2 + 0.18 * math.sin(index / 3.4),
        "обороты_ротора": 24.0 + 1.1 * math.sin(index / 3.5),
        "давление_на_входе": 220.0 + 3.0 * math.sin(index / 4.0),
        "расход_на_входе": 13.4 + 0.16 * math.sin(index / 3.1),
        "температура_на_выходе": 38.0 + 0.03 * math.sin(index / 30.0),
        "уровень_в_емкости": 1.22 + 0.01 * math.sin(index / 25.0),
        "скорость_спо": 0.0,
        "нагрузка": 6.2 + 0.36 * math.sin(index / 3.6),
        "дмк": 42.0 + 1.3 * math.sin(index / 3.3),
    }


def _normal_rows(count: int = 240) -> list[dict[str, float]]:
    return [_base_row(index) for index in range(count)]


def _set_range(rows: list[dict[str, float]], start: int, end: int, values: dict[str, float]) -> None:
    for index in range(start, min(end, len(rows))):
        rows[index].update(values)


def _make_physical_limits() -> list[dict[str, float]]:
    rows = _normal_rows()
    _set_range(
        rows,
        80,
        90,
        {
            "давление_на_входе": 340.0,
            "расход_на_входе": -2.0,
            "температура_на_выходе": -30.0,
            "уровень_в_емкости": 2.4,
        },
    )
    _set_range(
        rows,
        120,
        130,
        {
            "вес_на_крюке": 105.0,
            "момент_ротора": 12.0,
            "обороты_ротора": 52.0,
            "нагрузка": 24.0,
        },
    )
    _set_range(
        rows,
        160,
        170,
        {
            "скорость_бурения": 12.0,
            "скорость_спо": 2.4,
            "дмк": 235.0,
            "глубина": 12000.0,
        },
    )
    return rows


def _make_statistical_spikes() -> list[dict[str, float]]:
    rows = _normal_rows()
    for start in (70, 110, 150):
        _set_range(
            rows,
            start,
            start + 5,
            {
                "давление_на_входе": 318.0,
                "вес_на_крюке": 88.0,
                "момент_ротора": 9.2,
                "нагрузка": 18.5,
                "дмк": 216.0,
            },
        )
    for start in (90, 135):
        _set_range(
            rows,
            start,
            start + 5,
            {
                "скорость_бурения": 6.8,
                "расход_на_входе": 15.7,
                "температура_на_выходе": 46.5,
                "уровень_в_емкости": 1.74,
            },
        )
    return rows


def _make_context_stalls() -> list[dict[str, float]]:
    rows = _normal_rows()
    _set_range(
        rows,
        90,
        125,
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
    _set_range(
        rows,
        150,
        185,
        {
            "скорость_бурения": 0.0,
            "дмк": 0.0,
            "нагрузка": 0.0,
            "обороты_ротора": 0.0,
            "момент_ротора": 0.0,
        },
    )
    return rows


def _make_fft_oscillations() -> list[dict[str, float]]:
    rows = _normal_rows()
    for index in range(80, 180):
        sign = 1.0 if index % 2 == 0 else -1.0
        rows[index].update(
            {
                "давление_на_входе": 220.0 + sign * 105.0,
                "расход_на_входе": 13.0 + sign * 4.4,
                "момент_ротора": 4.5 + sign * 5.8,
                "обороты_ротора": 25.0 + sign * 21.0,
                "нагрузка": 7.5 + sign * 13.0,
                "вес_на_крюке": 58.0 + sign * 33.0,
            }
        )
    return rows


def _make_mixed_all_types() -> list[dict[str, float]]:
    rows = _normal_rows(320)
    _set_range(rows, 55, 65, {"температура_на_выходе": -35.0, "уровень_в_емкости": 2.5})
    _set_range(rows, 95, 105, {"давление_на_входе": 342.0, "расход_на_входе": -3.0})
    _set_range(rows, 135, 170, {"скорость_бурения": 0.0, "дмк": 0.0, "нагрузка": 0.0})
    for index in range(200, 260):
        sign = 1.0 if index % 2 == 0 else -1.0
        rows[index].update(
            {
                "момент_ротора": 3.5 + sign * 3.4,
                "обороты_ротора": 25.0 + sign * 14.5,
                "вес_на_крюке": 58.0 + sign * 23.0,
            }
        )
    _set_range(rows, 285, 292, {"дмк": 160.0, "скорость_бурения": 6.4, "нагрузка": 15.8})
    return rows


CASES: list[dict[str, Any]] = [
    {
        "filename": "ammad_case_00_normal_ok.TXT",
        "title": "Норма без специально внесенных аномалий",
        "rows_factory": _normal_rows,
        "expected": [
            "Все 12 параметров в физических и статистически типичных диапазонах.",
            "Ожидается 0 или почти 0 срабатываний AMMAD.",
        ],
    },
    {
        "filename": "ammad_case_01_physical_limits.TXT",
        "title": "Физические и безопасные пределы",
        "rows_factory": _make_physical_limits,
        "expected": [
            "80-89: давление выше max, расход ниже min, температура ниже min, уровень выше max.",
            "120-129: вес, момент, обороты и нагрузка выше безопасных пределов.",
            "160-169: скорость бурения, скорость СПО, ДМК и глубина выше безопасных пределов.",
        ],
    },
    {
        "filename": "ammad_case_02_statistical_spikes.TXT",
        "title": "Статистические выбросы внутри физических пределов",
        "rows_factory": _make_statistical_spikes,
        "expected": [
            "Короткие пачки резких отклонений: значения остаются внутри абсолютных физических границ, но выходят из типичного рабочего окна.",
            "Хорошо проверяет Z-score/LOF и способность AMMAD отличать опасный рабочий выброс от штатного шума.",
        ],
    },
    {
        "filename": "ammad_case_03_context_stuck_sensor.TXT",
        "title": "Контекстные залипания датчиков при росте глубины",
        "rows_factory": _make_context_stalls,
        "expected": [
            "Глубина продолжает расти, но часть рабочих каналов долго стоит на нуле/плато.",
            "Это имитация залипания датчика или потери сигнала при активном бурении.",
        ],
    },
    {
        "filename": "ammad_case_04_fft_oscillations.TXT",
        "title": "Высокочастотные колебания и пульсации",
        "rows_factory": _make_fft_oscillations,
        "expected": [
            "80-179: чередующиеся значения давления, расхода, момента, оборотов, нагрузки и веса.",
            "Пики выходят за безопасные пределы, поэтому файл проверяет FFT-пульсацию и реакцию AMMAD на опасную устойчивую вибрацию.",
        ],
    },
    {
        "filename": "ammad_case_05_mixed_all_types.TXT",
        "title": "Смешанный файл: все типы аномалий",
        "rows_factory": _make_mixed_all_types,
        "expected": [
            "Есть физические нарушения, контекстные залипания, FFT-колебания и статистические всплески.",
            "Файл нужен как демонстрационный интегральный тест.",
        ],
    },
]


def _format_number(value: float) -> str:
    return f"{value:.6f}".replace(".", ",")


def _write_case_file(path: Path, rows: list[dict[str, float]]) -> None:
    lines = [
        "Начало рейса - 1 января 2020г. 00:00",
        "Окончание рейса - 1 января 2020г. 01:00",
        "\t".join(HEADERS),
    ]
    for row in rows:
        values = [row["время"], *[row[param] for param in PARAMETERS]]
        lines.append("\t".join(_format_number(float(value)) for value in values))

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def generate_files() -> dict[str, Path]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    generated: dict[str, Path] = {}
    for case in CASES:
        rows = case["rows_factory"]()
        path = OUTPUT_DIR / case["filename"]
        _write_case_file(path, rows)
        generated[case["filename"]] = path
    return generated


def _is_valid_number(value: Any) -> bool:
    if value is None or isinstance(value, bool):
        return False
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def _to_float(value: Any) -> float | None:
    if not _is_valid_number(value):
        return None
    return float(value)


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


async def _run_method(rows: list[dict[str, Any]], method_name: str) -> dict[str, dict[str, int]]:
    if method_name == "ammad":
        reset_ammad_detectors()

    config = METHOD_CONFIGS[method_name]
    window_size = int(config["window_size"])
    buffers: dict[str, deque] = defaultdict(lambda: deque(maxlen=window_size + 1))
    result = {param: {"anomalies": 0, "evaluated": 0} for param in PARAMETERS}
    method = METHODS[method_name]

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
                kwargs["detector_scope"] = f"validation-{method_name}"

            is_anomaly = bool(await method(data=list(buffers[param]), **kwargs))
            result[param]["evaluated"] += 1
            if is_anomaly:
                result[param]["anomalies"] += 1

    if method_name == "ammad":
        reset_ammad_detectors()

    return result


async def analyze_case_file(path: Path) -> dict[str, Any]:
    raw = await parse_data(filename=str(path))
    if raw is None:
        raise RuntimeError(f"Не удалось распарсить {path}")

    rows = filter_required_parameters(raw)
    method_results = {}
    for method_name in METHOD_CONFIGS:
        method_results[method_name] = await _run_method(rows, method_name)

    method_totals = {}
    for method_name, per_param in method_results.items():
        anomalies = sum(item["anomalies"] for item in per_param.values())
        evaluated = sum(item["evaluated"] for item in per_param.values())
        method_totals[method_name] = {
            "anomalies": anomalies,
            "evaluated": evaluated,
            "percent": (anomalies / evaluated * 100.0) if evaluated else 0.0,
        }

    return {
        "file": path,
        "rows_count": len(rows),
        "method_totals": method_totals,
        "method_results": method_results,
    }


def _line_table(headers: list[str], rows: list[list[Any]]) -> list[str]:
    lines = [" | ".join(headers), " | ".join(["---"] * len(headers))]
    for row in rows:
        lines.append(" | ".join(str(value) for value in row))
    return lines


def _case_status(case_name: str, ammad_count: int) -> str:
    if "normal_ok" in case_name:
        return "OK" if ammad_count <= 2 else "ПРОВЕРИТЬ: для нормального файла многовато AMMAD"
    return "OK" if ammad_count > 0 else "ПРОВЕРИТЬ: AMMAD ничего не нашел"


def write_report(results: list[dict[str, Any]], generated: dict[str, Path]) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORT_DIR / f"ammad_validation_test_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"

    lines: list[str] = []
    lines.append("РЕЗУЛЬТАТЫ ТЕСТОВЫХ ФАЙЛОВ ДЛЯ ВАЛИДАЦИИ МЕТОДОВ АНОМАЛИЙ")
    lines.append("=" * 78)
    lines.append("")
    lines.append(f"Папка с тестовыми файлами: {OUTPUT_DIR}")
    lines.append("")
    lines.append("Сгенерированные файлы:")
    for case in CASES:
        lines.append(f"- {case['filename']}: {case['title']}")
    lines.append("")
    lines.append("Использованные параметры методов:")
    for method_name, config in METHOD_CONFIGS.items():
        lines.append(
            f"- {method_name}: window_size={config['window_size']}, "
            f"score_threshold={config['score_threshold']}"
        )
    lines.append("")

    summary_rows = []
    for result in results:
        name = result["file"].name
        totals = result["method_totals"]
        summary_rows.append(
            [
                name,
                result["rows_count"],
                totals["z_score"]["anomalies"],
                totals["lof"]["anomalies"],
                totals["fft"]["anomalies"],
                totals["ammad"]["anomalies"],
                f"{totals['ammad']['percent']:.4f}%",
                _case_status(name, totals["ammad"]["anomalies"]),
            ]
        )

    lines.extend(
        _line_table(
            ["Файл", "Строк", "Z-score", "LOF", "FFT", "AMMAD", "AMMAD %", "Статус"],
            summary_rows,
        )
    )
    lines.append("")

    case_by_name = {case["filename"]: case for case in CASES}
    for result in results:
        file_name = result["file"].name
        case = case_by_name[file_name]
        lines.append("-" * 78)
        lines.append(f"{file_name}")
        lines.append(f"Назначение: {case['title']}")
        lines.append("Ожидаемые видимые события:")
        for item in case["expected"]:
            lines.append(f"  - {item}")
        lines.append("")

        totals = result["method_totals"]
        lines.append("Итоги по методам:")
        lines.extend(
            _line_table(
                ["Метод", "Аномалий", "Оценено точек", "%"],
                [
                    [
                        method_name,
                        totals[method_name]["anomalies"],
                        totals[method_name]["evaluated"],
                        f"{totals[method_name]['percent']:.4f}",
                    ]
                    for method_name in METHOD_CONFIGS
                ],
            )
        )
        lines.append("")

        ammad_rows = []
        for param, values in sorted(
            result["method_results"]["ammad"].items(),
            key=lambda item: item[1]["anomalies"],
            reverse=True,
        ):
            if values["anomalies"] == 0:
                continue
            percent = values["anomalies"] / values["evaluated"] * 100.0 if values["evaluated"] else 0.0
            ammad_rows.append([param, values["anomalies"], values["evaluated"], f"{percent:.4f}"])

        lines.append("AMMAD по параметрам с ненулевыми срабатываниями:")
        if ammad_rows:
            lines.extend(_line_table(["Параметр", "Аномалий", "Оценено", "%"], ammad_rows))
        else:
            lines.append("AMMAD не выделил аномалий.")
        lines.append("")

    lines.append("=" * 78)
    lines.append("Вывод:")
    lines.append(
        "Нормальный файл нужен как контроль ложных срабатываний. Остальные файлы "
        "проверяют физические пределы, статистические выбросы, контекстные "
        "залипания датчиков, высокочастотные колебания и смешанный сценарий. "
        "AMMAD должен быть особенно полезен там, где требуется учитывать не только "
        "редкость точки, но и физику параметра и контекст бурения."
    )

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return report_path


async def main() -> None:
    generated = generate_files()
    results = []
    for case in CASES:
        results.append(await analyze_case_file(generated[case["filename"]]))
    report_path = write_report(results, generated)

    print(f"Тестовые файлы: {OUTPUT_DIR}")
    print(f"Отчет: {report_path}")


if __name__ == "__main__":
    asyncio.run(main())
