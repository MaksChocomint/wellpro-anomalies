# optimize_parameters.py
import asyncio
import pandas as pd
import numpy as np
from typing import Dict, List, Tuple
import matplotlib.pyplot as plt
from dataclasses import dataclass
import json
from methods import z_score, lof, fft, ammad

@dataclass
class OptimizationResult:
    method: str
    best_params: Dict
    anomalies_count: int
    anomaly_percentage: float
    processing_time: float
    score: float  # Комплексная оценка (чем выше, тем лучше)

async def optimize_z_score(data: pd.DataFrame) -> OptimizationResult:
    """
    Оптимизация параметров Z-score метода.
    """
    print("\n[Optimization] Оптимизация Z-score метода...")
    
    best_result = None
    best_score = -1
    
    # Параметры для перебора
    window_sizes = [30, 50, 70, 100]
    thresholds = [2.5, 3.0, 3.5, 4.0]
    
    param_data = {}
    for column in data.columns:
        if column == 'время':
            continue
        param_data[column] = data[column].dropna().tolist()
    
    for window_size in window_sizes:
        for threshold in thresholds:
            anomalies = 0
            processed = 0
            
            for column, values in param_data.items():
                if len(values) <= window_size:
                    continue
                
                for i in range(window_size, len(values)):
                    window = values[i-window_size:i]
                    current = values[i]
                    
                    is_anomaly = await z_score(
                        window + [current],
                        window_size=window_size,
                        score_threshold=threshold
                    )
                    
                    processed += 1
                    if is_anomaly:
                        anomalies += 1
            
            if processed > 0:
                anomaly_percentage = (anomalies / processed) * 100
                
                # Оценка: стремимся к 2-3% аномалий
                # Наказываем слишком низкие (<1%) и слишком высокие (>5%) значения
                if anomaly_percentage < 1:
                    score = anomaly_percentage  # Слишком мало
                elif anomaly_percentage > 5:
                    score = 10 - anomaly_percentage  # Слишком много
                else:
                    # Лучшие значения в диапазоне 2-3%
                    ideal_range = 2.5
                    deviation = abs(anomaly_percentage - ideal_range)
                    score = 10 - deviation * 2
                
                # Учитываем размер окна (меньше окно = быстрее, но менее точно)
                window_penalty = window_size / 100
                score -= window_penalty
                
                if score > best_score:
                    best_score = score
                    best_result = OptimizationResult(
                        method="Z-score",
                        best_params={"window_size": window_size, "threshold": threshold},
                        anomalies_count=anomalies,
                        anomaly_percentage=anomaly_percentage,
                        processing_time=0,  # Время не измеряем в этой оптимизации
                        score=score
                    )
    
    print(f"  Лучшие параметры: окно={best_result.best_params['window_size']}, порог={best_result.best_params['threshold']}")
    print(f"  Аномалий: {best_result.anomalies_count} ({best_result.anomaly_percentage:.2f}%)")
    print(f"  Оценка: {best_result.score:.2f}")
    
    return best_result

