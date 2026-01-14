# performance_test.py
import asyncio
import time
import pandas as pd
import numpy as np
from methods import z_score, lof, fft, ammad
import matplotlib.pyplot as plt

async def measure_performance(method_func, data, **kwargs):
    """Измерение времени выполнения метода"""
    start_time = time.time()
    result = await method_func(data, **kwargs)
    end_time = time.time()
    return result, end_time - start_time

async def performance_comparison():
    """Сравнение производительности методов"""
    print("Сравнение производительности методов")
    print("="*60)
    
    # Создаем тестовые данные разного размера
    data_sizes = [100, 500, 1000, 5000]
    methods = [
        ('Z-score', z_score, {'window_size': 50, 'score_threshold': 3.0}),
        ('LOF', lof, {'window_size': 50, 'score_threshold': 25.0}),
        ('FFT', fft, {'window_size': 64, 'score_threshold': 0.3}),
        ('AMMAD', ammad, {'window_size': 64, 'score_threshold': 0.7, 'param_name': 'test'})
    ]
    
    results = {method_name: [] for method_name, _, _ in methods}
    
    for size in data_sizes:
        print(f"\nРазмер данных: {size}")
        test_data = np.random.normal(10, 2, size).tolist()
        
        for method_name, method_func, kwargs in methods:
            if size > kwargs.get('window_size', 0):
                _, exec_time = await measure_performance(method_func, test_data, **kwargs)
                results[method_name].append(exec_time)
                print(f"  {method_name}: {exec_time:.4f} сек")
            else:
                results[method_name].append(0)
                print(f"  {method_name}: недостаточно данных")
    
    # Визуализация
    fig, ax = plt.subplots(figsize=(10, 6))
    
    for method_name, times in results.items():
        ax.plot(data_sizes, times, marker='o', label=method_name, linewidth=2)
    
    ax.set_xlabel('Размер данных', fontsize=12)
    ax.set_ylabel('Время выполнения (сек)', fontsize=12)
    ax.set_title('Сравнение производительности методов обнаружения аномалий', fontsize=14, fontweight='bold')
    ax.grid(True, alpha=0.3)
    ax.legend()
    
    plt.tight_layout()
    plt.savefig('performance_comparison.png', dpi=150)
    print("\nГрафик сохранен как 'performance_comparison.png'")
    
    return results

if __name__ == "__main__":
    asyncio.run(performance_comparison())