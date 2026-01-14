"""
Anomaly detection methods for WellPro backend.
Optimized based on statistical analysis of 12 key drilling parameters.
Special configuration based on actual data statistics.
"""

import heapq
import math
from collections import deque
from typing import Dict, List, Optional, Tuple, Any
import numpy as np

# ==================== КОНСТАНТЫ ====================

# Оптимизированные пороговые значения на основе статистик данных
Z_SCORE_THRESHOLD = 3.0
LOF_SCORE_THRESHOLD = 25.0  # Уменьшен из-за высокой волатильности данных
FFT_SCORE_THRESHOLD = 0.25  # Увеличен для более строгой проверки шума
AMMAD_SCORE_THRESHOLD = 0.85

# Оптимизированные размеры окон на основе статистик
Z_SCORE_WINDOW_SIZE = 30
LOF_WINDOW_SIZE = 60  # Уменьшен для более быстрого реагирования
FFT_WINDOW_SIZE = 64
AMMAD_WINDOW_SIZE = 40  # Увеличен для стабильности

K_LOF = 5
EPS = 1e-10

# Физические пределы для параметров бурения (на основе анализа данных)
SAFETY_LIMITS = {
    "давление_на_входе": {
        "min": 0,           # бар (нормальный диапазон)
        "max": 400,         # бар (максимально допустимое)
        "critical": 350     # бар (критическое значение)
    },
    "температура_на_выходе": {
        "min": 10,          # °C (минимальная рабочая)
        "max": 50,          # °C (максимальная рабочая)
        "critical": 45      # °C (опасная температура)
    },
    "момент_ротора": {
        "min": 0,           # кНм
        "max": 20,          # кНм (максимум из данных 18.93)
        "critical": 15      # кНм (опасный момент)
    },
    "скорость_бурения": {
        "min": 0,           # м/ч
        "max": 25,          # м/ч (максимум из данных 24.93)
        "critical": 20      # м/ч (опасная скорость)
    },
    "вес_на_крюке": {
        "min": 20,          # тонн (минимум из данных 20.33)
        "max": 120,         # тонн (максимум из данных 117.52)
        "critical": 100     # тонн (опасный вес)
    },
    "глубина": {
        "min": 3430,        # метров (минимальная из данных)
        "max": 3500,        # метров (максимальная из данных)
        "critical": 0       # для проверки уменьшения
    },
    "обороты_ротора": {
        "min": 0,           # об/мин
        "max": 50,          # об/мин (максимум из данных 45.90)
        "critical": 40      # об/мин (опасные обороты)
    },
    "уровень_в_емкости": {
        "min": 0.5,         # усл.ед.
        "max": 2.0,         # усл.ед. (максимум из данных 1.96)
        "critical": 1.8     # усл.ед. (критический уровень)
    },
    "расход_на_входе": {
        "min": 0,           # л/с или м³/ч
        "max": 20,          # (максимум из данных 16.07)
        "critical": 15      # опасный расход
    },
    "нагрузка": {
        "min": -5,          # тонн (минимальная из данных -3.99)
        "max": 10,          # тонн (максимум из данных 9.97)
        "critical": 8       # тонн (опасная нагрузка)
    },
}

# ==================== СУЩЕСТВУЮЩИЕ МЕТОДЫ ====================

async def z_score(data, window_size=Z_SCORE_WINDOW_SIZE, score_threshold=Z_SCORE_THRESHOLD):
    """
    Z-score метод обнаружения аномалий.
    Оптимизированные параметры: окно=30, порог=3.0
    """
    if len(data) <= window_size:
        return False
    
    window = list(data)[-window_size - 1:-1]
    current_value = data[-1]
    
    mean = np.mean(window)
    std = np.std(window)
    
    if std < EPS:
        return False
    
    z_score_value = abs((current_value - mean) / std)
    return z_score_value > score_threshold


