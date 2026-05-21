"""
Batch converter for GeoData *.realtim files -> tab-separated *.txt files.

Output format is compatible with backend parser (parse_data):
1) "Начало рейса - ..."
2) "Окончание рейса - ..."
3) empty line
4) header with tab-separated columns
5+) tab-separated numeric rows with decimal comma
"""

from __future__ import annotations

import argparse
import math
import struct
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable, List, Tuple


HEADER_SIZE_BYTES = 13
MIN_RECORD_STEP = 120
MAX_RECORD_STEP = 400
MIN_REPEATING_RECORDS = 80
SECONDS_IN_DAY = 86400
EXCEL_EPOCH = datetime(1899, 12, 30)
EXCEL_UNIX_OFFSET_DAYS = 25569
MONTHS_RU = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
]


def _find_record_layout(blob: bytes) -> Tuple[int, int, bytes, int]:
    """
    Detect record start/step using a repeated 2-byte record token.
    """
    best_run = 0
    best_start = -1
    best_step = -1
    best_token = b""

    search_limit = min(12000, len(blob) - 500)
    for start in range(search_limit):
        token = blob[start : start + 2]
        if len(token) < 2 or token[0] != 1:
            continue

        for step in range(MIN_RECORD_STEP, MAX_RECORD_STEP + 1):
            ok = True
            for n in range(1, MIN_REPEATING_RECORDS):
                pos = start + n * step
                if pos + 2 > len(blob) or blob[pos : pos + 2] != token:
                    ok = False
                    break
            if not ok:
                continue

            run = MIN_REPEATING_RECORDS
            while (
                start + run * step + 2 <= len(blob)
                and blob[start + run * step : start + run * step + 2] == token
            ):
                run += 1

            if run > best_run:
                best_run = run
                best_start = start
                best_step = step
                best_token = token
            break

    if best_start < 0:
        raise ValueError("Не удалось определить структуру записей в .realtim")

    if (best_step - HEADER_SIZE_BYTES) % 4 != 0:
        raise ValueError(
            f"Неподдерживаемый размер записи: {best_step} байт "
            f"(ожидалось HEADER + N*4)"
        )

    return best_start, best_step, best_token, best_run


def _decode_meta_chunk(raw: bytes) -> str | None:
    for encoding in ("cp1251", "utf-8", "latin1"):
        try:
            return raw.decode(encoding).strip().lower()
        except Exception:
            continue
    return None


def _is_simple_name(text: str) -> bool:
    if len(text) <= 1:
        return False
    if not any(ch.isalpha() for ch in text):
        return False
    return all(ch.isalnum() or ch == "_" for ch in text)


def _extract_parameter_names(
    blob: bytes, data_start: int, expected_count: int
) -> List[str]:
    """
    Extract canonical parameter names from metadata block (before data start).
    """
    chunks = blob[:data_start].split(b"\x00")
    names: List[str] = []
    seen = set()

    for i, raw in enumerate(chunks):
        if not raw:
            continue

        text = _decode_meta_chunk(raw)
        if not text or not _is_simple_name(text):
            continue

        # Canonical names in *.realtim are usually followed by several empty chunks.
        empties_after = 0
        j = i + 1
        while j < len(chunks) and chunks[j] == b"":
            empties_after += 1
            j += 1
        if empties_after < 2:
            continue

        # Filter obvious non-canonical technical prefixes.
        if (
            text.startswith("иb")
            or text.startswith("ab")
            or text.startswith("zc")
            or text.startswith("hc")
            or text.startswith("pb")
        ):
            continue

        if text in seen:
            continue
        seen.add(text)
        names.append(text)

    if len(names) < expected_count:
        for idx in range(len(names), expected_count):
            names.append(f"параметр_{idx + 1}")
    else:
        names = names[:expected_count]

    return names


def _excel_serial_to_datetime(serial: float) -> datetime:
    return EXCEL_EPOCH + timedelta(days=serial)


def _format_flight_line(prefix: str, excel_serial: float) -> str:
    dt = _excel_serial_to_datetime(excel_serial)
    month_name = MONTHS_RU[dt.month - 1]
    return f"{prefix} - {dt.day} {month_name} {dt.year}г. {dt.hour}:{dt.minute:02d}"


