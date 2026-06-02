import asyncio
import json
from collections import deque
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, Optional, Set, Tuple

import numpy as np

# ==================== CONSTANTS ====================

Z_SCORE_THRESHOLD = 3.0
LOF_SCORE_THRESHOLD = 25.0
FFT_SCORE_THRESHOLD = 0.30
AMMAD_SCORE_THRESHOLD = 0.80

Z_SCORE_WINDOW_SIZE = 30
LOF_WINDOW_SIZE = 60
FFT_WINDOW_SIZE = 64
AMMAD_WINDOW_SIZE = 48

K_LOF = 5
EPS = 1e-10
AMMAD_MIN_BASE_VOTES = 3
AMMAD_PERSISTENCE_WINDOW = 5
AMMAD_PERSISTENCE_MIN_HITS = 3
AMMAD_COOLDOWN_POINTS = 10

AMMAD_CONTEXT_CONFIG_PATH = Path(__file__).resolve().parent / "config" / "ammad_context.json"

DEFAULT_AMMAD_CONTEXT_CONFIG: Dict[str, Any] = {
    "safety_limits": {
        "скорость_спо": {"min": 0.0, "max": 2.0, "critical": 1.75},
        "скорость_бурения": {"min": 0.0, "max": 10.0, "critical": 7.5},
        "дмк": {"min": 0.0, "max": 220.0, "critical": 180.0},
        "нагрузка": {"min": -3.0, "max": 20.0, "critical": 16.0},
        "обороты_ротора": {"min": -1.0, "max": 45.0, "critical": 40.0},
        "момент_ротора": {"min": -2.0, "max": 10.0, "critical": 8.0},
        "расход_на_входе": {"min": -1.0, "max": 17.0, "critical": 15.5},
        "давление_на_входе": {"min": -1.0, "max": 320.0, "critical": 300.0},
        "температура_на_выходе": {"min": -20.0, "max": 50.0, "critical": 45.0},
        "вес_на_крюке": {"min": 0.0, "max": 90.0, "critical": 85.0},
        "уровень_в_емкости": {"min": 0.6, "max": 1.8, "critical": 1.7},
        "глубина": {"min": 0.0, "max": 10000.0, "critical": 9000.0},
    },
    "context_hard_windows": {
        "вес_на_крюке": {"min": 0.0, "max": 87.34},
        "глубина": {"min": 796.49, "max": 3503.76},
        "давление_на_входе": {"min": -0.08, "max": 314.65},
        "дмк": {"min": 0.0, "max": 211.26},
        "момент_ротора": {"min": -1.06, "max": 8.0},
        "нагрузка": {"min": 0.0, "max": 16.45},
        "обороты_ротора": {"min": -0.45, "max": 40.4},
        "расход_на_входе": {"min": -0.32, "max": 15.41},
        "скорость_бурения": {"min": 0.0, "max": 6.5},
        "скорость_спо": {"min": 0.0, "max": 0.54},
        "температура_на_выходе": {"min": -7.5, "max": 45.0},
        "уровень_в_емкости": {"min": 0.75, "max": 1.71},
    },
    "change_required_when_depth_grows": [
        "скорость_бурения",
        "дмк",
        "нагрузка",
        "обороты_ротора",
        "момент_ротора",
        "расход_на_входе",
        "давление_на_входе",
        "вес_на_крюке",
    ],
    "flat_tolerance": {
        "скорость_бурения": 0.01,
        "дмк": 0.05,
        "нагрузка": 0.05,
        "обороты_ротора": 0.05,
        "момент_ротора": 0.01,
        "расход_на_входе": 0.01,
        "давление_на_входе": 0.1,
        "вес_на_крюке": 0.1,
    },
    "depth_move_threshold": 0.003,
    "stall_window": 8,
    "param_weights": {
        "скорость_спо": [0.2, 0.4, 0.4],
        "скорость_бурения": [0.2, 0.4, 0.4],
        "момент_ротора": [0.3, 0.4, 0.3],
        "дмк": [0.3, 0.5, 0.2],
        "глубина": [0.8, 0.1, 0.1],
        "вес_на_крюке": [0.7, 0.2, 0.1],
        "температура_на_выходе": [0.8, 0.2, 0.0],
        "давление_на_входе": [0.5, 0.4, 0.1],
        "расход_на_входе": [0.6, 0.3, 0.1],
        "уровень_в_емкости": [0.4, 0.5, 0.1],
        "нагрузка": [0.4, 0.3, 0.3],
        "обороты_ротора": [0.4, 0.2, 0.4],
    },
    "default_weights": [0.4, 0.4, 0.2],
}


