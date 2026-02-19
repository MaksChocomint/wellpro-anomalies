import asyncio
import pandas as pd
from collections import deque
from methods import METHODS, _ammad_detectors 

async def test_all_params():
    try:
        df = pd.read_csv('synthetic_tests.csv')
    except FileNotFoundError:
        print("❌ Сначала запусти генератор!")
        return

    _ammad_detectors.clear()
    params = df.columns
    buffers = {p: deque(maxlen=100) for p in params}
    
    # Ищем аномалии программно (где значение выходит за 3 сигмы от среднего по колонке)
    # Это поможет нам автоматически составить список точек для проверки
    print(f"🔍 Запуск стресс-теста на 12 параметрах...")
    print(f"{'Параметр':<22} | {'Индекс':<4} | {'Метод':<8} | {'Результат'}")
    print("-" * 65)

    for idx, row in df.iterrows():
        for p in params:
            val = row[p]
            buffers[p].append(val)
            
            # Логика: если значение в этой строке сильно отличается от медианы колонки, тестируем методы
            median = df[p].median()
            std = df[p].std()
            
            if abs(val - median) > std * 4 or (p == 'обороты_ротора' and idx == 250):
                current_data = list(buffers[p])
                if len(current_data) < 30: continue # Ждем накопления окна

                for m_name, m_func in METHODS.items():
                    try:
                        if m_name == "ammad":
                            res = await m_func(current_data, param_name=p)
                        else:
                            res = await m_func(current_data)
                        
                        status = "🔴 ПОЙМАЛ" if res else "⚪ ---"
                        print(f"{p:<22} | {idx:<4} | {m_name:<8} | {status}")
                    except:
                        pass
                print("-" * 65)

if __name__ == "__main__":
    asyncio.run(test_all_params())