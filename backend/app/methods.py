from collections import deque
from typing import Dict
import numpy as np

# ==================== КОНСТАНТЫ ====================

Z_SCORE_THRESHOLD = 3.0
LOF_SCORE_THRESHOLD = 25.0
FFT_SCORE_THRESHOLD = 0.30
AMMAD_SCORE_THRESHOLD = 0.75

Z_SCORE_WINDOW_SIZE = 30
LOF_WINDOW_SIZE = 60
FFT_WINDOW_SIZE = 64
AMMAD_WINDOW_SIZE = 32

K_LOF = 5
EPS = 1e-10

# Физические пределы, адаптированные под статистику (убираем приборный шум < 0)
SAFETY_LIMITS = {
    "скорость_спо": {"min": -0.1, "max": 2.5, "critical": 2.0},      # Факт макс: 1.75
    "скорость_бурения": {"min": 0, "max": 35, "critical": 30},       # Факт макс: 24.9
    "дмк": {"min": 0, "max": 100, "critical": 90},                   # Факт макс: 79.7
    "нагрузка": {"min": -10, "max": 20, "critical": 15},             # Факт: от -3.9 до 9.9
    "обороты_ротора": {"min": 0, "max": 100, "critical": 80},        # Факт макс: 45.8
    "момент_ротора": {"min": 0, "max": 25, "critical": 22},          # Факт макс: 18.9
    "расход_на_входе": {"min": 0, "max": 25, "critical": 20},        # Факт макс: 16.0
    "давление_на_входе": {"min": 0, "max": 400, "critical": 350},    # Факт макс: 335.8
    "температура_на_выходе": {"min": 5, "max": 50, "critical": 45},  # Факт макс: 34.5
    "вес_на_крюке": {"min": 10, "max": 150, "critical": 130},       # Факт макс: 117.5
    "уровень_в_емкости": {"min": 0.5, "max": 2.5, "critical": 2.2},  # Факт макс: 1.95
    "глубина": {"min": 0, "max": 10000, "critical": 9000},
}

# ==================== ОРИГИНАЛЬНЫЕ МЕТОДЫ ====================

async def z_score(data, window_size=Z_SCORE_WINDOW_SIZE, score_threshold=Z_SCORE_THRESHOLD):
    data_list = list(data)
    if len(data_list) <= window_size: return False
    window = data_list[-window_size - 1:-1]
    current_value = data_list[-1]
    
    mean, std = np.mean(window), np.std(window)
    # Защита от "мертвого нуля": если std ничтожно мал, игнорируем шум датчика
    if std < 0.01: return False 
    
    return bool(abs((current_value - mean) / std) > score_threshold)

async def lof(data, window_size=LOF_WINDOW_SIZE, score_threshold=LOF_SCORE_THRESHOLD):
    data_list = list(data)
    if len(data_list) <= window_size: return False
    window = data_list[-window_size - 1:-1]
    last_value = data_list[-1]
    
    if all(abs(v - window[0]) < EPS for v in window) and abs(last_value - window[0]) < EPS:
        return False

    def local_reach_density(point, arr, k=K_LOF):
        distances = sorted([abs(x - point) for x in arr if x != point])
        if not distances: return 1.0
        k_dist = distances[k-1] if len(distances) >= k else distances[-1]
        reach_dists = [max(abs(point - x), k_dist) for x in arr if x != point][:k]
        return 1.0 / max(np.mean(reach_dists), EPS)

    lrd_current = local_reach_density(last_value, window)
    distances = sorted([(i, abs(x - last_value)) for i, x in enumerate(window)], key=lambda x: x[1])
    k_nearest_indices = [idx for idx, _ in distances[:K_LOF]]
    neighbor_lrds = [local_reach_density(window[idx], window) for idx in k_nearest_indices]
    
    if not neighbor_lrds or lrd_current < EPS: return False
    return bool((np.mean(neighbor_lrds) / lrd_current) > score_threshold)

