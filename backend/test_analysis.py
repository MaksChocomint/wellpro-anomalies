# test_analysis_full.py
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from typing import Dict, List, Tuple
import json
import os
from datetime import datetime

# Настройка стилей
plt.style.use('seaborn-v0_8-darkgrid')
sns.set_palette("husl")

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

def analyze_parameter_comprehensive(df: pd.DataFrame, param_name: str, 
                                   save_plots: bool = True) -> Dict:
    """
    Комплексный анализ параметра.
    """
    if param_name not in df.columns:
        print(f"Параметр '{param_name}' не найден в данных")
        return None
    
    data = df[param_name].dropna().values
    print(f"\n{'='*60}")
    print(f"📊 КОМПЛЕКСНЫЙ АНАЛИЗ ПАРАМЕТРА: {param_name}")
    print(f"{'='*60}")
    
    # Базовая статистика
    print(f"\n📈 ОСНОВНАЯ СТАТИСТИКА:")
    print(f"  Всего записей: {len(data):,}")
    print(f"  Среднее значение: {np.mean(data):.4f}")
    print(f"  Медиана: {np.median(data):.4f}")
    print(f"  Стандартное отклонение: {np.std(data):.4f}")
    print(f"  Минимум: {np.min(data):.4f}")
    print(f"  Максимум: {np.max(data):.4f}")
    print(f"  Диапазон: {np.ptp(data):.4f}")
    
    # Анализ нулевых значений
    zero_mask = data == 0
    zero_count = np.sum(zero_mask)
    zero_percentage = zero_count / len(data) * 100
    
    print(f"\n🔍 АНАЛИЗ НУЛЕВЫХ ЗНАЧЕНИЙ:")
    print(f"  Нулевых значений: {zero_count:,} ({zero_percentage:.2f}%)")
    print(f"  Ненулевых значений: {len(data) - zero_count:,} ({100 - zero_percentage:.2f}%)")
    
    # Анализ ненулевых значений
    if zero_count < len(data):
        non_zero_data = data[~zero_mask]
        print(f"\n📊 СТАТИСТИКА НЕНУЛЕВЫХ ЗНАЧЕНИЙ:")
        print(f"  Количество: {len(non_zero_data):,}")
        print(f"  Среднее: {np.mean(non_zero_data):.4f}")
        print(f"  Медиана: {np.median(non_zero_data):.4f}")
        print(f"  Минимум: {np.min(non_zero_data):.4f}")
        print(f"  Максимум: {np.max(non_zero_data):.4f}")
        print(f"  Стандартное отклонение: {np.std(non_zero_data):.4f}")
        
        # Процентили
        percentiles = [1, 5, 25, 50, 75, 95, 99]
        perc_values = np.percentile(non_zero_data, percentiles)
        print(f"\n📊 ПРОЦЕНТИЛИ НЕНУЛЕВЫХ ЗНАЧЕНИЙ:")
        for p, v in zip(percentiles, perc_values):
            print(f"  {p:2}%: {v:10.4f}")
    
    # Поиск сегментов (непрерывных ненулевых значений)
    print(f"\n🔍 ПОИСК РАБОЧИХ СЕГМЕНТОВ:")
    
    segments = []
    current_segment = []
    segment_start = 0
    in_segment = False
    
    for i, value in enumerate(data):
        if value != 0:
            if not in_segment:
                in_segment = True
                segment_start = i
            current_segment.append(value)
        else:
            if in_segment:
                in_segment = False
                segments.append({
                    'start_idx': segment_start,
                    'end_idx': i - 1,
                    'length': len(current_segment),
                    'mean': np.mean(current_segment),
                    'std': np.std(current_segment),
                    'min': np.min(current_segment),
                    'max': np.max(current_segment)
                })
                current_segment = []
    
    # Добавляем последний сегмент, если есть
    if in_segment:
        segments.append({
            'start_idx': segment_start,
            'end_idx': len(data) - 1,
            'length': len(current_segment),
            'mean': np.mean(current_segment),
            'std': np.std(current_segment),
            'min': np.min(current_segment),
            'max': np.max(current_segment)
        })
    
    print(f"  Найдено рабочих сегментов: {len(segments)}")
    
    if segments:
        segment_lengths = [s['length'] for s in segments]
        segment_means = [s['mean'] for s in segments]
        
        print(f"  Длина сегментов:")
        print(f"    Минимальная: {min(segment_lengths):,}")
        print(f"    Максимальная: {max(segment_lengths):,}")
        print(f"    Средняя: {np.mean(segment_lengths):.1f}")
        print(f"    Медиана: {np.median(segment_lengths):.1f}")
        
        print(f"  Средние значения в сегментах:")
        print(f"    Минимальное: {min(segment_means):.4f}")
        print(f"    Максимальное: {max(segment_means):.4f}")
        print(f"    Среднее: {np.mean(segment_means):.4f}")
    
    # Анализ распределения
    print(f"\n📊 АНАЛИЗ РАСПРЕДЕЛЕНИЯ:")
    
    # Гистограмма
    plt.figure(figsize=(15, 10))
    
    # 1. Полный временной ряд (первые 2000 точек для наглядности)
    ax1 = plt.subplot(3, 2, 1)
    sample_size = min(2000, len(data))
    ax1.plot(range(sample_size), data[:sample_size], 'b-', alpha=0.7, linewidth=0.5)
    ax1.set_title(f'{param_name} - Временной ряд (первые {sample_size} точек)')
    ax1.set_xlabel('Индекс')
    ax1.set_ylabel('Значение')
    ax1.grid(True, alpha=0.3)
    
    # 2. Гистограмма всех значений
    ax2 = plt.subplot(3, 2, 2)
    n_bins = min(50, len(np.unique(data)))
    ax2.hist(data, bins=n_bins, alpha=0.7, edgecolor='black', density=True)
    ax2.set_title(f'{param_name} - Распределение всех значений')
    ax2.set_xlabel('Значение')
    ax2.set_ylabel('Плотность')
    ax2.grid(True, alpha=0.3)
    
    # 3. Гистограмма ненулевых значений
    ax3 = plt.subplot(3, 2, 3)
    if len(non_zero_data) > 0:
        n_bins_nz = min(30, len(np.unique(non_zero_data)))
        ax3.hist(non_zero_data, bins=n_bins_nz, alpha=0.7, 
                edgecolor='black', density=True, color='green')
        ax3.set_title(f'{param_name} - Распределение ненулевых значений')
        ax3.set_xlabel('Значение')
        ax3.set_ylabel('Плотность')
    ax3.grid(True, alpha=0.3)
    
    # 4. Box plot
    ax4 = plt.subplot(3, 2, 4)
    ax4.boxplot([data], vert=True, patch_artist=True,
               boxprops=dict(facecolor='lightblue'),
               medianprops=dict(color='red'))
    ax4.set_title(f'{param_name} - Box plot')
    ax4.set_ylabel('Значение')
    ax4.grid(True, alpha=0.3)
    
    # 5. Анализ сегментов (если есть)
    ax5 = plt.subplot(3, 2, 5)
    if segments:
        segment_numbers = range(1, len(segments) + 1)
        segment_means = [s['mean'] for s in segments]
        
        ax5.bar(segment_numbers, segment_means, alpha=0.7, color='orange')
        ax5.set_title(f'{param_name} - Средние значения по сегментам')
        ax5.set_xlabel('Номер сегмента')
        ax5.set_ylabel('Среднее значение')
        ax5.set_xticks(segment_numbers)
        ax5.grid(True, alpha=0.3)
    
    # 6. Кумулятивное распределение
    ax6 = plt.subplot(3, 2, 6)
    sorted_data = np.sort(data)
    y_vals = np.arange(1, len(sorted_data) + 1) / len(sorted_data)
    ax6.plot(sorted_data, y_vals, 'r-', linewidth=2)
    ax6.set_title(f'{param_name} - Кумулятивная функция распределения')
    ax6.set_xlabel('Значение')
    ax6.set_ylabel('Вероятность')
    ax6.grid(True, alpha=0.3)
    
    plt.tight_layout()
    
    if save_plots:
        os.makedirs('analysis_plots', exist_ok=True)
        plot_filename = f'analysis_plots/{param_name}_analysis.png'
        plt.savefig(plot_filename, dpi=150, bbox_inches='tight')
        print(f"  Графики сохранены: {plot_filename}")
    
    plt.show()
    
    # Сбор результатов
    results = {
        'parameter_name': param_name,
        'total_records': len(data),
        'basic_stats': {
            'mean': float(np.mean(data)),
            'median': float(np.median(data)),
            'std': float(np.std(data)),
            'min': float(np.min(data)),
            'max': float(np.max(data)),
            'range': float(np.ptp(data))
        },
        'zero_analysis': {
            'zero_count': int(zero_count),
            'zero_percentage': float(zero_percentage),
            'non_zero_count': int(len(data) - zero_count),
            'non_zero_percentage': float(100 - zero_percentage)
        },
        'non_zero_stats': None,
        'segments_info': {
            'count': len(segments),
            'lengths': [s['length'] for s in segments] if segments else [],
            'means': [s['mean'] for s in segments] if segments else []
        }
    }
    
    if zero_count < len(data):
        results['non_zero_stats'] = {
            'mean': float(np.mean(non_zero_data)),
            'median': float(np.median(non_zero_data)),
            'std': float(np.std(non_zero_data)),
            'min': float(np.min(non_zero_data)),
            'max': float(np.max(non_zero_data))
        }
    
    return results

