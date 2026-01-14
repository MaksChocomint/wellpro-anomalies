# final_test.py
import asyncio
import pandas as pd
from methods import z_score, lof, fft, ammad
from test import parse_test_data

async def test_optimized_methods():
    """
    Тестирование оптимизированных методов.
    """
    print("ТЕСТИРОВАНИЕ ОПТИМИЗИРОВАННЫХ МЕТОДОВ")
    print("="*60)
    
    # Загрузка данных
    data_records, df = await parse_test_data("default.TXT")
    
    results = []
    
    # # 1. Z-score с оптимизированными параметрами
    # print("\n1. Z-score (окно=30, порог=3.0)")
    # anomalies_z = await run_method_test(df, z_score, window_size=30, threshold=3.0)
    # results.append(("Z-score", anomalies_z, 30, 3.0))
    
    # # 2. LOF с оптимизированными параметрами
    # print("\n2. LOF (окно=70, порог=35)")
    # anomalies_lof = await run_method_test(df, lof, window_size=70, threshold=35)
    # results.append(("LOF", anomalies_lof, 70, 35))
    
    # # 3. FFT с оптимизированными параметрами
    # print("\n3. FFT (окно=64, порог=0.2)")
    # anomalies_fft = await run_method_test(df, fft, window_size=64, threshold=0.2)
    # results.append(("FFT", anomalies_fft, 64, 0.2))
    
    # 4. AMMAD с более высоким порогом
    print("\n4. AMMAD (окно=32, порог=0.7)")
    anomalies_ammad = await run_method_test(df, ammad, window_size=32, threshold=0.7)
    results.append(("AMMAD", anomalies_ammad, 32, 0.7))
    
    # 5. AMMAD с очень высоким порогом
    print("\n5. AMMAD СТРОГИЙ (окно=32, порог=0.85)")
    anomalies_ammad_strict = await run_method_test(df, ammad, window_size=32, threshold=0.85)
    results.append(("AMMAD СТРОГИЙ", anomalies_ammad_strict, 32, 0.85))
    
    # Вывод результатов
    print("\n" + "="*60)
    print("ФИНАЛЬНЫЕ РЕЗУЛЬТАТЫ")
    print("="*60)
    
    for method, anomalies, window, threshold in results:
        total_processed = calculate_processed(df, window)
        percentage = (anomalies / max(total_processed, 1)) * 100
        print(f"{method:15} | Окно={window:3} | Порог={threshold:5} | "
              f"Аномалий: {anomalies:6} ({percentage:5.2f}%)")

async def run_method_test(df, method_func, window_size, threshold):
    """Запуск теста метода."""
    anomalies = 0
    
    for column in df.columns:
        if column == 'время':
            continue
            
        values = df[column].dropna().tolist()
        
        if len(values) <= window_size:
            continue
        
        for i in range(window_size, len(values)):
            window_data = values[i-window_size:i]
            current_value = values[i]
            
            if method_func.__name__ == "ammad":
                is_anomaly = await method_func(
                    window_data + [current_value],
                    window_size=window_size,
                    score_threshold=threshold,
                    param_name=column
                )
            else:
                is_anomaly = await method_func(
                    window_data + [current_value],
                    window_size=window_size,
                    score_threshold=threshold
                )
            
            if is_anomaly:
                anomalies += 1
    
    return anomalies

def calculate_processed(df, window_size):
    """Расчет общего количества обработанных записей."""
    total = 0
    for column in df.columns:
        if column == 'время':
            continue
        values = df[column].dropna()
        if len(values) > window_size:
            total += len(values) - window_size
    return total

if __name__ == "__main__":
    asyncio.run(test_optimized_methods())