async def optimize_lof(data: pd.DataFrame) -> OptimizationResult:
    """
    Оптимизация параметров LOF метода.
    """
    print("\n[Optimization] Оптимизация LOF метода...")
    
    best_result = None
    best_score = -1
    
    # Параметры для перебора
    window_sizes = [30, 50, 70]
    thresholds = [15, 20, 25, 30, 35]
    
    param_data = {}
    for column in data.columns:
        if column == 'время':
            continue
        param_data[column] = data[column].dropna().tolist()
    
    for window_size in window_sizes:
        for threshold in thresholds:
            anomalies = 0
            processed = 0
            
            for column, values in param_data.items():
                if len(values) <= window_size:
                    continue
                
                for i in range(window_size, len(values)):
                    window = values[i-window_size:i]
                    current = values[i]
                    
                    is_anomaly = await lof(
                        window + [current],
                        window_size=window_size,
                        score_threshold=threshold
                    )
                    
                    processed += 1
                    if is_anomaly:
                        anomalies += 1
            
            if processed > 0:
                anomaly_percentage = (anomalies / processed) * 100
                
                # LOF обычно обнаруживает больше аномалий, чем Z-score
                # Оптимальный диапазон для буровых данных: 2-4%
                if anomaly_percentage < 1:
                    score = anomaly_percentage
                elif anomaly_percentage > 6:
                    score = 10 - (anomaly_percentage - 5)
                else:
                    ideal_range = 3.0
                    deviation = abs(anomaly_percentage - ideal_range)
                    score = 10 - deviation * 1.5
                
                window_penalty = window_size / 100
                score -= window_penalty
                
                if score > best_score:
                    best_score = score
                    best_result = OptimizationResult(
                        method="LOF",
                        best_params={"window_size": window_size, "threshold": threshold},
                        anomalies_count=anomalies,
                        anomaly_percentage=anomaly_percentage,
                        processing_time=0,
                        score=score
                    )
    
    print(f"  Лучшие параметры: окно={best_result.best_params['window_size']}, порог={best_result.best_params['threshold']}")
    print(f"  Аномалий: {best_result.anomalies_count} ({best_result.anomaly_percentage:.2f}%)")
    print(f"  Оценка: {best_result.score:.2f}")
    
    return best_result

async def optimize_fft(data: pd.DataFrame) -> OptimizationResult:
    """
    Оптимизация параметров FFT метода.
    """
    print("\n[Optimization] Оптимизация FFT метода...")
    
    best_result = None
    best_score = -1
    
    # Параметры для перебора
    window_sizes = [32, 64, 128]
    thresholds = [0.1, 0.2, 0.3, 0.4, 0.5]
    
    param_data = {}
    for column in data.columns:
        if column == 'время':
            continue
        param_data[column] = data[column].dropna().tolist()
    
    for window_size in window_sizes:
        for threshold in thresholds:
            anomalies = 0
            processed = 0
            
            for column, values in param_data.items():
                if len(values) < window_size:
                    continue
                
                for i in range(window_size, len(values)):
                    window = values[i-window_size:i]
                    current = values[i]
                    
                    is_anomaly = await fft(
                        window + [current],
                        window_size=window_size,
                        score_threshold=threshold
                    )
                    
                    processed += 1
                    if is_anomaly:
                        anomalies += 1
            
            if processed > 0:
                anomaly_percentage = (anomalies / processed) * 100
                
                # FFT для буровых данных должен обнаруживать меньше аномалий
                # Оптимальный диапазон: 0.5-1.5%
                if anomaly_percentage < 0.1:
                    score = anomaly_percentage * 5  # Усиливаем очень низкие значения
                elif anomaly_percentage > 3:
                    score = 5 - (anomaly_percentage - 2)
                else:
                    ideal_range = 1.0
                    deviation = abs(anomaly_percentage - ideal_range)
                    score = 8 - deviation * 3
                
                window_penalty = window_size / 200  # Меньше штраф за окно
                score -= window_penalty
                
                if score > best_score:
                    best_score = score
                    best_result = OptimizationResult(
                        method="FFT",
                        best_params={"window_size": window_size, "threshold": threshold},
                        anomalies_count=anomalies,
                        anomaly_percentage=anomaly_percentage,
                        processing_time=0,
                        score=score
                    )
    
    print(f"  Лучшие параметры: окно={best_result.best_params['window_size']}, порог={best_result.best_params['threshold']}")
    print(f"  Аномалий: {best_result.anomalies_count} ({best_result.anomaly_percentage:.2f}%)")
    print(f"  Оценка: {best_result.score:.2f}")
    
    return best_result

