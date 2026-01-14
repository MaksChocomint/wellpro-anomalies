# test.py
import asyncio
import pandas as pd
import numpy as np
from io import StringIO
from typing import List, Dict, Tuple
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime
import json
import sys
import os

# Импортируем наши методы
from methods import METHODS, z_score, lof, fft, ammad

# 12 Key drilling parameters for WellPro
REQUIRED_PARAMETERS = {
    "глубина",                    # Depth
    "скорость_бурения",           # Drilling Rate
    "вес_на_крюке",               # Hook Load
    "момент_ротора",              # Torque
    "обороты_ротора",             # RPM
    "давление_на_входе",          # Inlet Pressure
    "расход_на_входе",            # Flow In
    "температура_на_выходе",      # Outlet Temperature
    "уровень_в_емкости",          # Tank Level
    "скорость_спо",               # ROP SPO
    "нагрузка",                   # Weight on Bit
    "дмк",                        # DMK
}

# Константы для тестирования (оптимизированные)
Z_SCORE_WINDOW_SIZE = 30
LOF_WINDOW_SIZE = 60    # Уменьшен для более быстрого реагирования
FFT_WINDOW_SIZE = 64
AMMAD_WINDOW_SIZE = 40  # Увеличен для стабильности

Z_SCORE_THRESHOLD = 3.0
LOF_SCORE_THRESHOLD = 18.0    # Уменьшен из-за высокой волатильности данных
FFT_SCORE_THRESHOLD = 0.18    # Увеличен для более строгой проверки шума
AMMAD_SCORE_THRESHOLD = 0.85

async def parse_test_data(filename: str = "default.TXT") -> Tuple[List[Dict], pd.DataFrame]:
    """
    Парсинг тестовых данных из файла с фильтрацией по 12 ключевым параметрам.
    """
    try:
        print(f"[Parser] Попытка загрузки файла: {filename}")
        
        # Проверяем существование файла
        if not os.path.exists(filename):
            print(f"[Parser] ОШИБКА: Файл {filename} не найден!")
            # Попробуем найти в текущей директории
            current_dir = os.listdir('.')
            txt_files = [f for f in current_dir if f.endswith('.txt') or f.endswith('.TXT')]
            print(f"[Parser] Доступные файлы в директории: {txt_files}")
            if txt_files:
                filename = txt_files[0]
                print(f"[Parser] Автоматический выбор файла: {filename}")
        
        with open(filename, 'r', encoding='utf-8') as file:
            lines = file.readlines()
        
        # Пропускаем первые 2 строки с метаданными
        # Строка 2 (индекс 2) содержит заголовки
        header_line = lines[2].strip()
        data_lines = lines[3:]  # Данные начинаются с 4 строки
        
        print(f"[Parser] Заголовочная строка: {header_line[:100]}...")
        print(f"[Parser] Количество строк данных: {len(data_lines)}")
        
        # Создаем DataFrame
        df = pd.read_csv(
            StringIO('\n'.join([header_line] + data_lines)),
            sep='\t',
            header=0,
            decimal=',',
            dtype=float,
            on_bad_lines='skip'  # Пропускать проблемные строки
        )
        
        # Нормализуем названия колонок
        df.columns = df.columns.str.lower().str.strip()
        
        print(f"[Parser] Загружено колонок до фильтрации: {len(df.columns)}")
        print(f"[Parser] Все колонки: {list(df.columns)}")
        
        # Фильтруем только ключевые параметры + время
        valid_columns = ['время'] + [col for col in REQUIRED_PARAMETERS if col in df.columns]
        missing_params = REQUIRED_PARAMETERS - set(df.columns)
        
        if missing_params:
            print(f"[Parser] ВНИМАНИЕ! Отсутствуют параметры: {missing_params}")
        
        # Проверяем, есть ли хоть какие-то ключевые параметры
        if len(valid_columns) <= 1:  # только 'время'
            print(f"[Parser] КРИТИЧЕСКАЯ ОШИБКА: Нет ни одного ключевого параметра в данных!")
            print(f"[Parser] Попробуем загрузить все доступные колонки...")
            valid_columns = ['время'] + [col for col in df.columns if col != 'время']
        
        df = df[valid_columns]
        
        # Проверяем наличие колонки времени
        if 'время' not in df.columns:
            print(f"[Parser] ВНИМАНИЕ: Колонка 'время' не найдена, создаем искусственный временной ряд")
            df['время'] = np.arange(len(df))
        
        # Конвертируем в список словарей
        data_records = df.to_dict(orient='records')
        
        print(f"[Parser] Успешно загружено {len(data_records)} записей")
        print(f"[Parser] Ключевые параметры: {[col for col in df.columns if col != 'время']}")
        print(f"[Parser] Количество параметров: {len(df.columns) - 1}")
        
        # Выводим предпросмотр данных
        print("\n[Parser] Предпросмотр данных:")
        print(df.head())
        print(f"\n[Parser] Статистики:")
        print(df.describe())
        
        return data_records, df
        
    except Exception as e:
        print(f"[Parser] Ошибка при загрузке данных: {e}")
        import traceback
        traceback.print_exc()
        raise