def analyze_all_parameters(df: pd.DataFrame, parameters: List[str] = None) -> Dict:
    """
    Анализ всех указанных параметров.
    """
    if parameters is None:
        # 12 ключевых параметров бурения
        parameters = [
            "глубина",
            "скорость_бурения",
            "вес_на_крюке",
            "момент_ротора",
            "обороты_ротора",
            "давление_на_входе",
            "расход_на_входе",
            "температура_на_выходе",
            "уровень_в_емкости",
            "скорость_спо",
            "нагрузка",
            "дмк"
        ]
    
    print("="*80)
    print("🚀 КОМПЛЕКСНЫЙ АНАЛИЗ ВСЕХ 12 ПАРАМЕТРОВ БУРЕНИЯ")
    print("="*80)
    
    all_results = {}
    summary_stats = []
    
    for param in parameters:
        if param not in df.columns:
            print(f"⚠ Параметр '{param}' не найден в данных, пропускаем")
            continue
        
        try:
            results = analyze_parameter_comprehensive(df, param, save_plots=True)
            if results:
                all_results[param] = results
                
                # Добавляем в сводную таблицу
                summary_stats.append({
                    'Параметр': param,
                    'Всего записей': results['total_records'],
                    'Нулевых (%)': results['zero_analysis']['zero_percentage'],
                    'Среднее': results['basic_stats']['mean'],
                    'Медиана': results['basic_stats']['median'],
                    'Стд. отклонение': results['basic_stats']['std'],
                    'Минимум': results['basic_stats']['min'],
                    'Максимум': results['basic_stats']['max'],
                    'Сегменты': results['segments_info']['count'],
                    'Длина сегм. (сред)': np.mean(results['segments_info']['lengths']) if results['segments_info']['lengths'] else 0
                })
                
        except Exception as e:
            print(f"❌ Ошибка при анализе параметра {param}: {e}")
    
    # Сохранение всех результатов
    if all_results:
        os.makedirs('analysis_results', exist_ok=True)
        
        # 1. Сохранение в JSON
        json_filename = f'analysis_results/parameters_analysis_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        with open(json_filename, 'w', encoding='utf-8') as f:
            json.dump(all_results, f, ensure_ascii=False, indent=2, default=str)
        print(f"\n📁 Все результаты сохранены в: {json_filename}")
        
        # 2. Создание сводного отчета
        create_summary_report(summary_stats, all_results)
        
        # 3. Сравнительный анализ
        create_comparative_analysis(all_results)
    
    return all_results