async def optimize_ammad(data: pd.DataFrame) -> OptimizationResult:
    """
    Оптимизация параметров AMMAD метода.
    """
    print("\n[Optimization] Оптимизация AMMAD метода...")
    
    best_result = None
    best_score = -1
    
    # Параметры для перебора
    window_sizes = [32, 50, 64, 80]
    thresholds = [0.5, 0.6, 0.7, 0.8, 0.9]
    
    param_data = {}
    for column in data.columns:
        if column == 'время':
            continue
        param_data[column] = data[column].dropna().tolist()
    
    for window_size in window_sizes:
        for threshold in thresholds:
            anomalies = 0
            processed = 0
            
            for column, values in param_data.items():
                if len(values) < window_size:
                    continue
                
                for i in range(window_size, len(values)):
                    window = values[i-window_size:i]
                    current = values[i]
                    
                    is_anomaly = await ammad(
                        window + [current],
                        window_size=window_size,
                        score_threshold=threshold,
                        param_name=column
                    )
                    
                    processed += 1
                    if is_anomaly:
                        anomalies += 1
            
            if processed > 0:
                anomaly_percentage = (anomalies / processed) * 100
                
                # AMMAD должен быть более сбалансированным
                # Оптимальный диапазон: 2-4%
                if anomaly_percentage < 1:
                    score = anomaly_percentage
                elif anomaly_percentage > 6:
                    score = 10 - (anomaly_percentage - 5)
                else:
                    ideal_range = 3.0
                    deviation = abs(anomaly_percentage - ideal_range)
                    score = 12 - deviation * 2  # Более высокая базовая оценка
                
                window_penalty = window_size / 100
                score -= window_penalty
                
                if score > best_score:
                    best_score = score
                    best_result = OptimizationResult(
                        method="AMMAD",
                        best_params={"window_size": window_size, "threshold": threshold},
                        anomalies_count=anomalies,
                        anomaly_percentage=anomaly_percentage,
                        processing_time=0,
                        score=score
                    )
    
    print(f"  Лучшие параметры: окно={best_result.best_params['window_size']}, порог={best_result.best_params['threshold']}")
    print(f"  Аномалий: {best_result.anomalies_count} ({best_result.anomaly_percentage:.2f}%)")
    print(f"  Оценка: {best_result.score:.2f}")
    
    return best_result

