# test_segmented_analysis.py
import asyncio
import numpy as np
import pandas as pd
from typing import List, Dict, Tuple
import json
from datetime import datetime
import os

# Импортируем методы из вашего файла
try:
    from methods import z_score, lof, fft, ammad
except ImportError:
    print("Ошибка: Не удалось импортировать методы из methods.py")
    print("Убедитесь, что файл methods.py находится в той же директории")
    exit(1)

def load_test_data(filename: str = "default.TXT") -> pd.DataFrame:
    """Загрузка тестовых данных."""
    try:
        print(f"Загрузка данных из {filename}...")
        
        with open(filename, 'r', encoding='utf-8') as file:
            lines = file.readlines()
        
        # Пропускаем метаданные
        header_line = lines[2].strip()
        data_lines = lines[3:]
        
        df = pd.read_csv(
            pd.io.common.StringIO('\n'.join([header_line] + data_lines)),
            sep='\t',
            header=0,
            decimal=',',
            dtype=float
        )
        
        # Нормализация названий колонок
        df.columns = df.columns.str.lower().str.strip()
        
        print(f"Успешно загружено {len(df)} записей")
        print(f"Колонки: {list(df.columns)}")
        
        return df
        
    except Exception as e:
        print(f"Ошибка загрузки: {e}")
        return None

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
    # Диапазоны нормальных значений при начале работы
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
    # Для большинства параметров проверяем, не слишком ли высокое значение перед остановкой
    abnormal_stop_ranges = {
        'давление_на_входе': (200, float('inf')),  # Высокое давление при остановке
        'обороты_ротора': (30, float('inf')),      # Высокие обороты при остановке
        'скорость_бурения': (5, float('inf')),     # Высокая скорость при остановке
    }
    
    if param_name in abnormal_stop_ranges:
        min_val, _ = abnormal_stop_ranges[param_name]
        return value < min_val  # Нормально, если значение ниже порога
    
    return True

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
    transition_details = []
    
    for i in range(len(data_values) - 1):
        if data_values[i] == 0 and data_values[i+1] != 0:
            # Начало работы - проверяем, нормальное ли значение
            if not is_normal_start_value(data_values[i+1], param_name):
                transition_anomalies += 1
                transition_details.append({
                    'type': 'start',
                    'index': i+1,
                    'value': float(data_values[i+1]),
                    'previous': 0.0
                })
        elif data_values[i] != 0 and data_values[i+1] == 0:
            # Остановка работы - проверяем, нормальная ли остановка
            if not is_normal_stop_value(data_values[i], param_name):
                transition_anomalies += 1
                transition_details.append({
                    'type': 'stop',
                    'index': i,
                    'value': float(data_values[i]),
                    'next': 0.0
                })
    
    # 3. Анализ внутри сегментов
    segment_anomalies = []
    total_segment_anomalies = 0
    
    for seg_idx, segment in enumerate(segments):
        if len(segment['values']) >= method_params.get('min_segment_length', 10):
            segment_data = segment['values']
            
            # Анализ методом внутри сегмента
            anomalies_in_segment = 0
            anomaly_indices = []
            window_size = method_params['window_size']
            
            # Используем шаг для ускорения анализа
            step = max(1, len(segment_data) // 100)
            
            for i in range(window_size, len(segment_data), step):
                window = segment_data[i-window_size:i]
                current = segment_data[i]
                
                # Для AMMAD передаем имя параметра
                if method_func.__name__ == 'ammad':
                    is_anomaly = await method_func(
                        window + [current],
                        window_size=window_size,
                        score_threshold=method_params['threshold'],
                        param_name=param_name
                    )
                else:
                    is_anomaly = await method_func(
                        window + [current],
                        window_size=window_size,
                        score_threshold=method_params['threshold']
                    )
                
                if is_anomaly:
                    anomalies_in_segment += 1
                    anomaly_indices.append(segment['start_idx'] + i)
            
            if anomalies_in_segment > 0:
                segment_anomalies.append({
                    'segment_id': seg_idx,
                    'start': int(segment['start_idx']),
                    'end': int(segment['end_idx']),
                    'length': len(segment_data),
                    'anomalies': anomalies_in_segment,
                    'percentage': anomalies_in_segment / (len(segment_data) // step) * 100 if step > 1 else anomalies_in_segment / len(segment_data) * 100,
                    'anomaly_indices': anomaly_indices[:10]  # Сохраняем первые 10 индексов
                })
                
                total_segment_anomalies += anomalies_in_segment
    
    # 4. Итоговые результаты
    total_analyzed_points = sum(len(s['values']) for s in segments)
    
    return {
        'param_name': param_name,
        'total_points': len(data_values),
        'segments_count': len(segments),
        'transition_anomalies': transition_anomalies,
        'transition_details': transition_details,
        'segment_anomalies_count': total_segment_anomalies,
        'segment_anomalies_details': segment_anomalies,
        'total_anomalies': transition_anomalies + total_segment_anomalies,
        'anomaly_percentage': (transition_anomalies + total_segment_anomalies) / len(data_values) * 100 if len(data_values) > 0 else 0
    }

async def analyze_parameter_segmented(df: pd.DataFrame, param_name: str, 
                                     method_name: str, method_params: Dict) -> Dict:
    """Анализ одного параметра одним методом."""
    print(f"  Анализ {method_name:8}... ", end="")
    
    # Выбираем функцию метода
    method_func = {
        'z_score': z_score,
        'lof': lof,
        'fft': fft,
        'ammad': ammad
    }.get(method_name)
    
    if method_func is None:
        print(f"Ошибка: неизвестный метод {method_name}")
        return None
    
    try:
        results = await test_method_segmented(df, param_name, method_func, method_params)
        print(f"готово ({results['anomaly_percentage']:.2f}% аномалий)")
        return results
    except Exception as e:
        print(f"ошибка: {e}")
        return None

async def run_comprehensive_segmented_analysis(df: pd.DataFrame):
    """Запуск комплексного сегментного анализа для всех параметров."""
    
    print("="*80)
    print("📊 СЕГМЕНТНЫЙ АНАЛИЗ АНОМАЛИЙ - ПОЛНЫЙ ТЕСТ")
    print("="*80)
    
    parameters = [
        "глубина", "скорость_бурения", "вес_на_крюке", "момент_ротора",
        "обороты_ротора", "давление_на_входе", "расход_на_входе",
        "температура_на_выходе", "уровень_в_емкости", "скорость_спо",
        "нагрузка", "дмк"
    ]
    
    # Настройки методов для разных типов параметров
    method_configs = {
        'z_score': {
            'тип_A': {'window_size': 40, 'threshold': 3.5, 'min_segment_length': 20},
            'тип_B': {'window_size': 20, 'threshold': 2.5, 'min_segment_length': 5},
            'тип_C': {'window_size': 30, 'threshold': 3.0, 'min_segment_length': 10}
        },
        'lof': {
            'тип_A': {'window_size': 60, 'threshold': 15.0, 'min_segment_length': 20},
            'тип_B': {'window_size': 40, 'threshold': 10.0, 'min_segment_length': 5},
            'тип_C': {'window_size': 50, 'threshold': 12.0, 'min_segment_length': 10}
        },
        'fft': {
            'тип_A': {'window_size': 64, 'threshold': 0.15, 'min_segment_length': 20},
            'тип_B': {'window_size': 64, 'threshold': 0.10, 'min_segment_length': 5},
            'тип_C': {'window_size': 64, 'threshold': 0.12, 'min_segment_length': 10}
        },
        'ammad': {
            'тип_A': {'window_size': 40, 'threshold': 0.95, 'min_segment_length': 20},
            'тип_B': {'window_size': 30, 'threshold': 0.80, 'min_segment_length': 5},
            'тип_C': {'window_size': 35, 'threshold': 0.85, 'min_segment_length': 10}
        }
    }
    
    # Определяем тип каждого параметра
    param_types = {}
    for param in parameters:
        if param in ["глубина", "вес_на_крюке", "температура_на_выходе", "уровень_в_емкости"]:
            param_types[param] = 'тип_A'  # Постоянные параметры
        elif param in ["скорость_спо", "скорость_бурения", "дмк", "нагрузка", 
                      "обороты_ротора", "момент_ротора"]:
            param_types[param] = 'тип_B'  # Часто нулевые
        else:
            param_types[param] = 'тип_C'  # Редко нулевые
    
    all_results = {}
    
    # Создаем директорию для результатов
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    results_dir = f"segmented_results_{timestamp}"
    os.makedirs(results_dir, exist_ok=True)
    
    for param in parameters:
        if param not in df.columns:
            print(f"Параметр '{param}' не найден в данных, пропускаем")
            continue
        
        print(f"\n🔍 Параметр: {param} ({param_types[param]})")
        
        param_results = {}
        
        # Анализ каждым методом
        for method_name in ['z_score', 'lof', 'fft', 'ammad']:
            method_params = method_configs[method_name][param_types[param]]
            results = await analyze_parameter_segmented(df, param, method_name, method_params)
            
            if results:
                param_results[method_name] = results
        
        all_results[param] = param_results
        
        # Краткая статистика по параметру
        if param_results:
            print(f"  📊 Сводка по методам:")
            for method_name, results in param_results.items():
                print(f"    {method_name:8}: {results['total_anomalies']:4} аномалий "
                      f"({results['anomaly_percentage']:5.2f}%) | "
                      f"сегментов: {results['segments_count']}")
    
    # Сохранение результатов
    print(f"\n💾 Сохранение результатов в {results_dir}/")
    
    # 1. Основные результаты в JSON
    with open(f"{results_dir}/segmented_analysis_results.json", 'w', encoding='utf-8') as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2, default=str)
    
    # 2. Сводная таблица в CSV
    summary_data = []
    for param, methods in all_results.items():
        for method_name, results in methods.items():
            summary_data.append({
                'Параметр': param,
                'Метод': method_name,
                'Тип': param_types.get(param, 'неизвестно'),
                'Всего точек': results['total_points'],
                'Сегментов': results['segments_count'],
                'Аномалий переходов': results['transition_anomalies'],
                'Аномалий в сегментах': results['segment_anomalies_count'],
                'Всего аномалий': results['total_anomalies'],
                'Процент аномалий': f"{results['anomaly_percentage']:.2f}%"
            })
    
    df_summary = pd.DataFrame(summary_data)
    df_summary.to_csv(f"{results_dir}/summary.csv", index=False, encoding='utf-8')
    
    # 3. Подробные результаты по методам
    for method_name in ['z_score', 'lof', 'fft', 'ammad']:
        method_data = []
        for param, methods in all_results.items():
            if method_name in methods:
                results = methods[method_name]
                method_data.append({
                    'Параметр': param,
                    'Всего точек': results['total_points'],
                    'Сегментов': results['segments_count'],
                    'Аномалий': results['total_anomalies'],
                    'Процент': results['anomaly_percentage']
                })
        
        if method_data:
            df_method = pd.DataFrame(method_data)
            df_method.to_csv(f"{results_dir}/{method_name}_results.csv", index=False, encoding='utf-8')
    
    # Вывод итоговой статистики
    print("\n" + "="*80)
    print("📈 ИТОГОВАЯ СТАТИСТИКА")
    print("="*80)
    
    for method_name in ['z_score', 'lof', 'fft', 'ammad']:
        method_totals = {
            'параметры': 0,
            'аномалии': 0,
            'точки': 0,
            'процент': 0.0
        }
        
        for param, methods in all_results.items():
            if method_name in methods:
                results = methods[method_name]
                method_totals['параметры'] += 1
                method_totals['аномалии'] += results['total_anomalies']
                method_totals['точки'] += results['total_points']
        
        if method_totals['точки'] > 0:
            method_totals['процент'] = method_totals['аномалии'] / method_totals['точки'] * 100
        
        print(f"\n{method_name:8}:")
        print(f"  Проанализировано параметров: {method_totals['параметры']}")
        print(f"  Всего аномалий: {method_totals['аномалии']:,}")
        print(f"  Средний процент аномалий: {method_totals['процент']:.2f}%")
    
    # Детальный анализ по типам параметров
    print("\n" + "="*80)
    print("🔬 АНАЛИЗ ПО ТИПАМ ПАРАМЕТРОВ")
    print("="*80)
    
    for param_type in ['тип_A', 'тип_B', 'тип_C']:
        type_params = [p for p, t in param_types.items() if t == param_type and p in all_results]
        
        if not type_params:
            continue
        
        print(f"\n{param_type}:")
        print(f"  Параметры: {', '.join(type_params)}")
        
        for method_name in ['z_score', 'lof', 'fft', 'ammad']:
            type_anomalies = 0
            type_points = 0
            
            for param in type_params:
                if method_name in all_results[param]:
                    results = all_results[param][method_name]
                    type_anomalies += results['total_anomalies']
                    type_points += results['total_points']
            
            if type_points > 0:
                percentage = type_anomalies / type_points * 100
                print(f"    {method_name:8}: {type_anomalies:6} аномалий ({percentage:5.2f}%)")
    
    return all_results, results_dir

async def quick_test(df: pd.DataFrame):
    """Быстрый тест для демонстрации."""
    print("="*80)
    print("🚀 БЫСТРЫЙ ТЕСТ СЕГМЕНТНОГО АНАЛИЗА")
    print("="*80)
    
    # Тестируем несколько ключевых параметров
    test_params = ["глубина", "скорость_бурения", "момент_ротора", "давление_на_входе"]
    
    for param in test_params:
        if param not in df.columns:
            continue
        
        print(f"\n🔍 Параметр: {param}")
        data_values = df[param].dropna().values
        
        # Находим сегменты
        segments = find_working_segments(data_values)
        
        print(f"  Всего записей: {len(data_values):,}")
        print(f"  Найдено сегментов: {len(segments)}")
        
        if segments:
            segment_lengths = [s['length'] for s in segments]
            print(f"  Длина сегментов: min={min(segment_lengths)}, "
                  f"max={max(segment_lengths)}, avg={np.mean(segment_lengths):.1f}")
            
            # Проверяем переходы
            zero_to_nonzero = 0
            nonzero_to_zero = 0
            
            for i in range(len(data_values) - 1):
                if data_values[i] == 0 and data_values[i+1] != 0:
                    zero_to_nonzero += 1
                elif data_values[i] != 0 and data_values[i+1] == 0:
                    nonzero_to_zero += 1
            
            print(f"  Начал работы: {zero_to_nonzero}")
            print(f"  Остановок: {nonzero_to_zero}")

def main():
    """Основная функция."""
    print("="*80)
    print("🔬 СЕГМЕНТНЫЙ АНАЛИЗ АНОМАЛИЙ В БУРОВЫХ ДАННЫХ")
    print("="*80)
    
    import argparse
    parser = argparse.ArgumentParser(description='Сегментный анализ аномалий')
    parser.add_argument('--file', type=str, default='default.TXT', help='Файл с данными')
    parser.add_argument('--quick', action='store_true', help='Быстрый тест')
    parser.add_argument('--full', action='store_true', help='Полный анализ')
    
    args = parser.parse_args()
    
    # Загрузка данных
    df = load_test_data(args.file)
    
    if df is None:
        print("❌ Не удалось загрузить данные")
        return
    
    # Проверяем наличие параметров
    drilling_parameters = [
        "глубина", "скорость_бурения", "вес_на_крюке", "момент_ротора",
        "обороты_ротора", "давление_на_входе", "расход_на_входе",
        "температура_на_выходе", "уровень_в_емкости", "скорость_спо",
        "нагрузка", "дмк"
    ]
    
    available_params = [p for p in drilling_parameters if p in df.columns]
    print(f"\n✅ Найдено параметров: {len(available_params)} из {len(drilling_parameters)}")
    
    if not available_params:
        print("❌ Не найдено ни одного ключевого параметра")
        return
    
    # Запуск анализа
    if args.quick:
        asyncio.run(quick_test(df))
    else:
        # По умолчанию запускаем полный анализ
        print("\n" + "="*80)
        print("⚙  НАСТРОЙКА АНАЛИЗА:")
        print("="*80)
        print("Типы параметров:")
        print("  Тип А (постоянные): глубина, вес_на_крюке, температура_на_выходе, уровень_в_емкости")
        print("  Тип Б (часто нулевые): скорость_спо, скорость_бурения, дмк, нагрузка, обороты_ротора, момент_ротора")
        print("  Тип В (редко нулевые): давление_на_входе, расход_на_входе")
        print("\nНажмите Enter для продолжения...")
        input()
        
        results, results_dir = asyncio.run(run_comprehensive_segmented_analysis(df))
        
        print(f"\n✅ Анализ завершен! Результаты сохранены в папке: {results_dir}/")
        print(f"   - segmented_analysis_results.json - полные результаты")
        print(f"   - summary.csv - сводная таблица")
        print(f"   - *.csv - результаты по каждому методу")

if __name__ == "__main__":
    main()