async def lof(data, window_size=LOF_WINDOW_SIZE, score_threshold=LOF_SCORE_THRESHOLD):
    """
    Local Outlier Factor (LOF) метод.
    Оптимизированные параметры: окно=60, порог=25.0
    """
    if len(data) <= window_size:
        return False

    window = list(data)[-window_size - 1:-1]
    last_value = data[-1]

    # Проверка на одинаковые значения
    if all(abs(v - window[0]) < EPS for v in window) and abs(last_value - window[0]) < EPS:
        return False

    def reachability_distance(point, neighbor, k_distance):
        return max(abs(point - neighbor), k_distance)

    def local_reach_density(point, arr, k=K_LOF):
        # Находим k ближайших соседей
        distances = [abs(x - point) for x in arr if x != point]
        if len(distances) < k:
            return 1.0
        
        distances.sort()
        k_distance = distances[k-1] if k-1 < len(distances) else distances[-1]
        
        # Вычисляем reachability distances
        reach_dists = [reachability_distance(point, x, k_distance) for x in arr if x != point][:k]
        
        if not reach_dists:
            return 1.0
        
        mean_reach_dist = np.mean(reach_dists)
        return 1.0 / max(mean_reach_dist, EPS)

    # Вычисляем LRD для текущей точки
    lrd_current = local_reach_density(last_value, window)
    
    # Находим k ближайших соседей
    distances = [(i, abs(x - last_value)) for i, x in enumerate(window)]
    distances.sort(key=lambda x: x[1])
    k_nearest_indices = [idx for idx, _ in distances[:K_LOF]]
    
    # Вычисляем среднее LRD соседей
    neighbor_lrds = []
    for idx in k_nearest_indices:
        neighbor_point = window[idx]
        lrd_neighbor = local_reach_density(neighbor_point, window)
        neighbor_lrds.append(lrd_neighbor)
    
    if not neighbor_lrds:
        return False
    
    avg_neighbor_lrd = np.mean(neighbor_lrds)
    
    # Вычисляем LOF
    if lrd_current < EPS:
        return False
    
    lof_score = avg_neighbor_lrd / lrd_current
    return lof_score > score_threshold