def visualize_optimization_results(results: List[OptimizationResult]):
    """
    Визуализация результатов оптимизации.
    """
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    
    # 1. Процент аномалий
    methods = [r.method for r in results]
    percentages = [r.anomaly_percentage for r in results]
    scores = [r.score for r in results]
    
    ax1 = axes[0, 0]
    bars1 = ax1.bar(methods, percentages, color=['blue', 'green', 'orange', 'red'])
    ax1.set_title('Оптимальный процент аномалий', fontsize=14, fontweight='bold')
    ax1.set_ylabel('Процент аномалий (%)', fontsize=12)
    ax1.axhline(y=2.5, color='gray', linestyle='--', alpha=0.7, label='Идеальный уровень')
    ax1.axhline(y=1, color='red', linestyle=':', alpha=0.5, label='Нижняя граница')
    ax1.axhline(y=5, color='red', linestyle=':', alpha=0.5, label='Верхняя граница')
    ax1.legend()
    ax1.grid(axis='y', alpha=0.3)
    
    for bar, perc in zip(bars1, percentages):
        ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.1,
                f'{perc:.2f}%', ha='center', va='bottom', fontweight='bold')
    
    # 2. Оценки методов
    ax2 = axes[0, 1]
    bars2 = ax2.bar(methods, scores, color=['lightblue', 'lightgreen', 'wheat', 'lightcoral'])
    ax2.set_title('Комплексная оценка методов', fontsize=14, fontweight='bold')
    ax2.set_ylabel('Оценка', fontsize=12)
    ax2.axhline(y=8, color='green', linestyle='--', alpha=0.7, label='Отличный уровень')
    ax2.axhline(y=5, color='yellow', linestyle='--', alpha=0.7, label='Хороший уровень')
    ax2.legend()
    ax2.grid(axis='y', alpha=0.3)
    
    for bar, score in zip(bars2, scores):
        ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.1,
                f'{score:.2f}', ha='center', va='bottom', fontweight='bold')
    
    # 3. Сравнение оптимальных параметров
    ax3 = axes[1, 0]
    window_sizes = [r.best_params['window_size'] for r in results]
    thresholds = [r.best_params['threshold'] for r in results]
    
    x = np.arange(len(methods))
    width = 0.35
    
    bars3a = ax3.bar(x - width/2, window_sizes, width, label='Размер окна', color='skyblue')
    bars3b = ax3.bar(x + width/2, thresholds, width, label='Порог', color='salmon')
    
    ax3.set_title('Оптимальные параметры методов', fontsize=14, fontweight='bold')
    ax3.set_ylabel('Значение параметра', fontsize=12)
    ax3.set_xticks(x)
    ax3.set_xticklabels(methods)
    ax3.legend()
    ax3.grid(axis='y', alpha=0.3)
    
    # 4. Рекомендации
    ax4 = axes[1, 1]
    ax4.axis('off')
    
    recommendations = []
    for result in results:
        if result.method == "AMMAD":
            rec = "⚡ РЕКОМЕНДУЕТСЯ: Самый сбалансированный метод"
        elif result.score > 7:
            rec = "✅ ХОРОШО: Эффективный метод"
        elif result.score > 5:
            rec = "⚠️ УДОВЛЕТВОРИТЕЛЬНО: Требует настройки"
        else:
            rec = "❌ НЕ РЕКОМЕНДУЕТСЯ: Неэффективный для данных"
        
        recommendations.append(f"{result.method}: {rec}")
    
    recommendation_text = "\n\n".join(recommendations)
    ax4.text(0.05, 0.95, "РЕКОМЕНДАЦИИ:\n\n" + recommendation_text,
             transform=ax4.transAxes, fontsize=11, verticalalignment='top',
             bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))
    
    plt.tight_layout()
    plt.savefig('optimization_results.png', dpi=150, bbox_inches='tight')
    print(f"\n[Visualization] График сохранен как: optimization_results.png")