def create_summary_report(summary_stats: List[Dict], all_results: Dict):
    """Создание сводного отчета."""
    print("\n" + "="*80)
    print("📋 СВОДНЫЙ ОТЧЕТ ПО ВСЕМ ПАРАМЕТРАМ")
    print("="*80)
    
    # Создаем DataFrame для красивой таблицы
    df_summary = pd.DataFrame(summary_stats)
    
    # Сортируем по проценту нулевых значений
    df_summary = df_summary.sort_values('Нулевых (%)', ascending=False)
    
    print("\n📊 ОСНОВНАЯ СТАТИСТИКА:")
    print(df_summary.to_string(index=False))
    
    # Сохранение в CSV
    csv_filename = f'analysis_results/summary_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    df_summary.to_csv(csv_filename, index=False, encoding='utf-8')
    print(f"\n📁 Сводный отчет сохранен в: {csv_filename}")
    
    # Визуализация сводной статистики
    fig, axes = plt.subplots(2, 2, figsize=(15, 12))
    
    # 1. Процент нулевых значений
    ax1 = axes[0, 0]
    bars1 = ax1.barh(df_summary['Параметр'], df_summary['Нулевых (%)'], color='skyblue')
    ax1.set_title('Процент нулевых значений по параметрам')
    ax1.set_xlabel('Процент нулевых значений (%)')
    ax1.set_xlim(0, 100)
    
    # Добавляем значения на столбцы
    for bar, value in zip(bars1, df_summary['Нулевых (%)']):
        ax1.text(value + 1, bar.get_y() + bar.get_height()/2, 
                f'{value:.1f}%', va='center', fontsize=9)
    
    # 2. Количество сегментов
    ax2 = axes[0, 1]
    if 'Сегменты' in df_summary.columns:
        bars2 = ax2.bar(df_summary['Параметр'], df_summary['Сегменты'], color='lightgreen')
        ax2.set_title('Количество рабочих сегментов')
        ax2.set_ylabel('Количество сегментов')
        ax2.tick_params(axis='x', rotation=45)
        
        for bar, value in zip(bars2, df_summary['Сегменты']):
            ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
                    str(value), ha='center', fontsize=9)
    
    # 3. Диаграмма рассеяния: нулевые vs стандартное отклонение
    ax3 = axes[1, 0]
    scatter = ax3.scatter(df_summary['Нулевых (%)'], df_summary['Стд. отклонение'],
                         c=df_summary['Среднее'], cmap='viridis', s=100, alpha=0.7)
    ax3.set_title('Зависимость: Нулевые значения vs Стандартное отклонение')
    ax3.set_xlabel('Процент нулевых значений (%)')
    ax3.set_ylabel('Стандартное отклонение')
    
    # Добавляем подписи точек
    for i, param in enumerate(df_summary['Параметр']):
        ax3.annotate(param, (df_summary['Нулевых (%)'].iloc[i], 
                          df_summary['Стд. отклонение'].iloc[i]),
                   fontsize=8, alpha=0.7)
    
    # 4. Heatmap корреляций
    ax4 = axes[1, 1]
    
    # Создаем матрицу для heatmap
    heatmap_data = df_summary[['Нулевых (%)', 'Среднее', 'Стд. отклонение', 
                              'Медиана', 'Сегменты']].corr()
    
    im = ax4.imshow(heatmap_data, cmap='coolwarm', aspect='auto')
    ax4.set_title('Матрица корреляций')
    ax4.set_xticks(range(len(heatmap_data.columns)))
    ax4.set_yticks(range(len(heatmap_data.columns)))
    ax4.set_xticklabels(heatmap_data.columns, rotation=45, ha='right')
    ax4.set_yticklabels(heatmap_data.columns)
    
    # Добавляем значения в ячейки
    for i in range(len(heatmap_data.columns)):
        for j in range(len(heatmap_data.columns)):
            text = ax4.text(j, i, f'{heatmap_data.iloc[i, j]:.2f}',
                          ha="center", va="center", color="w", fontsize=9)
    
    plt.colorbar(im, ax=ax4)
    
    plt.tight_layout()
    plt.savefig('analysis_results/summary_visualization.png', dpi=150, bbox_inches='tight')
    plt.show()
    
    print(f"\n📊 Визуализация сохранена: analysis_results/summary_visualization.png")

