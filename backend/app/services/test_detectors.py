import asyncio
import os
import sys
from collections import defaultdict, deque
import pandas as pd

# Добавляем путь к корневой директории проекта
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

# Импортируем компоненты вашего приложения
from app.methods import METHODS
from app.utils.data_utils import parse_data, filter_required_parameters

# Константы для теста
DEFAULT_FILENAME = "../data/default.TXT"

async def run_benchmark():
    print(f"🚀 Загрузка данных из {DEFAULT_FILENAME}...")
    
    # Проверяем существование файла
    if not os.path.exists(DEFAULT_FILENAME):
        # Пробуем альтернативный путь
        alt_path = os.path.join(os.path.dirname(__file__), DEFAULT_FILENAME)
        if os.path.exists(alt_path):
            file_path = alt_path
        else:
            print(f"❌ Файл {DEFAULT_FILENAME} не найден!")
            print(f"   Искали в: {DEFAULT_FILENAME}")
            print(f"   И в: {alt_path}")
            return
    else:
        file_path = DEFAULT_FILENAME

    with open(file_path, "rb") as f:
        text = f.read()
    
    print(f"📄 Файл загружен, размер: {len(text)} байт")
    
    raw_parsed_data = await parse_data(text, file_path)
    if not raw_parsed_data:
        print("❌ Ошибка парсинга данных.")
        return
        
    # Применяем фильтрацию (12 параметров), как в lifespan
    parsed_data = filter_required_parameters(raw_parsed_data)
    
    total_records = len(parsed_data)
    if total_records == 0:
        print("❌ Нет данных после фильтрации")
        return
        
    params = [k for k in parsed_data[0].keys() if k.lower() != "время"]
    
    print(f"📊 Найдено записей: {total_records}")
    print(f"🔎 Тестируемые параметры ({len(params)} шт.): {', '.join(params)}")
    print("-" * 50)

    # Инициализация счетчиков и буферов
    results = {p: {m: 0 for m in METHODS.keys()} for p in params}
    buffers = defaultdict(lambda: deque(maxlen=100))

    # 2. Основной цикл анализа (имитация потока)
    for i, record in enumerate(parsed_data):
        for key in params:
            value = record.get(key)
            if value is None:
                continue
                
            buffers[key].append(value)
            
            # Начинаем анализ, когда накопилось достаточно значений
            if len(buffers[key]) < 20:
                continue

            for method_name, method_func in METHODS.items():
                try:
                    # Подготовка параметров
                    current_params = {}
                    if method_name == "ammad":
                        current_params["param_name"] = key
                    
                    # Вызов метода
                    is_anomaly = await method_func(data=list(buffers[key]), **current_params)
                    
                    if is_anomaly:
                        results[key][method_name] += 1
                except Exception as e:
                    print(f"Ошибка в методе {method_name} для {key}: {e}")

        if i % 1000 == 0 and i > 0:
            print(f"✅ Обработано {i} из {total_records} строк...")

    # 3. Формирование финального отчета
    report_data = []
    for param in params:
        row = {"Параметр": param}
        for method in METHODS.keys():
            count = results[param][method]
            percentage = (count / total_records) * 100 if total_records > 0 else 0
            row[method] = f"{percentage:.2f}% ({count})"
        report_data.append(row)

    # Сортируем по убыванию общего количества аномалий
    df_report = pd.DataFrame(report_data)
    
    print("\n" + "="*100)
    print(f"📊 СРАВНИТЕЛЬНЫЙ АНАЛИЗ МЕТОДОВ ОБНАРУЖЕНИЯ АНОМАЛИЙ")
    print(f"📁 Файл: {os.path.basename(file_path)}")
    print(f"📈 Всего записей: {total_records}")
    print("="*100)
    print(df_report.to_string(index=False))
    print("="*100)
    
    # 4. Аналитический вывод
    print("\n📝 Ключевые наблюдения:")
    
    # Находим самый чувствительный метод
    method_sums = {m: sum(results[p][m] for p in params) for m in METHODS.keys()}
    most_sensitive = max(method_sums, key=method_sums.get)
    least_sensitive = min(method_sums, key=method_sums.get)
    
    print(f"- Самый чувствительный метод: {most_sensitive.upper()} ({method_sums[most_sensitive]} аномалий)")
    print(f"- Самый строгий метод: {least_sensitive.upper()} ({method_sums[least_sensitive]} аномалий)")
    
    # Сравнение для ключевых параметров
    key_params = ["расход_на_входе", "скорость_спо", "вес_на_крюке", "давление_на_входе"]
    for param in key_params:
        if param in results:
            values = []
            for method in METHODS.keys():
                cnt = results[param][method]
                values.append((method, cnt))
            
            if values:
                max_method, max_val = max(values, key=lambda x: x[1])
                min_method, min_val = min(values, key=lambda x: x[1])
                print(f"- '{param}': максимум у {max_method.upper()} ({max_val}), минимум у {min_method.upper()} ({min_val})")

    # Сохраняем отчет в файл
    output_file = os.path.join(os.path.dirname(__file__), "benchmark_results.csv")
    df_report.to_csv(output_file, index=False)
    print(f"\n💾 Отчет сохранен в: {output_file}")

if __name__ == "__main__":
    asyncio.run(run_benchmark())