async def test_z_score_method(data: pd.DataFrame, window_size: int = Z_SCORE_WINDOW_SIZE, threshold: float = Z_SCORE_THRESHOLD) -> Tuple[int, List[int], Dict]:
    """
    Тестирование метода Z-score для ключевых параметров.
    Возвращает: (количество аномалий, индексы аномалий, результаты по параметрам)
    """
    print(f"\n[Test] Запуск теста Z-score (окно={window_size}, порог={threshold})...")
    
    anomalies_count = 0
    anomaly_indices = []
    total_processed = 0
    results_by_param = {}
    
    # Тестируем только ключевые параметры
    for column in data.columns:
        if column == 'время' or column not in REQUIRED_PARAMETERS:
            continue
            
        print(f"  Анализ параметра: {column}")
        column_data = data[column].dropna().tolist()
        
        if len(column_data) <= window_size:
            print(f"    Пропуск: недостаточно данных ({len(column_data)} записей, требуется > {window_size})")
            continue
        
        param_anomalies = 0
        param_total = 0
        
        for i in range(window_size, len(column_data)):
            window_data = column_data[i-window_size:i]
            current_value = column_data[i]
            
            is_anomaly = await z_score(
                data=window_data + [current_value],
                window_size=window_size,
                score_threshold=threshold
            )
            
            total_processed += 1
            param_total += 1
            
            if is_anomaly:
                anomalies_count += 1
                param_anomalies += 1
                anomaly_indices.append((column, i))
        
        # Сохраняем результаты по параметру
        if param_total > 0:
            results_by_param[column] = {
                'anomalies': param_anomalies,
                'total': param_total,
                'percentage': (param_anomalies / param_total) * 100
            }
            print(f"    Аномалий: {param_anomalies} ({results_by_param[column]['percentage']:.2f}%)")
    
    print(f"  Обработано записей: {total_processed}")
    print(f"  Обнаружено аномалий: {anomalies_count}")
    print(f"  Процент аномалий: {(anomalies_count/max(total_processed, 1))*100:.2f}%")
    
    return anomalies_count, anomaly_indices, results_by_param