async def fft(data, window_size=FFT_WINDOW_SIZE, score_threshold=FFT_SCORE_THRESHOLD):
    data_list = list(data)
    if len(data_list) < window_size: return False
    window = np.array(data_list[-window_size:])
    # Очистка от постоянной составляющей для лучшего выделения ритма
    window = window - np.mean(window)
    window_weighted = window * np.hanning(len(window))
    magnitudes = np.abs(np.fft.fft(window_weighted))
    total_energy = np.sum(magnitudes)
    if total_energy < EPS: return False
    high_freq_ratio = np.sum(magnitudes[len(magnitudes)//4:len(magnitudes)//2]) / total_energy
    return bool(high_freq_ratio > score_threshold)

# ==================== ВНУТРЕННИЕ ХЕЛПЕРЫ ДЛЯ AMMAD ====================

def _get_z_raw(data_list, window_size=Z_SCORE_WINDOW_SIZE) -> float:
    if len(data_list) <= window_size: return 0.0
    window = data_list[-window_size - 1:-1]
    std = np.std(window)
    if std < 0.01: return 0.0 # Порог шума
    return abs((data_list[-1] - np.mean(window)) / (std + EPS))

def _get_fft_raw(data_list, window_size=FFT_WINDOW_SIZE) -> float:
    if len(data_list) < window_size: return 0.0
    window = np.array(data_list[-window_size:])
    window = window - np.mean(window)
    magnitudes = np.abs(np.fft.fft(window * np.hanning(len(window))))
    total = np.sum(magnitudes)
    return np.sum(magnitudes[len(magnitudes)//4:len(magnitudes)//2]) / (total + EPS)

# ==================== КЛАСС AMMAD ====================

class AMMADDetector:
    def __init__(self, param_name: str):
        self.param_name = param_name
        self.history = deque(maxlen=300)
        # Адаптивные веса на основе твоей статистики (Z, LOF, FFT)
        self.param_weights = {
            # Группа 1: Динамичные/Шумные (приоритет LOF и FFT)
            "скорость_спо":           (0.2, 0.4, 0.4),
            "скорость_бурения":       (0.2, 0.4, 0.4),
            "момент_ротора":          (0.3, 0.4, 0.3),
            "дмк":                    (0.3, 0.5, 0.2), # Добавили: ДМК часто "дребезжит"
            
            # Группа 2: Стабильные/Линейные (приоритет Z-score)
            "глубина":                (0.8, 0.1, 0.1),
            "вес_на_крюке":           (0.7, 0.2, 0.1),
            "температура_на_выходе":  (0.8, 0.2, 0.0),
            
            # Группа 3: Гидравлика (Баланс Z и LOF)
            "давление_на_входе":      (0.5, 0.4, 0.1), 
            "расход_на_входе":        (0.6, 0.3, 0.1),
            "уровень_в_емкости":      (0.4, 0.5, 0.1),
            
            # Группа 4: Осевые параметры (Склонны к вибрациям)
            "нагрузка":               (0.4, 0.3, 0.3), # Добавили: FFT важен для выявления вибраций долота
            "обороты_ротора":         (0.4, 0.2, 0.4), # Поправили: FFT подняли до 0.4 для фиксации резонанса
        }
        self.default_weights = (0.4, 0.4, 0.2)

    async def detect(self, value: float, context: Dict) -> bool:
        self.history.append(value)
        h_list = list(self.history)
        if len(h_list) < 20: return False

        # 1. Проверка лимитов безопасности (база данных)
        limits = SAFETY_LIMITS.get(self.param_name, {})
        if "max" in limits and value > limits["max"]: return True
        if "min" in limits and value < limits["min"]: return True

        # 2. Расчет весов
        w_z, w_lof, w_fft = self.param_weights.get(self.param_name, self.default_weights)
        
        # 3. Нормализация сигналов
        s_z = 1 / (1 + np.exp(-(_get_z_raw(h_list) - Z_SCORE_THRESHOLD)))
        s_fft = min(1.0, _get_fft_raw(h_list) / (FFT_SCORE_THRESHOLD * 1.5 + EPS))
        s_lof = 1.0 if await lof(h_list) else 0.0

        final_score = (s_z * w_z) + (s_lof * w_lof) + (s_fft * w_fft)
        
        # 4. Консенсус оригинальных методов (голосование 2 из 3)
        orig_votes = sum([
            1 if await z_score(h_list) else 0,
            1 if await lof(h_list) else 0,
            1 if await fft(h_list) else 0
        ])
        
        if orig_votes >= 2: return True
        return bool(final_score > AMMAD_SCORE_THRESHOLD)

# ==================== ИНТЕРФЕЙС ====================

_ammad_detectors: Dict[str, AMMADDetector] = {}

async def ammad(data, **kwargs) -> bool:
    param_name = kwargs.get("param_name", "unknown")
    context = kwargs.get("context", {})
    if param_name not in _ammad_detectors:
        _ammad_detectors[param_name] = AMMADDetector(param_name)
    
    # Берем последнюю точку данных
    current_val = data[-1] if hasattr(data, '__len__') else data
    return await _ammad_detectors[param_name].detect(current_val, context)

METHODS = {
    "z_score": z_score,
    "lof": lof,
    "fft": fft,
    "ammad": ammad,
}