def _merge_nested_numeric_map(
    base: Dict[str, Dict[str, float]],
    patch: Any,
) -> Dict[str, Dict[str, float]]:
    if not isinstance(patch, dict):
        return base

    for name, limits in patch.items():
        if not isinstance(name, str) or not isinstance(limits, dict):
            continue

        current = dict(base.get(name, {}))
        for key in ("min", "max", "critical"):
            if key not in limits:
                continue
            try:
                current[key] = float(limits[key])
            except (TypeError, ValueError):
                continue

        if current:
            base[name] = current

    return base


def _load_ammad_context_config() -> Dict[str, Any]:
    config = deepcopy(DEFAULT_AMMAD_CONTEXT_CONFIG)
    if not AMMAD_CONTEXT_CONFIG_PATH.exists():
        return config

    try:
        loaded = json.loads(AMMAD_CONTEXT_CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception as error:  # noqa: BLE001
        print(f"[AMMAD] Failed to load config, using defaults: {error}")
        return config

    if not isinstance(loaded, dict):
        return config

    _merge_nested_numeric_map(config["safety_limits"], loaded.get("safety_limits"))
    _merge_nested_numeric_map(config["context_hard_windows"], loaded.get("context_hard_windows"))

    if isinstance(loaded.get("change_required_when_depth_grows"), list):
        config["change_required_when_depth_grows"] = [
            str(item)
            for item in loaded["change_required_when_depth_grows"]
            if isinstance(item, str)
        ]

    if isinstance(loaded.get("flat_tolerance"), dict):
        for key, value in loaded["flat_tolerance"].items():
            if not isinstance(key, str):
                continue
            try:
                config["flat_tolerance"][key] = float(value)
            except (TypeError, ValueError):
                continue

    if "depth_move_threshold" in loaded:
        try:
            config["depth_move_threshold"] = float(loaded["depth_move_threshold"])
        except (TypeError, ValueError):
            pass

    if "stall_window" in loaded:
        try:
            config["stall_window"] = max(2, int(loaded["stall_window"]))
        except (TypeError, ValueError):
            pass

    if isinstance(loaded.get("param_weights"), dict):
        for param_name, value in loaded["param_weights"].items():
            if not isinstance(param_name, str):
                continue
            if not isinstance(value, (list, tuple)) or len(value) != 3:
                continue
            try:
                config["param_weights"][param_name] = [
                    float(value[0]),
                    float(value[1]),
                    float(value[2]),
                ]
            except (TypeError, ValueError):
                continue

    if isinstance(loaded.get("default_weights"), (list, tuple)) and len(loaded["default_weights"]) == 3:
        try:
            config["default_weights"] = [
                float(loaded["default_weights"][0]),
                float(loaded["default_weights"][1]),
                float(loaded["default_weights"][2]),
            ]
        except (TypeError, ValueError):
            pass

    return config


_AMMAD_CONTEXT = _load_ammad_context_config()
SAFETY_LIMITS: Dict[str, Dict[str, float]] = _AMMAD_CONTEXT["safety_limits"]
CONTEXT_HARD_WINDOWS: Dict[str, Dict[str, float]] = _AMMAD_CONTEXT["context_hard_windows"]
CHANGE_REQUIRED_WHEN_DEPTH_GROWS: Set[str] = set(_AMMAD_CONTEXT["change_required_when_depth_grows"])
FLAT_TOLERANCE: Dict[str, float] = _AMMAD_CONTEXT["flat_tolerance"]
DEPTH_MOVE_THRESHOLD: float = float(_AMMAD_CONTEXT["depth_move_threshold"])
STALL_WINDOW: int = int(_AMMAD_CONTEXT["stall_window"])
PARAM_WEIGHTS: Dict[str, Tuple[float, float, float]] = {
    param: (float(weights[0]), float(weights[1]), float(weights[2]))
    for param, weights in _AMMAD_CONTEXT["param_weights"].items()
}
DEFAULT_PARAM_WEIGHTS: Tuple[float, float, float] = (
    float(_AMMAD_CONTEXT["default_weights"][0]),
    float(_AMMAD_CONTEXT["default_weights"][1]),
    float(_AMMAD_CONTEXT["default_weights"][2]),
)


# ==================== BASE METHODS ====================


async def z_score(data, window_size=Z_SCORE_WINDOW_SIZE, score_threshold=Z_SCORE_THRESHOLD):
    data_list = list(data)
    if len(data_list) <= window_size:
        return False
    window = data_list[-window_size - 1 : -1]
    current_value = data_list[-1]

    mean, std = np.mean(window), np.std(window)
    if std < 0.01:
        return False

    return bool(abs((current_value - mean) / std) > score_threshold)


async def lof(data, window_size=LOF_WINDOW_SIZE, score_threshold=LOF_SCORE_THRESHOLD):
    data_list = list(data)
    if len(data_list) <= window_size:
        return False
    window = data_list[-window_size - 1 : -1]
    last_value = data_list[-1]

    if all(abs(v - window[0]) < EPS for v in window) and abs(last_value - window[0]) < EPS:
        return False

    def local_reach_density(point, arr, k=K_LOF):
        distances = sorted([abs(x - point) for x in arr if x != point])
        if not distances:
            return 1.0
        k_dist = distances[k - 1] if len(distances) >= k else distances[-1]
        reach_dists = [max(abs(point - x), k_dist) for x in arr if x != point][:k]
        return 1.0 / max(np.mean(reach_dists), EPS)

    lrd_current = local_reach_density(last_value, window)
    distances = sorted([(i, abs(x - last_value)) for i, x in enumerate(window)], key=lambda x: x[1])
    k_nearest_indices = [idx for idx, _ in distances[:K_LOF]]
    neighbor_lrds = [local_reach_density(window[idx], window) for idx in k_nearest_indices]

    if not neighbor_lrds or lrd_current < EPS:
        return False
    return bool((np.mean(neighbor_lrds) / lrd_current) > score_threshold)


async def fft(data, window_size=FFT_WINDOW_SIZE, score_threshold=FFT_SCORE_THRESHOLD):
    data_list = list(data)
    if len(data_list) < window_size:
        return False

    window = np.array(data_list[-window_size:])
    window = window - np.mean(window)
    window_weighted = window * np.hanning(len(window))
    magnitudes = np.abs(np.fft.fft(window_weighted))
    total_energy = np.sum(magnitudes)

    if total_energy < EPS:
        return False

    high_freq_ratio = np.sum(magnitudes[len(magnitudes) // 4 : len(magnitudes) // 2]) / total_energy
    return bool(high_freq_ratio > score_threshold)


# ==================== HELPERS FOR AMMAD ====================


def _as_float(value: Any) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(number):
        return None
    return number


def _get_z_raw(data_list, window_size=Z_SCORE_WINDOW_SIZE) -> float:
    if len(data_list) <= window_size:
        return 0.0
    window = data_list[-window_size - 1 : -1]
    std = np.std(window)
    if std < 0.01:
        return 0.0
    return abs((data_list[-1] - np.mean(window)) / (std + EPS))


def _get_fft_raw(data_list, window_size=FFT_WINDOW_SIZE) -> float:
    if len(data_list) < window_size:
        return 0.0
    window = np.array(data_list[-window_size:])
    window = window - np.mean(window)
    magnitudes = np.abs(np.fft.fft(window * np.hanning(len(window))))
    total = np.sum(magnitudes)
    return np.sum(magnitudes[len(magnitudes) // 4 : len(magnitudes) // 2]) / (total + EPS)


def _is_flat_window(values: list[float], tolerance: float) -> bool:
    if len(values) < 2:
        return False
    return float(np.max(values) - np.min(values)) <= tolerance


def _is_active_drilling(context: Dict[str, Any]) -> bool:
    depth_delta = _as_float(context.get("depth_delta"))
    if depth_delta is not None and depth_delta > DEPTH_MOVE_THRESHOLD:
        return True

    speed_bur = _as_float(context.get("current_row", {}).get("скорость_бурения"))
    if speed_bur is not None and speed_bur > 0.05:
        return True

    return False


def _contextual_stall_violation(param_name: str, history: deque, context: Dict[str, Any]) -> bool:
    if param_name not in CHANGE_REQUIRED_WHEN_DEPTH_GROWS:
        return False
    if not _is_active_drilling(context):
        return False
    if len(history) < STALL_WINDOW:
        return False

    tolerance = FLAT_TOLERANCE.get(param_name, 1e-3)
    recent = [float(v) for v in list(history)[-STALL_WINDOW:]]
    if not _is_flat_window(recent, tolerance):
        return False

    depth_delta = _as_float(context.get("depth_delta"))
    return depth_delta is not None and depth_delta > DEPTH_MOVE_THRESHOLD


def _hard_window_violation(param_name: str, value: float) -> bool:
    if param_name == "глубина":
        # Depth is context/counter variable; outside historical window is not
        # automatically an anomaly for the signal itself.
        return False
    hard = CONTEXT_HARD_WINDOWS.get(param_name)
    if not hard:
        return False
    return bool(value < hard["min"] or value > hard["max"])


# ==================== AMMAD CLASS ====================


class AMMADDetector:
    def __init__(
        self,
        param_name: str,
        score_threshold: float = AMMAD_SCORE_THRESHOLD,
        window_size: int = AMMAD_WINDOW_SIZE,
    ):
        self.param_name = param_name
        self.history = deque(maxlen=300)
        self.param_weights = PARAM_WEIGHTS
        self.default_weights = DEFAULT_PARAM_WEIGHTS
        self.score_threshold = float(score_threshold)
        self.window_size = int(window_size)
        self.raw_alarm_history = deque(maxlen=AMMAD_PERSISTENCE_WINDOW)
        self.cooldown_left = 0

    def _emit_immediate_alarm_with_cooldown(self) -> bool:
        if self.cooldown_left > 0:
            self.cooldown_left -= 1
            return False

        self.cooldown_left = AMMAD_COOLDOWN_POINTS
        self.raw_alarm_history.clear()
        return True

    def _apply_persistence_and_cooldown(self, raw_alarm: bool) -> bool:
        self.raw_alarm_history.append(1 if raw_alarm else 0)
        if self.cooldown_left > 0:
            self.cooldown_left -= 1
            return False

        if len(self.raw_alarm_history) < AMMAD_PERSISTENCE_WINDOW:
            return False

        hits = int(sum(self.raw_alarm_history))
        if raw_alarm and hits >= AMMAD_PERSISTENCE_MIN_HITS:
            self.cooldown_left = AMMAD_COOLDOWN_POINTS
            return True
        return False

    async def detect(self, value: float, context: Dict[str, Any]) -> bool:
        self.history.append(value)
        h_list = list(self.history)

        # 1) Hard physical limits.
        limits = SAFETY_LIMITS.get(self.param_name, {})
        if "max" in limits and value > limits["max"]:
            return self._emit_immediate_alarm_with_cooldown()
        if "min" in limits and value < limits["min"]:
            return self._emit_immediate_alarm_with_cooldown()

        # 2) Data-driven contextual hard windows.
        hard_window_hit = _hard_window_violation(self.param_name, value)

        # 3) Context rule: depth grows, but critical channel is frozen.
        stall_hit = _contextual_stall_violation(self.param_name, self.history, context)

        if len(h_list) < 20:
            return self._apply_persistence_and_cooldown(stall_hit)

        # 4) Weighted hybrid score - compute detector results in parallel
        w_z, w_lof, w_fft = self.param_weights.get(self.param_name, self.default_weights)
        
        # Compute all detector results in parallel instead of sequentially
        z_result, lof_result, fft_result = await asyncio.gather(
            z_score(h_list, window_size=self.window_size),
            lof(h_list, window_size=self.window_size),
            fft(h_list, window_size=self.window_size),
        )
        
        z_raw = _get_z_raw(h_list)
        # Safe sigmoid computation
        try:
            z_exp = np.clip(-(z_raw - Z_SCORE_THRESHOLD), -500, 500)
            s_z = 1 / (1 + np.exp(z_exp))
        except (OverflowError, RuntimeWarning):
            s_z = 0.0 if z_raw < Z_SCORE_THRESHOLD else 1.0
        
        s_fft = min(1.0, _get_fft_raw(h_list, window_size=self.window_size) / (FFT_SCORE_THRESHOLD * 1.5 + EPS))
        s_lof = 1.0 if lof_result else 0.0

        final_score = (s_z * w_z) + (s_lof * w_lof) + (s_fft * w_fft)
        if hard_window_hit:
            final_score = min(1.0, final_score + 0.12)

        # 5) Consensus of base detectors - reuse already computed results
        orig_votes = sum(
            [
                1 if z_result else 0,
                1 if lof_result else 0,
                1 if fft_result else 0,
            ]
        )

        raw_alarm = bool(
            stall_hit
            or (orig_votes >= AMMAD_MIN_BASE_VOTES)
            or (final_score > self.score_threshold)
        )
        return self._apply_persistence_and_cooldown(raw_alarm)


# ==================== INTERFACE ====================

_ammad_detectors: Dict[str, AMMADDetector] = {}


def reset_ammad_detectors(detector_scope: Optional[str] = None) -> None:
    if detector_scope is None:
        _ammad_detectors.clear()
        return

    scope_prefix = f"{detector_scope}|"
    for key in [key for key in _ammad_detectors if key.startswith(scope_prefix)]:
        del _ammad_detectors[key]


async def ammad(data, **kwargs) -> bool:
    param_name = kwargs.get("param_name", "unknown")
    context = kwargs.get("context", {})
    window_size = int(kwargs.get("window_size", AMMAD_WINDOW_SIZE))
    score_threshold = float(kwargs.get("score_threshold", AMMAD_SCORE_THRESHOLD))
    detector_scope = str(kwargs.get("detector_scope", "default"))
    detector_key = f"{detector_scope}|{param_name}|w{window_size}|t{score_threshold:.5f}"

    if detector_key not in _ammad_detectors:
        _ammad_detectors[detector_key] = AMMADDetector(
            param_name=param_name,
            score_threshold=score_threshold,
            window_size=window_size,
        )

    current_val = data[-1] if hasattr(data, "__len__") else data
    return await _ammad_detectors[detector_key].detect(float(current_val), context)


METHODS = {
    "z_score": z_score,
    "lof": lof,
    "fft": fft,
    "ammad": ammad,
}
