# quick_test.py
import asyncio
import pandas as pd
from io import StringIO
import sys

sys.path.append('.')  # Добавляем текущую директорию в путь

from methods import z_score, lof, fft, ammad

async def quick_test():
    """Быстрый тест методов на небольшом наборе данных"""
    print("Быстрый тест методов обнаружения аномалий")
    print("="*50)
    
    # Создаем тестовые данные с аномалиями
    test_data = {
        'normal': [10.0, 10.1, 10.2, 10.1, 10.3, 10.2, 10.1, 10.2, 10.3],
        'with_anomaly': [10.0, 10.1, 10.2, 10.1, 50.0, 10.2, 10.1, 10.2, 10.3],  # Аномалия на позиции 4
        'trend': [10.0, 10.5, 11.0, 11.5, 12.0, 12.5, 13.0, 13.5, 14.0],
        'spike': [10.0, 10.0, 10.0, 10.0, 30.0, 10.0, 10.0, 10.0, 10.0],
    }
    
    for data_name, data_values in test_data.items():
        print(f"\nТест: {data_name}")
        print(f"Данные: {data_values}")
        
        # Z-score тест
        z_result = await z_score(data_values, window_size=5, score_threshold=2.0)
        print(f"  Z-score: {'Аномалия' if z_result else 'Норма'}")
        
        # LOF тест
        lof_result = await lof(data_values, window_size=5, score_threshold=10.0)
        print(f"  LOF: {'Аномалия' if lof_result else 'Норма'}")
        
        # FFT тест
        if len(data_values) >= 8:
            fft_result = await fft(data_values, window_size=8, score_threshold=0.3)
            print(f"  FFT: {'Аномалия' if fft_result else 'Норма'}")
        else:
            print(f"  FFT: недостаточно данных")
        
        # AMMAD тест
        ammad_result = await ammad(data_values, window_size=8, score_threshold=0.5, param_name="test_param")
        print(f"  AMMAD: {'Аномалия' if ammad_result else 'Норма'}")
    
    print("\n" + "="*50)
    print("Тест завершен!")

if __name__ == "__main__":
    asyncio.run(quick_test())