def _format_number(value: float) -> str:
    if not math.isfinite(value):
        return ""
    if abs(value) < 1e-12:
        value = 0.0
    text = f"{value:.15f}".rstrip("0").rstrip(".")
    if text in {"", "-0"}:
        text = "0"
    return text.replace(".", ",")


def convert_realtim_file(source_path: Path, target_path: Path) -> Tuple[int, int]:
    blob = source_path.read_bytes()
    data_start, record_step, record_token, _ = _find_record_layout(blob)
    values_per_record = (record_step - HEADER_SIZE_BYTES) // 4
    params_count = values_per_record - 2

    param_names = _extract_parameter_names(blob, data_start, params_count)
    columns = ["Глубина", "Время", *param_names]

    rows: List[List[float]] = []
    pos = data_start
    while pos + record_step <= len(blob):
        record = blob[pos : pos + record_step]
        if record[:2] != record_token:
            break

        # Record header:
        # [0:2]   token
        # [3:7]   unix timestamp + 1 day
        # [7:11]  depth float32
        unix_timestamp_plus_day = struct.unpack("<I", record[3:7])[0]
        depth = struct.unpack("<f", record[7:11])[0]
        excel_time = (
            (unix_timestamp_plus_day - SECONDS_IN_DAY) / SECONDS_IN_DAY
            + EXCEL_UNIX_OFFSET_DAYS
        )

        raw_values = [
            struct.unpack("<f", record[HEADER_SIZE_BYTES + 4 * i : HEADER_SIZE_BYTES + 4 * (i + 1)])[0]
            for i in range(values_per_record)
        ]

        # First two raw float values are service fields.
        row = [depth, excel_time, *raw_values[2:]]
        rows.append(row)
        pos += record_step

    if not rows:
        raise ValueError("В файле не найдено ни одной корректной записи")

    start_line = _format_flight_line("Начало рейса", rows[0][1])
    end_line = _format_flight_line("Окончание рейса", rows[-1][1])

    text_lines = [start_line, end_line, "", "\t".join(columns)]
    for row in rows:
        text_lines.append("\t".join(_format_number(v) for v in row))

    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text("\n".join(text_lines) + "\n", encoding="utf-8")
    return len(rows), len(columns)


def _iter_realtim_files(root: Path) -> Iterable[Path]:
    return sorted(p for p in root.rglob("*.realtim") if p.is_file())


def run_batch_conversion(root: Path, output_root: Path | None, overwrite: bool) -> None:
    files = list(_iter_realtim_files(root))
    if not files:
        print(f"[Converter] В папке '{root}' не найдено файлов .realtim")
        return

    converted = 0
    skipped = 0
    failed = 0

    for source in files:
        if output_root is None:
            target = source.with_suffix(".txt")
        else:
            relative = source.relative_to(root)
            target = (output_root / relative).with_suffix(".txt")

        if target.exists() and not overwrite:
            skipped += 1
            print(f"[SKIP] {source} -> {target} (уже существует)")
            continue

        try:
            rows, cols = convert_realtim_file(source, target)
            converted += 1
            print(f"[OK]   {source} -> {target} | строк: {rows}, колонок: {cols}")
        except Exception as exc:
            failed += 1
            print(f"[FAIL] {source} | {exc}")

    print(
        f"\n[Converter] Готово. Конвертировано: {converted}, "
        f"пропущено: {skipped}, ошибок: {failed}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Пакетная конвертация GeoData .realtim в .txt"
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path("Факт данные"),
        help="Корневая папка с .realtim файлами",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=None,
        help="Папка вывода (если не задана, сохраняет рядом с исходным файлом)",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Перезаписывать уже существующие .txt",
    )
    args = parser.parse_args()

    root = args.root.resolve()
    if not root.exists():
        raise FileNotFoundError(f"Папка не найдена: {root}")

    output_root = args.output_root.resolve() if args.output_root else None
    run_batch_conversion(root=root, output_root=output_root, overwrite=args.overwrite)


if __name__ == "__main__":
    main()

