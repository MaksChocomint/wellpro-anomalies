from __future__ import annotations

import asyncio
import re
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import pandas as pd
from PIL import Image, ImageDraw

from app.methods import METHODS, reset_ammad_detectors
from app.services.generate_ammad_validation_cases import METHOD_CONFIGS, _build_row_context
from app.utils.data_utils import filter_required_parameters, parse_data


ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "extracted_assets"
OUT = ROOT / "thesis_figures"
OUT.mkdir(parents=True, exist_ok=True)


def _load_image(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB")


def _fit_panel(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    panel = Image.new("RGB", size, "white")
    thumb = image.copy()
    thumb.thumbnail((size[0] - 30, size[1] - 50))
    x = (size[0] - thumb.width) // 2
    y = (size[1] - thumb.height) // 2 + 10
    panel.paste(thumb, (x, y))
    return panel


def _compose_two_panel(
    left_path: Path,
    right_path: Path,
    out_path: Path,
    left_label: str = "(a)",
    right_label: str = "(b)",
) -> Path:
    width, height = 900, 520
    label_h = 40
    canvas = Image.new("RGB", (width * 2 + 30, height + label_h), "white")
    draw = ImageDraw.Draw(canvas)
    left = _fit_panel(_load_image(left_path), (width, height))
    right = _fit_panel(_load_image(right_path), (width, height))
    canvas.paste(left, (0, 0))
    canvas.paste(right, (width + 30, 0))
    draw.text((20, height + 8), left_label, fill="black")
    draw.text((width + 50, height + 8), right_label, fill="black")
    canvas.save(out_path)
    return out_path


async def build_ammad_example_figure(out_path: Path) -> Path:
    case_path = Path(
        r"D:\diploma\wellpro-anomalies\backend\app\data\validation_cases\ammad_case_03_context_stuck_sensor.TXT"
    )
    raw = await parse_data(filename=str(case_path))
    if raw is None:
        raise RuntimeError(f"Не удалось распарсить {case_path}")

    rows = filter_required_parameters(raw)
    param = "скорость_бурения"
    cfg = METHOD_CONFIGS["ammad"]
    window_size = int(cfg["window_size"])
    threshold = float(cfg["score_threshold"])
    buffer: deque[float] = deque(maxlen=window_size + 1)
    values: list[float] = []
    anomalies_x: list[int] = []
    anomalies_y: list[float] = []

    reset_ammad_detectors("thesis-figure")
    method = METHODS["ammad"]

    for index, row in enumerate(rows):
        value = row.get(param)
        if value is None:
            continue
        value_f = float(value)
        values.append(value_f)
        buffer.append(value_f)
        previous_row = rows[index - 1] if index > 0 else None
        context = _build_row_context(row, previous_row)
        is_anomaly = bool(
            await method(
                data=list(buffer),
                window_size=window_size,
                score_threshold=threshold,
                param_name=param,
                context=context,
                detector_scope="thesis-figure",
            )
        )
        if is_anomaly:
            anomalies_x.append(len(values) - 1)
            anomalies_y.append(value_f)

    reset_ammad_detectors("thesis-figure")

    plt.figure(figsize=(12, 5))
    plt.plot(values, color="#2f5bea", linewidth=1.8, label=param)
    if anomalies_x:
        plt.scatter(anomalies_x, anomalies_y, color="#d93025", s=34, label="AMMAD")
    plt.title("Пример срабатывания AMMAD на кейсе контекстного залипания")
    plt.xlabel("Индекс точки")
    plt.ylabel("Значение")
    plt.legend()
    plt.grid(True, alpha=0.25)
    plt.tight_layout()
    plt.savefig(out_path, dpi=180)
    plt.close()
    return out_path


def build_method_comparison_figure(out_path: Path) -> Path:
    bench = pd.DataFrame(
        [
            {
                "method": "z_score",
                "evaluated_total": 7_357_044,
                "anomalies_total": 18_846,
                "percent_total": 0.2562,
            },
            {
                "method": "lof",
                "evaluated_total": 7_357_044,
                "anomalies_total": 20_181,
                "percent_total": 0.2744,
            },
            {
                "method": "fft",
                "evaluated_total": 7_357_044,
                "anomalies_total": 115_252,
                "percent_total": 1.5666,
            },
            {
                "method": "ammad v2",
                "evaluated_total": 7_357_044,
                "anomalies_total": 9_681,
                "percent_total": 0.1316,
            },
        ]
    ).sort_values("percent_total", ascending=False)

    validation_rows = [
        ("normal_ok", 0, 0, 0, 0),
        ("physical_limits", 45, 38, 0, 12),
        ("statistical_spikes", 34, 41, 0, 3),
        ("context_stuck", 28, 17, 0, 39),
        ("fft_oscillations", 27, 28, 424, 55),
        ("mixed", 51, 46, 190, 13),
    ]
    val = pd.DataFrame(validation_rows, columns=["case", "z_score", "lof", "fft", "ammad v2"])

    fig, axes = plt.subplots(1, 2, figsize=(14, 5.5))

    method_colors = {
        "z_score": "#4c78a8",
        "lof": "#72b7b2",
        "fft": "#f58518",
        "ammad v2": "#e45756",
    }

    axes[0].bar(
        bench["method"],
        bench["percent_total"],
        color=[method_colors[method] for method in bench["method"]],
    )
    axes[0].set_title("Доля аномалий на 15 реальных файлах")
    axes[0].set_ylabel("% от оцененных точек")
    axes[0].grid(axis="y", alpha=0.25)
    for idx, value in enumerate(bench["percent_total"]):
        axes[0].text(idx, value + 0.03, f"{value:.3f}%", ha="center", fontsize=9)

    methods = ["z_score", "lof", "fft", "ammad v2"]
    colors = [method_colors[method] for method in methods]
    x = range(len(val))
    width = 0.2
    for offset, method, color in zip([-1.5, -0.5, 0.5, 1.5], methods, colors):
        axes[1].bar(
            [i + offset * width for i in x],
            val[method],
            width=width,
            label=method,
            color=color,
        )
    axes[1].set_title("Срабатывания на проверочных сценариях")
    axes[1].set_xticks(list(x))
    axes[1].set_xticklabels(val["case"], rotation=25, ha="right")
    axes[1].set_ylabel("Число срабатываний")
    axes[1].grid(axis="y", alpha=0.25)
    axes[1].legend()

    plt.tight_layout()
    plt.savefig(out_path, dpi=180)
    plt.close()
    return out_path


async def main() -> None:
    _compose_two_panel(
        ASSETS / "tz_01_software_structure.png",
        ASSETS / "tz_02_app_workflow.png",
        OUT / "figure_01_architecture_from_tz.png",
    )
    _compose_two_panel(
        ASSETS / "course_03_er_chen.png",
        ASSETS / "course_05_physical_db_model.png",
        OUT / "figure_02_db_models.png",
    )
    _compose_two_panel(
        ASSETS / "course_12_realtime_graphs.png",
        ASSETS / "course_14_anomaly_modal.png",
        OUT / "figure_04_monitoring_interface.png",
    )
    await build_ammad_example_figure(OUT / "figure_05_ammad_example.png")
    build_method_comparison_figure(OUT / "figure_06_method_comparison.png")

    print(OUT)


if __name__ == "__main__":
    asyncio.run(main())
