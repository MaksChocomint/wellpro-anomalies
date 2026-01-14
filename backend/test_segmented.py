# test_segmented.py
import numpy as np
import pandas as pd
from typing import List, Dict, Tuple

async def test_method_segmented(data: pd.DataFrame, param_name: str, 
                               method_func, method_params: Dict) -> Dict:
    """
    Тестирование метода с учетом сегментов работы.
    """
    data_values = data[param_name].dropna().values
    
    # 1. Находим сегменты
    segments = find_working_segments(data_values)
    
    # 2. Анализ переходов (начало/остановка работы)
    transition_anomalies = 0
    for i in range(len(data_values) - 1):
        if data_values[i] == 0 and data_values[i+1] != 0:
            # Начало работы - проверяем, нормальное ли значение
            if not is_normal_start_value(data_values[i+1], param_name):
                transition_anomalies += 1
        elif data_values[i] != 0 and data_values[i+1] == 0:
            # Остановка работы - проверяем, нормальная ли остановка
            if not is_normal_stop_value(data_values[i], param_name):
                transition_anomalies += 1
    
    # 3. Анализ внутри сегментов
    segment_anomalies = []
    total_segment_anomalies = 0
    
    for seg_idx, segment in enumerate(segments):
        if len(segment['values']) >= method_params.get('min_segment_length', 10):
            segment_data = segment['values']
            
            # Анализ методом внутри сегмента
            anomalies_in_segment = 0
            window_size = method_params['window_size']
            
            for i in range(window_size, len(segment_data)):
                window = segment_data[i-window_size:i]
                current = segment_data[i]
                
                is_anomaly = await method_func(
                    window + [current],
                    window_size=window_size,
                    score_threshold=method_params['threshold'],
                    param_name=param_name if method_func.__name__ == 'ammad' else None
                )
                
                if is_anomaly:
                    anomalies_in_segment += 1
            
            if anomalies_in_segment > 0:
                segment_anomalies.append({
                    'segment_id': seg_idx,
                    'start': segment['start_idx'],
                    'end': segment['end_idx'],
                    'length': len(segment_data),
                    'anomalies': anomalies_in_segment,
                    'percentage': anomalies_in_segment / len(segment_data) * 100
                })
                
                total_segment_anomalies += anomalies_in_segment
    
    # 4. Итоговые результаты
    total_analyzed_points = sum(len(s['values']) for s in segments)
    
    return {
        'param_name': param_name,
        'total_points': len(data_values),
        'segments_count': len(segments),
        'transition_anomalies': transition_anomalies,
        'segment_anomalies_count': total_segment_anomalies,
        'segment_anomalies_details': segment_anomalies,
        'total_anomalies': transition_anomalies + total_segment_anomalies,
        'anomaly_percentage': (transition_anomalies + total_segment_anomalies) / len(data_values) * 100
    }

def find_working_segments(data: np.ndarray) -> List[Dict]:
    """Нахождение рабочих сегментов (ненулевых последовательностей)."""
    segments = []
    current_segment = []
    start_idx = 0
    in_segment = False
    
    for i, value in enumerate(data):
        if value != 0:
            if not in_segment:
                in_segment = True
                start_idx = i
            current_segment.append(value)
        else:
            if in_segment:
                in_segment = False
                segments.append({
                    'start_idx': start_idx,
                    'end_idx': i - 1,
                    'values': current_segment.copy(),
                    'length': len(current_segment)
                })
                current_segment = []
    
    # Добавляем последний сегмент
    if in_segment:
        segments.append({
            'start_idx': start_idx,
            'end_idx': len(data) - 1,
            'values': current_segment.copy(),
            'length': len(current_segment)
        })
    
    return segments

def is_normal_start_value(value: float, param_name: str) -> bool:
    """Проверка, нормальное ли значение при начале работы."""
    normal_ranges = {
        'скорость_бурения': (0.1, 10.0),
        'момент_ротора': (1.0, 5.0),
        'обороты_ротора': (10.0, 30.0),
        'давление_на_входе': (50.0, 150.0),
        'расход_на_входе': (5.0, 12.0),
        'скорость_спо': (0.01, 0.5),
        'нагрузка': (1.0, 4.0),
        'дмк': (5.0, 20.0),
    }
    
    if param_name in normal_ranges:
        min_val, max_val = normal_ranges[param_name]
        return min_val <= value <= max_val
    
    return True  # Для параметров без определенного диапазона

def is_normal_stop_value(value: float, param_name: str) -> bool:
    """Проверка, нормальное ли значение перед остановкой."""
    # Обычно перед остановкой значения уменьшаются
    # Можно добавить логику проверки
    
    return True  # Базовая реализация

# Основная функция тестирования
async def run_segmented_analysis(df: pd.DataFrame):
    """Запуск сегментного анализа для всех параметров."""
    
    print("="*80)
    print("📊 СЕГМЕНТНЫЙ АНАЛИЗ АНОМАЛИЙ")
    print("="*80)
    
    parameters = [
        "глубина", "скорость_бурения", "вес_на_крюке", "момент_ротора",
        "обороты_ротора", "давление_на_входе", "расход_на_входе",
        "температура_на_выходе", "уровень_в_емкости", "скорость_спо",
        "нагрузка", "дмк"
    ]
    
    all_results = {}
    
    for param in parameters:
        if param not in df.columns:
            continue
        
        print(f"\n🔍 Анализ параметра: {param}")
        
        # Разные настройки для разных типов параметров
        if param in ["глубина", "вес_на_крюке", "температура_на_выходе", "уровень_в_емкости"]:
            # Тип A: постоянные параметры
            method_params = {
                'window_size': 40,
                'threshold': 3.5,  # Высокий порог
                'min_segment_length': 20
            }
        elif param in ["скорость_спо", "скорость_бурения", "дмк", "нагрузка", 
                      "обороты_ротора", "момент_ротора"]:
            # Тип B: часто нулевые
            method_params = {
                'window_size': 20,
                'threshold': 2.5,  # Средний порог
                'min_segment_length': 5
            }
        else:
            # Тип C: редко нулевые
            method_params = {
                'window_size': 30,
                'threshold': 3.0,
                'min_segment_length': 10
            }
        
        # Тестируем Z-score
        from methods import z_score
        results = await test_method_segmented(df, param, z_score, method_params)
        
        all_results[param] = results
        
        print(f"  Сегментов: {results['segments_count']}")
        print(f"  Аномалий переходов: {results['transition_anomalies']}")
        print(f"  Аномалий в сегментах: {results['segment_anomalies_count']}")
        print(f"  Всего аномалий: {results['total_anomalies']}")
        print(f"  Процент аномалий: {results['anomaly_percentage']:.2f}%")
    
    return all_results