def create_comparative_analysis(all_results: Dict):
    """Создание сравнительного анализа параметров."""
    print("\n" + "="*80)
    print("📈 СРАВНИТЕЛЬНЫЙ АНАЛИЗ ПАРАМЕТРОВ")
    print("="*80)
    
    # Группировка параметров по характеристикам
    print("\n📊 ГРУППИРОВКА ПАРАМЕТРОВ:")
    
    high_zero_params = []
    low_zero_params = []
    high_variance_params = []
    low_variance_params = []
    many_segments_params = []
    few_segments_params = []
    
    for param_name, results in all_results.items():
        zero_pct = results['zero_analysis']['zero_percentage']
        std_val = results['basic_stats']['std']
        segments_count = results['segments_info']['count']
        
        if zero_pct > 75:
            high_zero_params.append((param_name, zero_pct))
        elif zero_pct < 25:
            low_zero_params.append((param_name, zero_pct))
        
        if std_val > results['basic_stats']['mean'] * 0.5:  # Высокая вариативность
            high_variance_params.append((param_name, std_val))
        else:
            low_variance_params.append((param_name, std_val))
        
        if segments_count > 10:
            many_segments_params.append((param_name, segments_count))
        elif segments_count > 0:
            few_segments_params.append((param_name, segments_count))
    
    print("\n🔴 ПАРАМЕТРЫ С ВЫСОКИМ % НУЛЕВЫХ ЗНАЧЕНИЙ (>75%):")
    for param, pct in sorted(high_zero_params, key=lambda x: x[1], reverse=True):
        print(f"  {param:25}: {pct:6.1f}%")
    
    print("\n🟢 ПАРАМЕТРЫ С НИЗКИМ % НУЛЕВЫХ ЗНАЧЕНИЙ (<25%):")
    for param, pct in sorted(low_zero_params, key=lambda x: x[1]):
        print(f"  {param:25}: {pct:6.1f}%")
    
    print("\n📈 ПАРАМЕТРЫ С ВЫСОКОЙ ВАРИАТИВНОСТЬЮ:")
    for param, std_val in sorted(high_variance_params, key=lambda x: x[1], reverse=True)[:5]:
        print(f"  {param:25}: {std_val:10.4f}")
    
    print("\n📉 ПАРАМЕТРЫ С НИЗКОЙ ВАРИАТИВНОСТЬЮ:")
    for param, std_val in sorted(low_variance_params, key=lambda x: x[1])[:5]:
        print(f"  {param:25}: {std_val:10.4f}")
    
    print("\n🔄 ПАРАМЕТРЫ С МНОГИМИ СЕГМЕНТАМИ РАБОТЫ (>10):")
    for param, count in sorted(many_segments_params, key=lambda x: x[1], reverse=True):
        print(f"  {param:25}: {count:4d} сегментов")
    
    print("\n⚡ ПАРАМЕТРЫ С НЕСКОЛЬКИМИ СЕГМЕНТАМИ РАБОТЫ (1-10):")
    for param, count in sorted(few_segments_params, key=lambda x: x[1], reverse=True):
        print(f"  {param:25}: {count:4d} сегментов")
    
    # Рекомендации по методам обнаружения аномалий
    print("\n" + "="*80)
    print("🎯 РЕКОМЕНДАЦИИ ПО МЕТОДАМ ОБНАРУЖЕНИЯ АНОМАЛИЙ")
    print("="*80)
    
    recommendations = []
    
    for param_name, results in all_results.items():
        zero_pct = results['zero_analysis']['zero_percentage']
        std_val = results['basic_stats']['std']
        mean_val = results['basic_stats']['mean']
        cv = std_val / mean_val if mean_val != 0 else 0
        
        if zero_pct > 90:
            method = "ТОЛЬКО проверка физических пределов"
            reason = "Почти всегда 0, любые ненулевые значения - аномалия"
        elif zero_pct > 50:
            method = "Z-score + проверка ненулевых значений"
            reason = "Частые нули, нужно разделять анализ"
        elif cv > 1.0:
            method = "LOF (Local Outlier Factor)"
            reason = "Высокая вариативность данных"
        elif cv < 0.1:
            method = "Z-score с высоким порогом (3.5-4.0)"
            reason = "Низкая вариативность, только явные выбросы"
        else:
            method = "AMMAD (адаптивный метод)"
            reason = "Средняя вариативность, нужна адаптация"
        
        recommendations.append({
            'Параметр': param_name,
            'Нулевых (%)': zero_pct,
            'Коэф. вариации': cv,
            'Рекомендуемый метод': method,
            'Обоснование': reason
        })
    
    df_recommendations = pd.DataFrame(recommendations)
    df_recommendations = df_recommendations.sort_values('Нулевых (%)', ascending=False)
    
    print("\n📋 ДЕТАЛЬНЫЕ РЕКОМЕНДАЦИИ:")
    print(df_recommendations.to_string(index=False))
    
    # Сохранение рекомендаций
    rec_filename = f'analysis_results/recommendations_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    df_recommendations.to_csv(rec_filename, index=False, encoding='utf-8')
    print(f"\n📁 Рекомендации сохранены в: {rec_filename}")