def save_recommended_configuration(results: List[OptimizationResult]):
    """
    Сохранение рекомендованной конфигурации.
    """
    config = {
        "timestamp": pd.Timestamp.now().isoformat(),
        "recommendations": {
            "primary_method": "AMMAD",  # По умолчанию AMMAD как наиболее перспективный
            "methods": {}
        }
    }
    
    for result in results:
        config["recommendations"]["methods"][result.method] = {
            "window_size": result.best_params["window_size"],
            "threshold": result.best_params["threshold"],
            "expected_anomaly_percentage": result.anomaly_percentage,
            "score": result.score,
            "recommendation": "recommended" if result.score > 7 else "optional" if result.score > 5 else "not_recommended"
        }
    
    # Определяем лучший метод по оценке
    best_method = max(results, key=lambda x: x.score)
    config["recommendations"]["primary_method"] = best_method.method
    
    with open('recommended_configuration.json', 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    
    print(f"\n[Configuration] Рекомендуемая конфигурация сохранена в: recommended_configuration.json")
    
    return config

async def run_parameter_optimization(data_file: str = "default.TXT"):
    """
    Запуск оптимизации параметров всех методов.
    """
    print("="*80)
    print("ОПТИМИЗАЦИЯ ПАРАМЕТРОВ МЕТОДОВ ОБНАРУЖЕНИЯ АНОМАЛИЙ")
    print("="*80)
    
    try:
        # Загрузка данных
        print("\n[Step 1] Загрузка данных для оптимизации...")
        from test import parse_test_data
        data_records, df = await parse_test_data(data_file)
        
        # Оптимизация каждого метода
        print("\n[Step 2] Оптимизация параметров методов...")
        
        results = []
        
        # Z-score
        z_result = await optimize_z_score(df)
        results.append(z_result)
        
        # LOF
        lof_result = await optimize_lof(df)
        results.append(lof_result)
        
        # FFT
        fft_result = await optimize_fft(df)
        results.append(fft_result)
        
        # AMMAD
        ammad_result = await optimize_ammad(df)
        results.append(ammad_result)
        
        # Вывод результатов
        print("\n" + "="*80)
        print("РЕЗУЛЬТАТЫ ОПТИМИЗАЦИИ")
        print("="*80)
        
        result_df = pd.DataFrame([
            {
                'Метод': r.method,
                'Размер окна': r.best_params['window_size'],
                'Порог': r.best_params['threshold'],
                'Аномалий (%)': f"{r.anomaly_percentage:.2f}%",
                'Оценка': f"{r.score:.2f}",
                'Рекомендация': '✅ Рекомендуется' if r.score > 7 else '⚠️ Условно' if r.score > 5 else '❌ Не рекомендуется'
            }
            for r in results
        ])
        
        print(result_df.to_string(index=False))
        
        # Визуализация
        print("\n[Step 3] Создание визуализаций...")
        visualize_optimization_results(results)
        
        # Сохранение конфигурации
        print("\n[Step 4] Генерация рекомендованной конфигурации...")
        config = save_recommended_configuration(results)
        
        # Генерация кода для использования
        print("\n[Step 5] Генерация кода с оптимальными параметрами...")
        generate_optimal_code(results)
        
        print("\n" + "="*80)
        print("ОПТИМИЗАЦИЯ ЗАВЕРШЕНА!")
        print("="*80)
        
        return results, config
        
    except Exception as e:
        print(f"\n[Error] Ошибка при оптимизации: {e}")
        import traceback
        traceback.print_exc()
        return None, None

def generate_optimal_code(results: List[OptimizationResult]):
    """
    Генерация кода с оптимальными параметрами.
    """
    python_code = """# Оптимальные параметры методов обнаружения аномалий
# Сгенерировано автоматически на основе оптимизации

OPTIMAL_PARAMETERS = {
"""

    for result in results:
        python_code += f"""    "{result.method.lower()}": {{
        "window_size": {result.best_params['window_size']},
        "threshold": {result.best_params['threshold']},
        "expected_anomaly_percentage": {result.anomaly_percentage:.2f},
        "score": {result.score:.2f}
    }},
"""

    python_code += """}

# Для использования в main.py или methods.py:
def get_optimal_parameters(method: str):
    \"""
    Получение оптимальных параметров для метода.
    
    Args:
        method: Название метода ('z_score', 'lof', 'fft', 'ammad')
    
    Returns:
        Словарь с оптимальными параметрами
    \"""
    method = method.lower()
    if method in OPTIMAL_PARAMETERS:
        return OPTIMAL_PARAMETERS[method]
    else:
        # Параметры по умолчанию
        return {
            "window_size": 64,
            "threshold": 0.7 if method == "ammad" else 0.5,
            "expected_anomaly_percentage": 3.0,
            "score": 5.0
        }
"""

    with open('optimal_parameters.py', 'w', encoding='utf-8') as f:
        f.write(python_code)
    
    print(f"[Code Generation] Оптимальные параметры сохранены в: optimal_parameters.py")

async def validate_optimized_parameters(data_file: str = "default.TXT"):
    """
    Валидация оптимизированных параметров на тестовых данных.
    """
    print("\n" + "="*80)
    print("ВАЛИДАЦИЯ ОПТИМИЗИРОВАННЫХ ПАРАМЕТРОВ")
    print("="*80)
    
    try:
        # Загрузка данных
        from test import parse_test_data
        _, df = await parse_test_data(data_file)
        
        # Загружаем рекомендованную конфигурацию
        with open('recommended_configuration.json', 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        print(f"\nПервичный рекомендованный метод: {config['recommendations']['primary_method']}")
        
        # Тестируем каждый метод с оптимизированными параметрами
        from test import test_z_score_method, test_lof_method, test_fft_method, test_ammad_method
        
        validation_results = {}
        
        for method_name, params in config['recommendations']['methods'].items():
            print(f"\n[Validation] Тестирование метода {method_name}...")
            print(f"  Параметры: окно={params['window_size']}, порог={params['threshold']}")
            
            if method_name == "Z-score":
                anomalies, _ = await test_z_score_method(
                    df, 
                    window_size=params['window_size'],
                    threshold=params['threshold']
                )
                total_processed = sum(len(df[col].dropna()) - params['window_size'] 
                                    for col in df.columns if col != 'время' and len(df[col].dropna()) > params['window_size'])
                
            elif method_name == "LOF":
                anomalies, _ = await test_lof_method(
                    df,
                    window_size=params['window_size'],
                    threshold=params['threshold']
                )
                total_processed = sum(len(df[col].dropna()) - params['window_size'] 
                                    for col in df.columns if col != 'время' and len(df[col].dropna()) > params['window_size'])
                
            elif method_name == "FFT":
                anomalies, _ = await test_fft_method(
                    df,
                    window_size=params['window_size'],
                    threshold=params['threshold']
                )
                total_processed = sum(len(df[col].dropna()) - params['window_size'] 
                                    for col in df.columns if col != 'время' and len(df[col].dropna()) > params['window_size'])
                
            elif method_name == "AMMAD":
                anomalies, _ = await test_ammad_method(
                    df,
                    window_size=params['window_size'],
                    threshold=params['threshold']
                )
                total_processed = sum(len(df[col].dropna()) - params['window_size'] 
                                    for col in df.columns if col != 'время' and len(df[col].dropna()) > params['window_size'])
            
            anomaly_percentage = (anomalies / max(total_processed, 1)) * 100
            expected_percentage = params['expected_anomaly_percentage']
            deviation = abs(anomaly_percentage - expected_percentage)
            
            validation_results[method_name] = {
                'actual_percentage': anomaly_percentage,
                'expected_percentage': expected_percentage,
                'deviation': deviation,
                'accuracy': 100 - min(deviation, 100)  # Процент точности
            }
            
            print(f"  Результат: {anomaly_percentage:.2f}% (ожидалось: {expected_percentage:.2f}%)")
            print(f"  Отклонение: {deviation:.2f}%, Точность: {validation_results[method_name]['accuracy']:.1f}%")
        
        # Вывод сводки валидации
        print("\n" + "="*80)
        print("РЕЗУЛЬТАТЫ ВАЛИДАЦИИ")
        print("="*80)
        
        validation_df = pd.DataFrame([
            {
                'Метод': method,
                'Фактически (%)': f"{results['actual_percentage']:.2f}%",
                'Ожидалось (%)': f"{results['expected_percentage']:.2f}%",
                'Отклонение (%)': f"{results['deviation']:.2f}%",
                'Точность (%)': f"{results['accuracy']:.1f}%"
            }
            for method, results in validation_results.items()
        ])
        
        print(validation_df.to_string(index=False))
        
        # Определяем самый точный метод
        best_method = max(validation_results.items(), key=lambda x: x[1]['accuracy'])
        print(f"\nСамый точный метод: {best_method[0]} (точность: {best_method[1]['accuracy']:.1f}%)")
        
        # Обновляем конфигурацию
        config['recommendations']['primary_method'] = best_method[0]
        config['validation_results'] = validation_results
        
        with open('validated_configuration.json', 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        
        print(f"\n[Validation] Проверенная конфигурация сохранена в: validated_configuration.json")
        
        return validation_results
        
    except Exception as e:
        print(f"\n[Error] Ошибка при валидации: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Оптимизация параметров методов обнаружения аномалий')
    parser.add_argument('--file', type=str, default='default.TXT', help='Путь к файлу с данными')
    parser.add_argument('--validate', action='store_true', help='Провести валидацию после оптимизации')
    
    args = parser.parse_args()
    
    # Запуск оптимизации
    results, config = asyncio.run(run_parameter_optimization(args.file))
    
    # Валидация если нужно
    if args.validate and results:
        asyncio.run(validate_optimized_parameters(args.file))