async def fft(data, window_size=FFT_WINDOW_SIZE, score_threshold=FFT_SCORE_THRESHOLD):
    """
    FFT метод обнаружения аномалий.
    Оптимизированные параметры: окно=64, порог=0.25
    """
    if len(data) < window_size:
        return False
    
    window = np.array(data[-window_size:])
    
    # Применяем окно Ханна для уменьшения эффектов краев
    hann_window = np.hanning(len(window))
    window_weighted = window * hann_window
    
    # Вычисляем FFT
    fft_vals = np.fft.fft(window_weighted)
    magnitudes = np.abs(fft_vals)
    
    total_energy = np.sum(magnitudes)
    if total_energy < EPS:
        return False
    
    # Анализируем высокочастотные компоненты (от 1/4 до 1/2 частоты Найквиста)
    high_freq_start = max(1, len(magnitudes) // 4)
    high_freq_end = len(magnitudes) // 2
    high_freq_energy = np.sum(magnitudes[high_freq_start:high_freq_end])
    
    high_freq_ratio = high_freq_energy / total_energy
    return high_freq_ratio > score_threshold

# ==================== AMMAD МЕТОД (ОПТИМИЗИРОВАННЫЙ) ====================

class AMMADDetector:
    """
    Adaptive Multi-Method Anomaly Detection (AMMAD)
    Гибридный адаптивный метод для параметров бурения.
    Оптимизирован на основе статистик 12 ключевых параметров.
    """
    
    def __init__(self, param_name: str):
        self.param_name = param_name
        self.signal_history: deque = deque(maxlen=300)  # Увеличен размер истории
        self.anomaly_history: deque = deque(maxlen=100)
        
        # Конфигурация для параметра на основе статистик
        self.config = self._get_param_config(param_name)
        
        # Счетчики
        self.detection_count = 0
        self.adaptive_updates = 0
        
        # Специальные поля
        self.last_value = None
        self.value_trend = 0.0
        self.variance_history = deque(maxlen=50)
        
        print(f"[AMMAD] Инициализирован детектор для параметра: {param_name}")
    
    def _get_param_config(self, param_name: str) -> Dict:
        """Получение конфигурации для конкретного параметра на основе статистик."""
        base_config = {
            "min_history": 40,
            "max_history": 300,
            "strict_mode": True,
            "weight_decay": 0.95,
        }
        
        # Конфигурация на основе статистик из данных
        param_configs = {
            # Глубина - стабильный параметр с низким CV
            "глубина": {
            "z_weight": 0.1,           # ⬇ Уменьшить (было 0.3)
            "lof_weight": 0.1,         # ⬇ Уменьшить (было 0.2)
            "fft_weight": 0.8,         # ⬆ Увеличить для шума (было 0.5)
            "inertia": "very_high",
            "max_change_rate": 5.0,
            "min_change_rate": 0.01,
            "allow_monotonic_increase": True,
            "require_consensus": True,
            "confidence_threshold": 0.98,  # ⬆ Увеличить (было 0.95)
            "depth_specific": True,
            "stability_coefficient": 0.1,  # Очень стабильный
        },
            
            # Скорость бурения - высокий CV (2.01), волатильный
            "скорость_бурения": {
                "z_weight": 0.5,          # Средний вес Z-score
                "lof_weight": 0.4,        # Средний вес LOF
                "fft_weight": 0.1,        # Низкий вес FFT
                "inertia": "low",         # Низкая инерционность
                "max_change_rate": 10.0,  # Высокая допустимая скорость изменения
                "noise_threshold": 0.5,   # Порог шума
                "require_consensus": False,
                "confidence_threshold": 0.8,
                "stability_coefficient": 2.0,  # Высокий CV
            },
            
            # Давление на входе - средний CV (0.73)
            "давление_на_входе": {
                "z_weight": 0.4,
                "lof_weight": 0.3,
                "fft_weight": 0.3,
                "inertia": "medium",
                "max_change_rate": 50.0,  # Быстрые изменения давления возможны
                "pressure_spike": 30.0,   # Порог скачка давления
                "require_consensus": True,
                "confidence_threshold": 0.85,
                "stability_coefficient": 0.7,
            },
            
            # Вес на крюке - средний CV (0.39)
            "вес_на_крюке": {
                "z_weight": 0.4,
                "lof_weight": 0.4,
                "fft_weight": 0.2,
                "inertia": "high",
                "max_change_rate": 10.0,
                "stability_threshold": 5.0,
                "require_consensus": True,
                "confidence_threshold": 0.9,
                "stability_coefficient": 0.4,
            },
            
            # Момент ротора - высокий CV (1.12)
            "момент_ротора": {
                "z_weight": 0.6,
                "lof_weight": 0.3,
                "fft_weight": 0.1,
                "inertia": "medium",
                "max_change_rate": 5.0,
                "torque_spike": 3.0,
                "require_consensus": False,
                "confidence_threshold": 0.8,
                "stability_coefficient": 1.1,
            },
            
            # Обороты ротора - высокий CV (1.17)
            "обороты_ротора": {
                "z_weight": 0.5,
                "lof_weight": 0.4,
                "fft_weight": 0.1,
                "inertia": "very_low",
                "max_change_rate": 10.0,
                "rpm_spike": 5.0,
                "require_consensus": False,
                "confidence_threshold": 0.75,
                "stability_coefficient": 1.2,
            },
            
            # Уровень в емкости - очень низкий CV (0.085), очень стабильный
            "уровень_в_емкости": {
                "z_weight": 0.7,          # Высокий вес Z-score
                "lof_weight": 0.2,        # Низкий вес LOF
                "fft_weight": 0.1,        # Низкий вес FFT
                "inertia": "very_high",
                "max_change_rate": 0.1,   # Очень медленные изменения
                "stability_threshold": 0.05,
                "require_consensus": True,
                "confidence_threshold": 0.98,  # Очень высокий порог
                "stability_coefficient": 0.1,
            },
            
            # ДМК - очень высокий CV (1.69)
            "дмк": {
                "z_weight": 0.3,
                "lof_weight": 0.6,
                "fft_weight": 0.1,
                "inertia": "low",
                "max_change_rate": 10.0,
                "require_consensus": False,
                "confidence_threshold": 0.75,
                "stability_coefficient": 1.7,
            },
            
            # Нагрузка - высокий CV (1.26)
            "нагрузка": {
                "z_weight": 0.4,
                "lof_weight": 0.5,
                "fft_weight": 0.1,
                "inertia": "medium",
                "max_change_rate": 3.0,
                "require_consensus": False,
                "confidence_threshold": 0.8,
                "stability_coefficient": 1.3,
            },
            
            # Расход на входе - средний CV (0.80)
            "расход_на_входе": {
                "z_weight": 0.4,
                "lof_weight": 0.3,
                "fft_weight": 0.3,
                "inertia": "medium",
                "max_change_rate": 5.0,
                "flow_spike": 3.0,
                "require_consensus": True,
                "confidence_threshold": 0.85,
                "stability_coefficient": 0.8,
            },
            
            # Температура на выходе - средний CV (0.40)
            "температура_на_выходе": {
                "z_weight": 0.3,
                "lof_weight": 0.4,
                "fft_weight": 0.3,
                "inertia": "high",
                "max_change_rate": 2.0,   # Температура меняется медленно
                "max_gradient": 0.5,
                "require_consensus": True,
                "confidence_threshold": 0.9,
                "stability_coefficient": 0.4,
            },
            
            # Скорость СПО - очень высокий CV (5.41)
            "скорость_спо": {
                "z_weight": 0.2,
                "lof_weight": 0.7,
                "fft_weight": 0.1,
                "inertia": "very_low",
                "max_change_rate": 0.5,
                "require_consensus": False,
                "confidence_threshold": 0.7,
                "stability_coefficient": 5.4,
            },
        }
        
        if param_name in param_configs:
            return {**base_config, **param_configs[param_name]}
        else:
            # Конфигурация по умолчанию для неизвестных параметров
            return {
                **base_config,
                "z_weight": 0.4,
                "lof_weight": 0.4,
                "fft_weight": 0.2,
                "inertia": "medium",
                "require_consensus": True,
                "confidence_threshold": 0.85,
                "stability_coefficient": 1.0,
            }
    
    def _calculate_signal_statistics(self) -> Dict:
        """Вычисление статистик сигнала с учетом специфики параметра."""
        if len(self.signal_history) < self.config["min_history"]:
            return {
                "cv": 0.0, 
                "stationarity": 1.0, 
                "noise_level": 0.0, 
                "trend": 0.0,
                "mean": 0.0,
                "std": 0.0,
                "range": 0.0
            }
        
        values = np.array(list(self.signal_history))
        
        mean_val = np.mean(values)
        std_val = np.std(values)
        cv = std_val / (abs(mean_val) + EPS)
        
        # Стационарность (скользящая дисперсия)
        if len(values) >= 60:
            # Разбиваем на 3 сегмента
            segment_size = len(values) // 3
            variances = []
            for i in range(3):
                start_idx = i * segment_size
                end_idx = start_idx + segment_size if i < 2 else len(values)
                segment = values[start_idx:end_idx]
                if len(segment) > 10:
                    variances.append(np.var(segment))
            
            if len(variances) >= 2:
                max_var = max(variances)
                min_var = min(variances)
                stationarity = 1.0 - (max_var - min_var) / (max_var + EPS)
            else:
                stationarity = 0.8
        else:
            stationarity = 0.8
        
        # Уровень шума (стандартное отклонение разностей)
        if len(values) >= 10:
            diffs = np.diff(values)
            noise_level = np.std(diffs) / (abs(mean_val) + EPS)
        else:
            noise_level = 0.0
        
        # Тренд
        if len(values) >= 20:
            x = np.arange(len(values))
            slope, _ = np.polyfit(x, values, 1)
            trend = slope / (abs(mean_val) + EPS)
            self.value_trend = slope
        else:
            trend = 0.0
        
        # Диапазон значений
        value_range = np.max(values) - np.min(values) if len(values) > 0 else 0.0
        
        return {
            "cv": cv,
            "stationarity": stationarity,
            "noise_level": noise_level,
            "trend": trend,
            "mean": mean_val,
            "std": std_val,
            "range": value_range,
            "values": values,
        }
    
    def _calculate_adaptive_weights(self, stats: Dict) -> Tuple[float, float, float]:
        """Расчет адаптивных весов методов на основе статистик сигнала."""
        z_base = self.config.get("z_weight", 0.4)
        lof_base = self.config.get("lof_weight", 0.4)
        fft_base = self.config.get("fft_weight", 0.2)
        
        # Балансировка весов на основе характеристик сигнала
        stability_coeff = self.config.get("stability_coefficient", 1.0)
        
        # Для стабильных сигналов (низкий CV) увеличиваем вес Z-score
        if stability_coeff < 0.5:  # Очень стабильные
            z_base *= 1.5
            lof_base *= 0.7
            fft_base *= 0.8
        elif stability_coeff < 1.0:  # Стабильные
            z_base *= 1.2
            lof_base *= 0.9
        elif stability_coeff > 2.0:  # Очень волатильные
            z_base *= 0.6
            lof_base *= 1.4
            fft_base *= 1.0
        elif stability_coeff > 1.0:  # Волатильные
            z_base *= 0.8
            lof_base *= 1.2
        
        # Корректировка на основе текущих статистик
        if stats["stationarity"] < 0.6:  # Нестационарный сигнал
            fft_base *= 1.3
            z_base *= 0.8
        
        if stats["noise_level"] > 0.3:  # Шумный сигнал
            fft_base *= 1.5
            z_base *= 0.6
        
        if abs(stats["trend"]) > 0.01:  # Сильный тренд
            lof_base *= 1.3
            fft_base *= 0.7
        
        # Нормализация весов
        z_weight = z_base
        lof_weight = lof_base
        fft_weight = fft_base
        
        total = z_weight + lof_weight + fft_weight + EPS
        z_weight /= total
        lof_weight /= total
        fft_weight /= total
        
        # Учет инерционности параметра
        inertia = self.config.get("inertia", "medium")
        inertia_factors = {
            "very_high": (1.4, 0.7, 0.6),
            "high": (1.2, 0.9, 0.8),
            "medium": (1.0, 1.0, 1.0),
            "low": (0.8, 1.3, 1.2),
            "very_low": (0.6, 1.5, 1.4),
        }
        
        if inertia in inertia_factors:
            z_fact, lof_fact, fft_fact = inertia_factors[inertia]
            z_weight *= z_fact
            lof_weight *= lof_fact
            fft_weight *= fft_fact
            
            total = z_weight + lof_weight + fft_weight + EPS
            z_weight /= total
            lof_weight /= total
            fft_weight /= total
        
        return z_weight, lof_weight, fft_weight
    
    async def _calculate_individual_scores(self, value: float) -> Tuple[float, float, float]:
        """Вычисление оценок от каждого метода."""
        if len(self.signal_history) < 20:
            return 0.0, 1.0, 0.0
        
        # Подготовка данных для всех методов
        all_data = list(self.signal_history) + [value]
        
        # 1. Z-score
        if len(all_data) > Z_SCORE_WINDOW_SIZE:
            window = all_data[-Z_SCORE_WINDOW_SIZE - 1:-1]
            mean = np.mean(window)
            std = np.std(window)
            
            if std > EPS:
                z_score_val = abs((value - mean) / std)
                # Корректировка для параметров с трендом
                if abs(self.value_trend) > 0:
                    expected = mean + self.value_trend
                    if abs(value - expected) < std * 2:
                        z_score_val *= 0.7  # Уменьшаем оценку если значение в ожидаемом диапазоне
            else:
                z_score_val = 0.0
        else:
            z_score_val = 0.0
        
        # 2. LOF (упрощенный)
        if len(all_data) > LOF_WINDOW_SIZE:
            window = all_data[-LOF_WINDOW_SIZE - 1:-1]
            k = min(K_LOF, max(3, len(window) // 15))
            
            # Расстояния до всех точек окна
            distances = [abs(x - value) for x in window]
            if distances:
                # k ближайших соседей
                nearest_dists = sorted(distances)[:k]
                if nearest_dists:
                    avg_nearest_dist = np.mean(nearest_dists)
                    local_density = 1.0 / (avg_nearest_dist + EPS)
                    
                    # Оцениваем плотность соседей
                    neighbor_densities = []
                    for i, point in enumerate(window[:20]):  # Проверяем 20 случайных соседей
                        point_dists = [abs(x - point) for j, x in enumerate(window) if j != i]
                        if point_dists:
                            point_nearest = sorted(point_dists)[:k]
                            neighbor_densities.append(1.0 / (np.mean(point_nearest) + EPS))
                    
                    if neighbor_densities:
                        avg_neighbor_density = np.mean(neighbor_densities)
                        lof_score = avg_neighbor_density / (local_density + EPS)
                    else:
                        lof_score = 1.0
                else:
                    lof_score = 1.0
            else:
                lof_score = 1.0
        else:
            lof_score = 1.0
        
        # 3. FFT
        if len(all_data) >= FFT_WINDOW_SIZE:
            window_fft = all_data[-FFT_WINDOW_SIZE:]
            hann_window = np.hanning(len(window_fft))
            window_weighted = np.array(window_fft) * hann_window
            
            fft_vals = np.fft.fft(window_weighted)
            magnitudes = np.abs(fft_vals)
            
            total_energy = np.sum(magnitudes)
            if total_energy > EPS:
                # Высокочастотные компоненты (шум)
                high_freq_start = max(1, len(magnitudes) // 4)
                high_freq_end = len(magnitudes) // 2
                high_freq_energy = np.sum(magnitudes[high_freq_start:high_freq_end])
                fft_score = high_freq_energy / total_energy
            else:
                fft_score = 0.0
        else:
            fft_score = 0.0
        
        return z_score_val, lof_score, fft_score
    
    def _normalize_scores(self, z_score: float, lof_score: float, fft_score: float) -> Tuple[float, float, float]:
        """Нормализация оценок методов."""
        # Нормализация Z-score (сигмоида)
        z_norm = 1.0 / (1.0 + np.exp(-(z_score - Z_SCORE_THRESHOLD) / 1.5))
        
        # Нормализация LOF (логарифмическая)
        if lof_score <= 1.0:
            lof_norm = 0.0
        else:
            lof_norm = min(1.0, np.log1p(lof_score - 1.0) / np.log1p(LOF_SCORE_THRESHOLD - 1.0))
        
        # Нормализация FFT (линейная)
        fft_norm = min(1.0, fft_score / FFT_SCORE_THRESHOLD)
        
        return z_norm, lof_norm, fft_norm
    
    def _detect_special_cases(self, value: float, stats: Dict) -> Optional[bool]:
        """Обнаружение специальных случаев."""
        if len(self.signal_history) < 10:
            return None
        
        # Проверка физических пределов
        if self.param_name in SAFETY_LIMITS:
            limits = SAFETY_LIMITS[self.param_name]
            
            # Проверка минимального значения
            if "min" in limits and value < limits["min"]:
                return True
            
            # Проверка максимального значения
            if "max" in limits and value > limits["max"]:
                return True
            
            # Проверка критического значения
            if "critical" in limits and value > limits["critical"]:
                return True
        
        # Проверка скорости изменения
        if self.last_value is not None:
            rate_of_change = abs(value - self.last_value)
            
            max_rate = self.config.get("max_change_rate")
            if max_rate is not None and rate_of_change > max_rate:
                return True
            
            # Проверка на резкие скачки для специфичных параметров
            if "давлен" in self.param_name:
                pressure_spike = self.config.get("pressure_spike", 20.0)
                if rate_of_change > pressure_spike:
                    return True
            
            if "момент" in self.param_name:
                torque_spike = self.config.get("torque_spike", 2.0)
                if rate_of_change > torque_spike:
                    return True
        
        self.last_value = value
        return None
    
    async def detect(self, value: float, strict_mode: bool = None, confidence_threshold: float = None) -> bool:
        """
        Основной метод обнаружения аномалии.
        """
        self.signal_history.append(value)
        
        # Используем настройки из конфига
        if strict_mode is None:
            strict_mode = self.config.get("strict_mode", True)
        
        if confidence_threshold is None:
            confidence_threshold = self.config.get("confidence_threshold", AMMAD_SCORE_THRESHOLD)
        
        # Проверка минимальной истории
        if len(self.signal_history) < self.config["min_history"]:
            return False
        
        # Расчет статистик
        stats = self._calculate_signal_statistics()
        
        # Проверка специальных случаев
        special_case = self._detect_special_cases(value, stats)
        if special_case is not None:
            if special_case:
                self.anomaly_history.append(True)
                self.detection_count += 1
            return special_case
        
        # Расчет весов и оценок
        z_weight, lof_weight, fft_weight = self._calculate_adaptive_weights(stats)
        z_raw, lof_raw, fft_raw = await self._calculate_individual_scores(value)
        z_norm, lof_norm, fft_norm = self._normalize_scores(z_raw, lof_raw, fft_raw)
        
        # Финальная оценка
        final_score = (
            z_norm * z_weight +
            lof_norm * lof_weight +
            fft_norm * fft_weight
        )
        
        # Логика принятия решения
        is_anomaly = False
        
        if self.config.get("require_consensus", True):
            # Требуется согласие методов
            anomaly_votes = 0
            if z_norm > 0.7:
                anomaly_votes += 1
            if lof_norm > 0.7:
                anomaly_votes += 1
            if fft_norm > 0.7:
                anomaly_votes += 1
            
            # Решение на основе голосования и финальной оценки
            if anomaly_votes >= 2 and final_score >= confidence_threshold:
                is_anomaly = True
            elif final_score >= confidence_threshold + 0.15:  # Очень высокая уверенность
                is_anomaly = True
        else:
            # Более мягкая логика для волатильных параметров
            if final_score >= confidence_threshold:
                is_anomaly = True
            elif max(z_norm, lof_norm, fft_norm) > 0.9 and final_score > confidence_threshold - 0.1:
                is_anomaly = True
        
        # Сохранение результата
        self.anomaly_history.append(is_anomaly)
        if is_anomaly:
            self.detection_count += 1
        
        return is_anomaly
    
    def get_stats(self) -> Dict:
        """Получение статистик детектора."""
        return {
            "param_name": self.param_name,
            "history_size": len(self.signal_history),
            "anomaly_count": self.detection_count,
            "config": self.config,
            "value_trend": self.value_trend,
        }

# Глобальный словарь детекторов AMMAD
_ammad_detectors: Dict[str, AMMADDetector] = {}

async def ammad(data, window_size=AMMAD_WINDOW_SIZE, score_threshold=AMMAD_SCORE_THRESHOLD, **kwargs):
    """
    AMMAD метод обнаружения аномалий.
    """
    param_name = kwargs.get("param_name", "unknown")
    
    if param_name not in _ammad_detectors:
        _ammad_detectors[param_name] = AMMADDetector(param_name)
    
    detector = _ammad_detectors[param_name]
    
    if len(data) < 20:
        return False
    
    latest_value = data[-1]
    
    try:
        # Используем строгий режим с адаптивным порогом
        is_anomaly = await detector.detect(
            latest_value,
            confidence_threshold=score_threshold
        )
        return is_anomaly
    except Exception as e:
        print(f"[AMMAD] Ошибка при детектировании для {param_name}: {e}")
        return False

# ==================== СЛОВАРЬ МЕТОДОВ ====================

METHODS = {
    "z_score": z_score,
    "lof": lof,
    "fft": fft,
    "ammad": ammad,
}

# ==================== УТИЛИТЫ ====================

def get_parameter_dimensions() -> Dict[str, str]:
    """
    Возвращает размерности параметров на основе анализа данных.
    """
    return {
        "глубина": "метры (м)",
        "скорость_бурения": "метры в час (м/ч)",
        "вес_на_крюке": "тонны (т)",
        "момент_ротора": "килоньютон-метры (кН·м)",
        "обороты_ротора": "обороты в минуту (об/мин)",
        "давление_на_входе": "бар",
        "расход_на_входе": "литры в секунду (л/с) или м³/ч",
        "температура_на_выходе": "градусы Цельсия (°C)",
        "уровень_в_емкости": "условные единицы (0-2)",
        "скорость_спо": "метры в час (м/ч)",
        "нагрузка": "тонны (т)",
        "дмк": "условные единицы",
    }

def get_statistical_summary() -> Dict[str, Dict]:
    """
    Возвращает статистическое резюме параметров.
    """
    return {
        "глубина": {
            "стабильность": "очень высокая",
            "cv": 0.007,
            "рекомендация": "Использовать высокий порог (0.95+)"
        },
        "скорость_бурения": {
            "стабильность": "очень низкая",
            "cv": 2.011,
            "рекомендация": "Использовать низкий порог (0.7-0.8)"
        },
        "давление_на_входе": {
            "стабильность": "средняя",
            "cv": 0.734,
            "рекомендация": "Стандартный порог (0.85)"
        },
        "вес_на_крюке": {
            "стабильность": "высокая",
            "cv": 0.387,
            "рекомендация": "Высокий порог (0.9)"
        },
        "момент_ротора": {
            "стабильность": "низкая",
            "cv": 1.121,
            "рекомендация": "Низкий порог (0.8)"
        },
        "обороты_ротора": {
            "стабильность": "низкая",
            "cv": 1.173,
            "рекомендация": "Низкий порог (0.75)"
        },
        "уровень_в_емкости": {
            "стабильность": "очень высокая",
            "cv": 0.085,
            "рекомендация": "Очень высокий порог (0.98)"
        },
        "дмк": {
            "стабильность": "очень низкая",
            "cv": 1.688,
            "рекомендация": "Низкий порог (0.75)"
        },
        "нагрузка": {
            "стабильность": "низкая",
            "cv": 1.257,
            "рекомендация": "Низкий порог (0.8)"
        },
        "расход_на_входе": {
            "стабильность": "средняя",
            "cv": 0.801,
            "рекомендация": "Стандартный порог (0.85)"
        },
        "температура_на_выходе": {
            "стабильность": "высокая",
            "cv": 0.404,
            "рекомендация": "Высокий порог (0.9)"
        },
        "скорость_спо": {
            "стабильность": "очень низкая",
            "cv": 5.411,
            "рекомендация": "Очень низкий порог (0.7)"
        },
    }

def get_recommended_parameters():
    """
    Возвращает рекомендованные параметры на основе статистик.
    """
    return {
        "z_score": {
            "window_size": Z_SCORE_WINDOW_SIZE,
            "threshold": Z_SCORE_THRESHOLD,
            "recommendation": "Лучше всего для стабильных параметров (глубина, уровень, температура)"
        },
        "lof": {
            "window_size": LOF_WINDOW_SIZE,
            "threshold": LOF_SCORE_THRESHOLD,
            "recommendation": "Эффективен для волатильных параметров (скорость, момент, ДМК)"
        },
        "fft": {
            "window_size": FFT_WINDOW_SIZE,
            "threshold": FFT_SCORE_THRESHOLD,
            "recommendation": "Для обнаружения периодических аномалий и шума"
        },
        "ammad": {
            "window_size": AMMAD_WINDOW_SIZE,
            "threshold": AMMAD_SCORE_THRESHOLD,
            "recommendation": "Адаптивный метод, использует разные пороги для разных параметров"
        }
    }

def reset_ammad_detectors():
    """Сброс всех AMMAD детекторов."""
    global _ammad_detectors
    _ammad_detectors.clear()
    print("[AMMAD] Все детекторы сброшены")

def get_ammad_detector_stats() -> Dict[str, Dict]:
    """Получение статистик всех AMMAD детекторов."""
    stats = {}
    for param_name, detector in _ammad_detectors.items():
        stats[param_name] = detector.get_stats()
    return stats

# ==================== ЭКСПОРТ ====================

__all__ = [
    # Основные методы
    "z_score", "lof", "fft", "ammad",
    
    # Константы и конфигурации
    "Z_SCORE_THRESHOLD", "LOF_SCORE_THRESHOLD", "FFT_SCORE_THRESHOLD", "AMMAD_SCORE_THRESHOLD",
    "Z_SCORE_WINDOW_SIZE", "LOF_WINDOW_SIZE", "FFT_WINDOW_SIZE", "AMMAD_WINDOW_SIZE",
    
    # Словарь методов
    "METHODS",
    
    # Утилиты
    "get_parameter_dimensions", "get_statistical_summary", "get_recommended_parameters",
    "reset_ammad_detectors", "get_ammad_detector_stats",
    
    # Классы
    "AMMADDetector",
]

# ==================== ИНИЦИАЛИЗАЦИЯ ====================

if __name__ == "__main__":
    print("=" * 80)
    print("МЕТОДЫ ОБНАРУЖЕНИЯ АНОМАЛИЙ ДЛЯ БУРОВЫХ ДАННЫХ")
    print("Оптимизировано на основе статистик 12 ключевых параметров")
    print("=" * 80)
    
    print("\n📊 СТАТИСТИЧЕСКОЕ РЕЗЮМЕ ПАРАМЕТРОВ:")
    print("=" * 80)
    
    dims = get_parameter_dimensions()
    stats = get_statistical_summary()
    
    for param, info in stats.items():
        dim = dims.get(param, "неизвестно")
        print(f"\n{param:25} | Размерность: {dim:15} | CV: {info['cv']:6.3f}")
        print(f"{' ':25} | Стабильность: {info['стабильность']:15} | Рекомендация: {info['рекомендация']}")
    
    print("\n" + "=" * 80)
    print("🎯 РЕКОМЕНДОВАННЫЕ НАСТРОЙКИ ДЛЯ КАЖДОГО ПАРАМЕТРА:")
    print("=" * 80)
    
    print("\n1. Высокая стабильность (CV < 0.5):")
    print("   - Глубина, Уровень в емкости, Температура")
    print("   - Использовать высокие пороги (0.9-0.95)")
    print("   - Требовать согласия методов")
    
    print("\n2. Средняя стабильность (0.5 < CV < 1.0):")
    print("   - Давление, Расход, Вес на крюке")
    print("   - Стандартные пороги (0.85)")
    
    print("\n3. Низкая стабильность (CV > 1.0):")
    print("   - Скорость бурения, Момент, Обороты, ДМК, Нагрузка, Скорость СПО")
    print("   - Использовать низкие пороги (0.7-0.8)")
    print("   - Не требовать согласия методов")