def main():
    """Основная функция."""
    print("="*80)
    print("🔬 АНАЛИЗ ПАРАМЕТРОВ БУРЕНИЯ - ПОЛНЫЙ ТЕСТ")
    print("="*80)
    
    # Загрузка данных
    df = load_test_data("default.TXT")
    
    if df is None:
        print("❌ Не удалось загрузить данные")
        return
    
    # 12 ключевых параметров
    drilling_parameters = [
        "глубина",
        "скорость_бурения", 
        "вес_на_крюке",
        "момент_ротора",
        "обороты_ротора",
        "давление_на_входе",
        "расход_на_входе",
        "температура_на_выходе",
        "уровень_в_емкости",
        "скорость_спо",
        "нагрузка",
        "дмк"
    ]
    
    # Проверка наличия параметров
    available_params = [p for p in drilling_parameters if p in df.columns]
    print(f"\n✅ Найдено параметров: {len(available_params)} из {len(drilling_parameters)}")
    
    if not available_params:
        print("❌ Не найдено ни одного ключевого параметра")
        return
    
    # Анализ всех параметров
    all_results = analyze_all_parameters(df, available_params)
    
    print("\n" + "="*80)
    print("✅ АНАЛИЗ ЗАВЕРШЕН УСПЕШНО!")
    print("="*80)
    
    # Краткая статистика
    print("\n📊 ИТОГОВАЯ СТАТИСТИКА:")
    total_records = sum([r['total_records'] for r in all_results.values()])
    avg_zero_pct = np.mean([r['zero_analysis']['zero_percentage'] for r in all_results.values()])
    
    print(f"  Проанализировано параметров: {len(all_results)}")
    print(f"  Всего записей (суммарно): {total_records:,}")
    print(f"  Средний % нулевых значений: {avg_zero_pct:.1f}%")
    
    # Наиболее проблемные параметры (по % нулевых значений)
    high_zero = sorted([(p, r['zero_analysis']['zero_percentage']) 
                       for p, r in all_results.items()], 
                      key=lambda x: x[1], reverse=True)[:3]
    
    print(f"\n🔴 ТОП-3 параметра с наибольшим % нулевых значений:")
    for param, pct in high_zero:
        print(f"  {param:25}: {pct:6.1f}%")
    
    # Наиболее стабильные параметры (по коэффициенту вариации)
    stable_params = []
    for param, results in all_results.items():
        mean_val = results['basic_stats']['mean']
        std_val = results['basic_stats']['std']
        if mean_val != 0:
            cv = std_val / mean_val
            if cv < 0.1:  # Очень стабильные
                stable_params.append((param, cv))
    
    if stable_params:
        print(f"\n🟢 ОЧЕНЬ СТАБИЛЬНЫЕ ПАРАМЕТРЫ (CV < 0.1):")
        for param, cv in sorted(stable_params, key=lambda x: x[1]):
            print(f"  {param:25}: CV = {cv:.4f}")

if __name__ == "__main__":
    main()