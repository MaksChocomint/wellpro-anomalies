import asyncio
import os
from collections import defaultdict, deque
import pandas as pd

# Импортируем компоненты вашего приложения
from ..methods import METHODS
from ..utils.data_utils import parse_data, filter_required_parameters

# Константы для теста
DEFAULT_FILENAME = "default.TXT"

async def run_benchmark():
    print(f"🚀 Загрузка данных из {DEFAULT_FILENAME}...")
    
    # 1. Загрузка и парсинг данных через ваши утилиты
    if not os.path.exists(DEFAULT_FILENAME):
        print(f"❌ Файл {DEFAULT_FILENAME} не найден!")
        return

    with open(DEFAULT_FILENAME, "rb") as f:
        text = f.read()
    
    raw_parsed_data = await parse_data(text, DEFAULT_FILENAME)
    if not raw_parsed_data:
        print("❌ Ошибка парсинга данных.")
        return
        
    # Применяем фильтрацию (12 параметров), как в lifespan
    parsed_data = filter_required_parameters(raw_parsed_data)
    
    total_records = len(parsed_data)
    params = [k for k in parsed_data[0].keys() if k.lower() != "время"]
    
    print(f"📊 Найдено записей: {total_records}")
    print(f"🔎 Тестируемые параметры: {', '.join(params)}")
    print("-" * 50)

    # Инициализация счетчиков и буферов (deque)
    # Используем размер окна из настроек AMMAD
    results = {p: {m: 0 for m in METHODS.keys()} for p in params}
    buffers = defaultdict(lambda: deque(maxlen=100))

    # 2. Основной цикл анализа (имитация потока)
    for i, record in enumerate(parsed_data):
        for key in params:
            value = record[key]
            buffers[key].append(value)
            
            # Начинаем анализ, когда накопилось хотя бы 20 значений (для стабильности)
            if len(buffers[key]) < 20:
                continue

            for method_name, method_func in METHODS.items():
                # Подготовка параметров
                current_params = {}
                if method_name == "ammad":
                    current_params["param_name"] = key
                
                # Вызов метода (конвертируем deque в list для срезов внутри методов)
                is_anomaly = await method_func(data=list(buffers[key]), **current_params)
                
                if is_anomaly:
                    results[key][method_name] += 1

        if i % 5000 == 0 and i > 0:
            print(f"Обработано {i} строк...")

    # 3. Формирование финального отчета
    report_data = []
    for param in params:
        row = {"Параметр": param}
        for method in METHODS.keys():
            count = results[param][method]
            percentage = (count / total_records) * 100
            row[method] = f"{percentage:.2f}% ({count})"
        report_data.append(row)

    df_report = pd.DataFrame(report_data)
    
    print("\n" + "="*90)
    print(f"СРАВНИТЕЛЬНЫЙ АНАЛИЗ МЕТОДОВ (Файл: {DEFAULT_FILENAME})")
    print("="*90)
    print(df_report.to_string(index=False))
    print("="*90)
    
    # 4. Аналитический вывод
    print("\n📝 Ключевые наблюдения:")
    for param in ["расход_на_входе", "скорость_спо"]:
        if param in results:
            amm_cnt = results[param]['ammad']
            z_cnt = results[param]['z_score']
            diff = amm_cnt - z_cnt
            status = "шире" if diff > 0 else "строже"
            print(f"- На '{param}' AMMAD работает {status} чем Z-score (разница: {abs(diff)} аномалий).")

if __name__ == "__main__":
    asyncio.run(run_benchmark())