async def test_lof_method(data: pd.DataFrame, window_size: int = LOF_WINDOW_SIZE, threshold: float = LOF_SCORE_THRESHOLD) -> Tuple[int, List[int], Dict]:
    """
    Тестирование метода LOF для ключевых параметров.
    """
    print(f"\n[Test] Запуск теста LOF (окно={window_size}, порог={threshold})...")
    
    anomalies_count = 0
    anomaly_indices = []
    total_processed = 0
    results_by_param = {}
    
    # Тестируем только ключевые параметры
    for column in data.columns:
        if column == 'время' or column not in REQUIRED_PARAMETERS:
            continue
            
        print(f"  Анализ параметра: {column}")
        column_data = data[column].dropna().tolist()
        
        if len(column_data) <= window_size:
            print(f"    Пропуск: недостаточно данных ({len(column_data)} записей, требуется > {window_size})")
            continue
        
        param_anomalies = 0
        param_total = 0
        
        # Для ускорения тестирования, проверяем каждую N-ю точку
        step = max(1, len(column_data) // 500)  # Ограничиваем количество проверок
        
        for i in range(window_size, len(column_data), step):
            window_data = column_data[i-window_size:i]
            current_value = column_data[i]
            
            is_anomaly = await lof(
                data=window_data + [current_value],
                window_size=window_size,
                score_threshold=threshold
            )
            
            total_processed += 1
            param_total += 1
            
            if is_anomaly:
                anomalies_count += 1
                param_anomalies += 1
                anomaly_indices.append((column, i))
        
        # Сохраняем результаты по параметру
        if param_total > 0:
            results_by_param[column] = {
                'anomalies': param_anomalies,
                'total': param_total,
                'percentage': (param_anomalies / param_total) * 100
            }
            print(f"    Аномалий: {param_anomalies} ({results_by_param[column]['percentage']:.2f}%)")
    
    print(f"  Обработано записей: {total_processed}")
    print(f"  Обнаружено аномалий: {anomalies_count}")
    print(f"  Процент аномалий: {(anomalies_count/max(total_processed, 1))*100:.2f}%")
    
    return anomalies_count, anomaly_indices, results_by_param

async def test_fft_method(data: pd.DataFrame, window_size: int = FFT_WINDOW_SIZE, threshold: float = FFT_SCORE_THRESHOLD) -> Tuple[int, List[int], Dict]:
    """
    Тестирование метода FFT для ключевых параметров.
    """
    print(f"\n[Test] Запуск теста FFT (окно={window_size}, порог={threshold})...")
    
    anomalies_count = 0
    anomaly_indices = []
    total_processed = 0
    results_by_param = {}
    
    # Тестируем только ключевые параметры
    for column in data.columns:
        if column == 'время' or column not in REQUIRED_PARAMETERS:
            continue
            
        print(f"  Анализ параметра: {column}")
        column_data = data[column].dropna().tolist()
        
        if len(column_data) < window_size:
            print(f"    Пропуск: недостаточно данных ({len(column_data)} записей, требуется >= {window_size})")
            continue
        
        param_anomalies = 0
        param_total = 0
        
        # Для ускорения тестирования, проверяем с шагом
        step = max(1, len(column_data) // 200)
        
        for i in range(window_size, len(column_data), step):
            window_data = column_data[i-window_size:i]
            current_value = column_data[i]
            
            is_anomaly = await fft(
                data=window_data + [current_value],
                window_size=window_size,
                score_threshold=threshold
            )
            
            total_processed += 1
            param_total += 1
            
            if is_anomaly:
                anomalies_count += 1
                param_anomalies += 1
                anomaly_indices.append((column, i))
        
        # Сохраняем результаты по параметру
        if param_total > 0:
            results_by_param[column] = {
                'anomalies': param_anomalies,
                'total': param_total,
                'percentage': (param_anomalies / param_total) * 100
            }
            print(f"    Аномалий: {param_anomalies} ({results_by_param[column]['percentage']:.2f}%)")
    
    print(f"  Обработано записей: {total_processed}")
    print(f"  Обнаружено аномалий: {anomalies_count}")
    print(f"  Процент аномалий: {(anomalies_count/max(total_processed, 1))*100:.2f}%")
    
    return anomalies_count, anomaly_indices, results_by_param

async def test_ammad_method(data: pd.DataFrame, window_size: int = AMMAD_WINDOW_SIZE, threshold: float = AMMAD_SCORE_THRESHOLD) -> Tuple[int, List[int], Dict]:
    """
    Тестирование метода AMMAD для ключевых параметров.
    """
    print(f"\n[Test] Запуск теста AMMAD (окно={window_size}, порог={threshold})...")
    
    anomalies_count = 0
    anomaly_indices = []
    total_processed = 0
    results_by_param = {}
    
    # Тестируем только ключевые параметры
    for column in data.columns:
        if column == 'время' or column not in REQUIRED_PARAMETERS:
            continue
            
        print(f"  Анализ параметра: {column}")
        column_data = data[column].dropna().tolist()
        
        if len(column_data) < 20:  # Минимальная история для AMMAD
            print(f"    Пропуск: недостаточно данных ({len(column_data)} записей, требуется >= 20)")
            continue
        
        param_anomalies = 0
        param_total = 0
        
        # Для ускорения тестирования, проверяем с шагом
        step = max(1, len(column_data) // 200)
        
        for i in range(window_size, len(column_data), step):
            window_data = column_data[i-window_size:i]
            current_value = column_data[i]
            
            is_anomaly = await ammad(
                data=window_data + [current_value],
                window_size=window_size,
                score_threshold=threshold,
                param_name=column
            )
            
            total_processed += 1
            param_total += 1
            
            if is_anomaly:
                anomalies_count += 1
                param_anomalies += 1
                anomaly_indices.append((column, i))
        
        # Сохраняем результаты по параметру
        if param_total > 0:
            results_by_param[column] = {
                'anomalies': param_anomalies,
                'total': param_total,
                'percentage': (param_anomalies / param_total) * 100
            }
            print(f"    Аномалий: {param_anomalies} ({results_by_param[column]['percentage']:.2f}%)")
    
    print(f"  Обработано записей: {total_processed}")
    print(f"  Обнаружено аномалий: {anomalies_count}")
    print(f"  Процент аномалий: {(anomalies_count/max(total_processed, 1))*100:.2f}%")
    
    return anomalies_count, anomaly_indices, results_by_param

async def analyze_parameter_statistics(data: pd.DataFrame):
    """
    Анализ статистик ключевых параметров.
    """
    print("\n" + "="*60)
    print("СТАТИСТИЧЕСКИЙ АНАЛИЗ КЛЮЧЕВЫХ ПАРАМЕТРОВ")
    print("="*60)
    
    stats = []
    for column in data.columns:
        if column == 'время' or column not in REQUIRED_PARAMETERS:
            continue
            
        values = data[column].dropna()
        if len(values) == 0:
            continue
        
        mean_val = values.mean()
        std_val = values.std()
        cv = std_val / (abs(mean_val) + 1e-10)
        
        # Определяем стабильность на основе CV
        if cv < 0.1:
            stability = "очень высокая"
        elif cv < 0.5:
            stability = "высокая"
        elif cv < 1.0:
            stability = "средняя"
        elif cv < 2.0:
            stability = "низкая"
        else:
            stability = "очень низкая"
        
        stats.append({
            'Параметр': column,
            'Кол-во значений': len(values),
            'Среднее': mean_val,
            'Стандартное отклонение': std_val,
            'Минимум': values.min(),
            'Максимум': values.max(),
            'Коэффициент вариации': cv,
            'Стабильность': stability,
            'Пропуски (%)': (data[column].isna().sum() / len(data)) * 100
        })
    
    if not stats:
        print("Нет данных по ключевым параметрам!")
        return None
    
    stats_df = pd.DataFrame(stats)
    print(stats_df.to_string())
    
    return stats_df

def visualize_anomaly_distribution(results: Dict, filename: str = "anomaly_distribution.png"):
    """
    Визуализация распределения аномалий по методам.
    """
    methods = list(results.keys())
    anomaly_counts = [results[method]['anomalies_count'] for method in methods]
    total_processed = [results[method]['total_processed'] for method in methods]
    percentages = [(results[method]['anomalies_count'] / max(results[method]['total_processed'], 1)) * 100 
                   for method in methods]
    
    fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(14, 15))
    
    # График 1: Количество аномалий
    bars1 = ax1.bar(methods, anomaly_counts, color=['blue', 'green', 'orange', 'red'])
    ax1.set_title('Количество обнаруженных аномалий по методам (12 ключевых параметров)', fontsize=14, fontweight='bold')
    ax1.set_ylabel('Количество аномалий', fontsize=12)
    ax1.grid(axis='y', alpha=0.3)
    
    for bar, count in zip(bars1, anomaly_counts):
        ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
                str(count), ha='center', va='bottom', fontweight='bold')
    
    # График 2: Процент аномалий
    bars2 = ax2.bar(methods, percentages, color=['lightblue', 'lightgreen', 'wheat', 'lightcoral'])
    ax2.set_title('Процент аномалий от общего числа записей', fontsize=14, fontweight='bold')
    ax2.set_ylabel('Процент аномалий (%)', fontsize=12)
    ax2.set_ylim(0, max(percentages) * 1.2)
    ax2.grid(axis='y', alpha=0.3)
    
    for bar, perc in zip(bars2, percentages):
        ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.1,
                f'{perc:.1f}%', ha='center', va='bottom', fontweight='bold')
    
    # График 3: Распределение аномалий по параметрам (для AMMAD)
    if 'AMMAD' in results and 'results_by_param' in results['AMMAD']:
        param_results = results['AMMAD']['results_by_param']
        if param_results:
            params = list(param_results.keys())
            param_percentages = [param_results[p]['percentage'] for p in params]
            
            # Сортируем по убыванию процента аномалий
            sorted_indices = np.argsort(param_percentages)[::-1]
            params = [params[i] for i in sorted_indices]
            param_percentages = [param_percentages[i] for i in sorted_indices]
            
            # Берем топ-10 параметров
            top_n = min(10, len(params))
            ax3.barh(params[:top_n], param_percentages[:top_n], color='steelblue')
            ax3.set_title(f'Топ-{top_n} параметров по проценту аномалий (AMMAD)', fontsize=14, fontweight='bold')
            ax3.set_xlabel('Процент аномалий (%)')
            ax3.grid(axis='x', alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(filename, dpi=150, bbox_inches='tight')
    print(f"\n[Visualization] График сохранен как: {filename}")

def save_test_results(results: Dict, stats_df: pd.DataFrame, filename: str = "test_results.json"):
    """
    Сохранение результатов тестирования в JSON файл.
    """
    result_data = {
        'timestamp': datetime.now().isoformat(),
        'tested_parameters': list(REQUIRED_PARAMETERS),
        'test_configuration': {
            'z_score': {'window_size': Z_SCORE_WINDOW_SIZE, 'threshold': Z_SCORE_THRESHOLD},
            'lof': {'window_size': LOF_WINDOW_SIZE, 'threshold': LOF_SCORE_THRESHOLD},
            'fft': {'window_size': FFT_WINDOW_SIZE, 'threshold': FFT_SCORE_THRESHOLD},
            'ammad': {'window_size': AMMAD_WINDOW_SIZE, 'threshold': AMMAD_SCORE_THRESHOLD},
        },
        'methods': {},
        'statistics_summary': {
            'total_parameters_tested': len(stats_df) if stats_df is not None else 0,
            'average_records_per_param': stats_df['Кол-во значений'].mean() if stats_df is not None else 0,
        }
    }
    
    for method, result in results.items():
        method_data = {
            'anomalies_count': result['anomalies_count'],
            'total_processed': result['total_processed'],
            'anomaly_percentage': result['anomaly_percentage'],
            'window_size': result['window_size'],
            'threshold': result['threshold']
        }
        
        # Добавляем результаты по параметрам если есть
        if 'results_by_param' in result:
            method_data['results_by_param'] = result['results_by_param']
        
        result_data['methods'][method] = method_data
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(result_data, f, ensure_ascii=False, indent=2, default=str)
    
    print(f"\n[Results] Результаты сохранены в: {filename}")
    return result_data

def calculate_total_processed(data: pd.DataFrame, window_size: int) -> int:
    """
    Расчет общего количества обработанных записей для всех ключевых параметров.
    """
    total = 0
    for column in data.columns:
        if column == 'время' or column not in REQUIRED_PARAMETERS:
            continue
            
        column_data = data[column].dropna()
        if len(column_data) > window_size:
            total += len(column_data) - window_size
    
    return total

async def run_comprehensive_test(data_file: str = "default.TXT"):
    """
    Запуск комплексного тестирования всех методов для ключевых параметров.
    """
    print("="*80)
    print("КОМПЛЕКСНОЕ ТЕСТИРОВАНИЕ МЕТОДОВ ОБНАРУЖЕНИЯ АНОМАЛИЙ")
    print("Только 12 ключевых параметров бурения")
    print("="*80)
    
    print(f"Тестируемые параметры: {REQUIRED_PARAMETERS}")
    print(f"\nКонфигурация тестирования:")
    print(f"  Z-score: окно={Z_SCORE_WINDOW_SIZE}, порог={Z_SCORE_THRESHOLD}")
    print(f"  LOF: окно={LOF_WINDOW_SIZE}, порог={LOF_SCORE_THRESHOLD}")
    print(f"  FFT: окно={FFT_WINDOW_SIZE}, порог={FFT_SCORE_THRESHOLD}")
    print(f"  AMMAD: окно={AMMAD_WINDOW_SIZE}, порог={AMMAD_SCORE_THRESHOLD}")
    
    try:
        # 1. Загрузка данных
        print("\n" + "="*80)
        print("[Step 1] Загрузка тестовых данных...")
        data_records, df = await parse_test_data(data_file)
        
        # Проверяем, какие параметры есть в данных
        available_params = [col for col in REQUIRED_PARAMETERS if col in df.columns]
        print(f"Доступные параметры в данных: {available_params}")
        print(f"Количество доступных параметров: {len(available_params)}")
        
        if len(available_params) == 0:
            print("ОШИБКА: В данных нет ни одного ключевого параметра!")
            return None, None
        
        # 2. Анализ статистик
        print("\n" + "="*80)
        print("[Step 2] Анализ статистик ключевых параметров...")
        stats_df = await analyze_parameter_statistics(df)
        
        if stats_df is None:
            print("Невозможно продолжить без статистик!")
            return None, None
        
        # 3. Тестирование методов
        print("\n" + "="*80)
        print("[Step 3] Тестирование методов обнаружения аномалий...")
        
        test_results = {}
        
        # Z-score тест
        print("\n" + "-"*40)
        z_anomalies, z_indices, z_results_by_param = await test_z_score_method(
            df, 
            window_size=Z_SCORE_WINDOW_SIZE, 
            threshold=Z_SCORE_THRESHOLD
        )
        test_results['Z-score'] = {
            'anomalies_count': z_anomalies,
            'anomaly_indices': z_indices,
            'total_processed': calculate_total_processed(df, Z_SCORE_WINDOW_SIZE),
            'anomaly_percentage': (z_anomalies / max(calculate_total_processed(df, Z_SCORE_WINDOW_SIZE), 1)) * 100,
            'window_size': Z_SCORE_WINDOW_SIZE,
            'threshold': Z_SCORE_THRESHOLD,
            'results_by_param': z_results_by_param
        }
        
        # LOF тест
        print("\n" + "-"*40)
        lof_anomalies, lof_indices, lof_results_by_param = await test_lof_method(
            df,
            window_size=LOF_WINDOW_SIZE,
            threshold=LOF_SCORE_THRESHOLD
        )
        test_results['LOF'] = {
            'anomalies_count': lof_anomalies,
            'anomaly_indices': lof_indices,
            'total_processed': calculate_total_processed(df, LOF_WINDOW_SIZE),
            'anomaly_percentage': (lof_anomalies / max(calculate_total_processed(df, LOF_WINDOW_SIZE), 1)) * 100,
            'window_size': LOF_WINDOW_SIZE,
            'threshold': LOF_SCORE_THRESHOLD,
            'results_by_param': lof_results_by_param
        }
        
        # FFT тест
        print("\n" + "-"*40)
        fft_anomalies, fft_indices, fft_results_by_param = await test_fft_method(
            df,
            window_size=FFT_WINDOW_SIZE,
            threshold=FFT_SCORE_THRESHOLD
        )
        test_results['FFT'] = {
            'anomalies_count': fft_anomalies,
            'anomaly_indices': fft_indices,
            'total_processed': calculate_total_processed(df, FFT_WINDOW_SIZE),
            'anomaly_percentage': (fft_anomalies / max(calculate_total_processed(df, FFT_WINDOW_SIZE), 1)) * 100,
            'window_size': FFT_WINDOW_SIZE,
            'threshold': FFT_SCORE_THRESHOLD,
            'results_by_param': fft_results_by_param
        }
        
        # AMMAD тест
        print("\n" + "-"*40)
        ammad_anomalies, ammad_indices, ammad_results_by_param = await test_ammad_method(
            df,
            window_size=AMMAD_WINDOW_SIZE,
            threshold=AMMAD_SCORE_THRESHOLD
        )
        test_results['AMMAD'] = {
            'anomalies_count': ammad_anomalies,
            'anomaly_indices': ammad_indices,
            'total_processed': calculate_total_processed(df, AMMAD_WINDOW_SIZE),
            'anomaly_percentage': (ammad_anomalies / max(calculate_total_processed(df, AMMAD_WINDOW_SIZE), 1)) * 100,
            'window_size': AMMAD_WINDOW_SIZE,
            'threshold': AMMAD_SCORE_THRESHOLD,
            'results_by_param': ammad_results_by_param
        }
        
        # 4. Вывод сводных результатов
        print("\n" + "="*80)
        print("СВОДНЫЕ РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ")
        print("12 ключевых параметров бурения")
        print("="*80)
        
        summary_df = pd.DataFrame([
            {
                'Метод': method,
                'Обработано записей': results['total_processed'],
                'Обнаружено аномалий': results['anomalies_count'],
                'Процент аномалий (%)': f"{results['anomaly_percentage']:.2f}%",
                'Размер окна': results['window_size'],
                'Порог': results['threshold']
            }
            for method, results in test_results.items()
        ])
        
        print(summary_df.to_string(index=False))
        
        # 5. Визуализация
        print("\n" + "="*80)
        print("[Step 4] Создание визуализаций...")
        visualize_anomaly_distribution(test_results)
        
        # 6. Сохранение результатов
        print("\n" + "="*80)
        print("[Step 5] Сохранение результатов...")
        save_test_results(test_results, stats_df)
        
        # 7. Детализированный анализ по параметрам
        print("\n" + "="*80)
        print("[Step 6] Детализированный анализ по параметрам...")
        await detailed_parameter_analysis(df, test_results)
        
        print("\n" + "="*80)
        print("ТЕСТИРОВАНИЕ ЗАВЕРШЕНО УСПЕШНО!")
        print("="*80)
        
        return test_results, stats_df
        
    except Exception as e:
        print(f"\n[Error] Ошибка при выполнении тестирования: {e}")
        import traceback
        traceback.print_exc()
        return None, None

async def detailed_parameter_analysis(df: pd.DataFrame, test_results: Dict):
    """
    Детализированный анализ аномалий по каждому параметру.
    """
    print("\n" + "-"*60)
    print("ДЕТАЛИЗИРОВАННЫЙ АНАЛИЗ ПО ПАРАМЕТРАМ")
    print("-"*60)
    
    results_by_param = {}
    
    for param in REQUIRED_PARAMETERS:
        if param not in df.columns:
            continue
            
        print(f"\nПараметр: {param}")
        param_data = df[param].dropna().tolist()
        
        if len(param_data) < 100:
            print(f"  Недостаточно данных: {len(param_data)} записей")
            continue
        
        # Собираем результаты из всех методов
        method_results = {}
        for method_name in ['Z-score', 'LOF', 'FFT', 'AMMAD']:
            if method_name in test_results and 'results_by_param' in test_results[method_name]:
                if param in test_results[method_name]['results_by_param']:
                    method_results[method_name] = test_results[method_name]['results_by_param'][param]
        
        if method_results:
            print(f"  Всего записей: {len(param_data)}")
            for method_name, results in method_results.items():
                print(f"  {method_name:10}: {results['anomalies']:4} ({results['percentage']:.1f}%)")
        else:
            print(f"  Нет результатов тестирования для этого параметра")
        
        # Сохраняем для итогового отчета
        results_by_param[param] = method_results
    
    # Сохранение детализированных результатов
    if results_by_param:
        with open("detailed_results.json", "w", encoding="utf-8") as f:
            json.dump(results_by_param, f, ensure_ascii=False, indent=2, default=str)
        print(f"\n[Results] Детализированные результаты сохранены в: detailed_results.json")

async def test_specific_parameters(data_file: str = "default.TXT", params: List[str] = None):
    """
    Тестирование конкретных ключевых параметров.
    """
    print("\n" + "="*60)
    print("ТЕСТИРОВАНИЕ КОНКРЕТНЫХ КЛЮЧЕВЫХ ПАРАМЕТРОВ")
    print("="*60)
    
    try:
        _, df = await parse_test_data(data_file)
        
        if params is None:
            # Тестируем все доступные ключевые параметры
            params = [p for p in REQUIRED_PARAMETERS if p in df.columns]
        
        if not params:
            print("Нет доступных ключевых параметров для тестирования!")
            return
        
        print(f"Тестируемые параметры: {params}")
        
        for param in params:
            if param not in df.columns:
                print(f"Параметр '{param}' не найден в данных")
                continue
                
            print(f"\n" + "="*40)
            print(f"Параметр: {param}")
            print(f"  Всего значений: {len(df[param].dropna())}")
            print(f"  Диапазон: {df[param].min():.2f} - {df[param].max():.2f}")
            print(f"  Среднее: {df[param].mean():.2f}, Стандартное отклонение: {df[param].std():.2f}")
            
            # Тестируем все методы на этом параметре
            param_data = df[[param]].dropna()
            
            if len(param_data) < 100:
                print(f"  Пропуск: недостаточно данных для анализа")
                continue
            
            # Z-score
            z_anomalies = 0
            z_total = max(len(param_data) - Z_SCORE_WINDOW_SIZE, 1)
            for i in range(Z_SCORE_WINDOW_SIZE, len(param_data), 10):  # Шаг для ускорения
                window = param_data.iloc[i-Z_SCORE_WINDOW_SIZE:i][param].tolist()
                current = param_data.iloc[i][param]
                
                is_anomaly = await z_score(window + [current], 
                                         window_size=Z_SCORE_WINDOW_SIZE, 
                                         score_threshold=Z_SCORE_THRESHOLD)
                if is_anomaly:
                    z_anomalies += 1
            
            # LOF
            lof_anomalies = 0
            lof_total = max(len(param_data) - LOF_WINDOW_SIZE, 1)
            for i in range(LOF_WINDOW_SIZE, len(param_data), 20):  # Больший шаг, т.к. LOF медленнее
                window = param_data.iloc[i-LOF_WINDOW_SIZE:i][param].tolist()
                current = param_data.iloc[i][param]
                
                is_anomaly = await lof(window + [current], 
                                     window_size=LOF_WINDOW_SIZE, 
                                     score_threshold=LOF_SCORE_THRESHOLD)
                if is_anomaly:
                    lof_anomalies += 1
            
            # FFT
            fft_anomalies = 0
            fft_total = max(len(param_data) - FFT_WINDOW_SIZE, 1)
            for i in range(FFT_WINDOW_SIZE, len(param_data), 10):
                window = param_data.iloc[i-FFT_WINDOW_SIZE:i][param].tolist()
                current = param_data.iloc[i][param]
                
                is_anomaly = await fft(window + [current], 
                                     window_size=FFT_WINDOW_SIZE, 
                                     score_threshold=FFT_SCORE_THRESHOLD)
                if is_anomaly:
                    fft_anomalies += 1
            
            # AMMAD
            ammad_anomalies = 0
            ammad_total = max(len(param_data) - AMMAD_WINDOW_SIZE, 1)
            for i in range(AMMAD_WINDOW_SIZE, len(param_data), 10):
                window = param_data.iloc[i-AMMAD_WINDOW_SIZE:i][param].tolist()
                current = param_data.iloc[i][param]
                
                is_anomaly = await ammad(window + [current], 
                                       window_size=AMMAD_WINDOW_SIZE, 
                                       score_threshold=AMMAD_SCORE_THRESHOLD,
                                       param_name=param)
                if is_anomaly:
                    ammad_anomalies += 1
            
            print(f"  Z-score:  {z_anomalies:4} ({z_anomalies/z_total*100:.1f}%)")
            print(f"  LOF:      {lof_anomalies:4} ({lof_anomalies/lof_total*100:.1f}%)")
            print(f"  FFT:      {fft_anomalies:4} ({fft_anomalies/fft_total*100:.1f}%)")
            print(f"  AMMAD:    {ammad_anomalies:4} ({ammad_anomalies/ammad_total*100:.1f}%)")
            
    except Exception as e:
        print(f"Ошибка при тестировании параметров: {e}")
        import traceback
        traceback.print_exc()

def print_test_summary():
    """
    Печать сводки конфигурации тестирования.
    """
    print("="*80)
    print("КОНФИГУРАЦИЯ ТЕСТИРОВАНИЯ АНОМАЛИЙ")
    print("="*80)
    print(f"\n📊 Используемые параметры методов:")
    print(f"  Z-score:    окно={Z_SCORE_WINDOW_SIZE}, порог={Z_SCORE_THRESHOLD}")
    print(f"  LOF:        окно={LOF_WINDOW_SIZE}, порог={LOF_SCORE_THRESHOLD}")
    print(f"  FFT:        окно={FFT_WINDOW_SIZE}, порог={FFT_SCORE_THRESHOLD}")
    print(f"  AMMAD:      окно={AMMAD_WINDOW_SIZE}, порог={AMMAD_SCORE_THRESHOLD}")
    
    print(f"\n🎯 12 ключевых параметров бурения:")
    for i, param in enumerate(sorted(REQUIRED_PARAMETERS), 1):
        print(f"  {i:2}. {param}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Тестирование методов обнаружения аномалий для ключевых параметров бурения')
    parser.add_argument('--file', type=str, default='default.TXT', help='Путь к файлу с данными')
    parser.add_argument('--specific', action='store_true', help='Тестировать только конкретные параметры')
    parser.add_argument('--params', type=str, nargs='+', help='Список параметров для тестирования')
    parser.add_argument('--summary', action='store_true', help='Показать сводку конфигурации')
    
    args = parser.parse_args()
    
    if args.summary:
        print_test_summary()
    elif args.specific:
        asyncio.run(test_specific_parameters(args.file, args.params))
    else:
        asyncio.run(run_comprehensive_test(args.file))