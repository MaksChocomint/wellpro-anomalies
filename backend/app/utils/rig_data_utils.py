from __future__ import annotations

from pathlib import Path
import re
from typing import Dict, List, Optional, Tuple

RIG_FILES_ROOT = Path(__file__).resolve().parents[1] / "data" / "rig_files"
_RIG_DIR_PATTERN = re.compile(r"^cluster_(\d+)_well_(.+)$", re.IGNORECASE)

RigKey = Tuple[int, str]


def _normalize_well_name(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return str(value).strip()


def list_rig_file_bindings(root: Path = RIG_FILES_ROOT) -> Dict[RigKey, List[Path]]:
    """Return mapping (cluster_number, well_name) -> sorted *.txt files."""
    bindings: Dict[RigKey, List[Path]] = {}

    if not root.exists():
        return bindings

    for rig_dir in sorted((p for p in root.iterdir() if p.is_dir()), key=lambda p: p.name.lower()):
        match = _RIG_DIR_PATTERN.match(rig_dir.name)
        if not match:
            continue

        cluster_number = int(match.group(1))
        well_name = match.group(2)
        files = sorted(
            [f for f in rig_dir.iterdir() if f.is_file() and f.suffix.lower() == ".txt"],
            key=lambda f: f.name.lower(),
        )
        if files:
            bindings[(cluster_number, well_name)] = files

    return bindings


def resolve_rig_file_paths(
    cluster_number: Optional[int],
    well_name: Optional[str],
    root: Path = RIG_FILES_ROOT,
) -> List[Path]:
    """Resolve assigned files for selected rig. Returns empty list if no assignment."""
    if cluster_number is None:
        return []

    normalized_well_name = _normalize_well_name(well_name)
    if normalized_well_name is None or normalized_well_name == "":
        return []

    bindings = list_rig_file_bindings(root)
    return bindings.get((int(cluster_number), normalized_well_name), [])


def summarize_bindings(root: Path = RIG_FILES_ROOT) -> Dict[str, object]:
    bindings = list_rig_file_bindings(root)
    total_files = sum(len(files) for files in bindings.values())
    rows = [
        {
            "cluster_number": cluster_number,
            "well_name": well_name,
            "files_count": len(files),
            "files": [file.name for file in files],
        }
        for (cluster_number, well_name), files in sorted(bindings.items(), key=lambda item: (item[0][0], item[0][1]))
    ]

    return {
        "rigs_count": len(bindings),
        "files_count": total_files,
        "items": rows,
    }
