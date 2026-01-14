# Быстрая инструкция по использованию рефакторенного кода

## 📌 TL;DR (Самое главное)

page.tsx был разбит на компоненты и хуки. Функциональность не изменилась.

### Основные изменения:

- ✅ page.tsx: 835 → 280 строк (-66%)
- ✅ Создано 3 новых компонента
- ✅ Создано 3 новых хука
- ✅ Создано 2 новых утилиты

---

## 🚀 Как использовать

### Новые компоненты

```typescript
// 1. AnalysisMethodSelector - выбор метода анализа
<AnalysisMethodSelector
  analysisMethod={analysisMethod}
  thresholds={thresholds}
  onMethodChange={handleAnalysisMethodChange}
  onThresholdChange={handleThresholdChange}
  isDisabled={false}
/>

// 2. GraphGrid - сетка графиков
<GraphGrid
  liveData={liveData}
  availableParameters={availableParameters}
  graphVisibility={graphVisibility}
  anomalyInfo={anomalyInfo}
/>

// 3. ControlButtons - кнопки управления
<ControlButtons
  isSimulationActive={isSimulationActive}
  hasLoadedData={true}
  isDisabled={false}
  onFileUpload={handleFileChange}
  onStopSimulation={stopSimulation}
  onStartSimulation={startDataSimulation}
  onSwitchToRealTime={handleSwitchToRealTime}
/>
```

### Новые хуки

```typescript
// 1. useWebSocket - управление WebSocket
const { wsRef, connectWebSocket } = useWebSocket({
  setLiveData,
  setAnomalyInfo,
  // ... остальные props
});

// 2. useDataSimulation - симуляция данных
const { startDataSimulation, stopSimulation, fullDataRef } = useDataSimulation({
  setLiveData,
  setAnomalyInfo,
  setIsSimulationActive,
  MAX_DATA_POINTS,
});

// 3. useThresholds - управление порогами (опционально)
const { handleThresholdChange } = useThresholds({
  isBackendConnected,
  onParametersChange: () => {},
});
```

### Новые утилиты

```typescript
// fileUtils.ts
import { analyzeFile, extractFlightStartTimeFromFile } from "@/utils/fileUtils";

const data = await analyzeFile(file, {
  method: "FFT",
  window_size: 64,
  score_threshold: 0.5,
});

const startTime = extractFlightStartTimeFromFile(fileContent);

// thresholdUtils.ts
import {
  buildParametersMessage,
  getThresholdKeysForMethod,
} from "@/utils/thresholdUtils";

const msg = buildParametersMessage("FFT", thresholds);
const keys = getThresholdKeysForMethod("Z_score");
```

---

## 📂 Файловая структура

```
frontend/
├── app/page.tsx                    ← ГЛАВНЫЙ (280 строк)
├── components/
│   ├── AnalysisMethodSelector.tsx ✨ НОВЫЙ
│   ├── GraphGrid.tsx              ✨ НОВЫЙ
│   └── ControlButtons.tsx         ✨ НОВЫЙ
├── hooks/
│   ├── useWebSocket.ts            ✨ НОВЫЙ
│   ├── useDataSimulation.ts       ✨ НОВЫЙ
│   ├── useThresholds.ts           ✨ НОВЫЙ
│   └── index.ts                   ✨ НОВЫЙ
└── utils/
    ├── fileUtils.ts               ✨ НОВЫЙ
    └── thresholdUtils.ts          ✨ НОВЫЙ
```

---

## ✅ Что остается без изменений

- Функциональность приложения
- Работа с WebSocket
- Симуляция данных
- Обработка файлов
- Управление порогами
- Интерфейс пользователя

---

## ⚠️ Важно

1. **Все файлы готовы к использованию** - просто скопируйте их в нужные директории
2. **Типы TypeScript сохранены** - всегда используйте типы
3. **Импорты работают** - используйте @ alias как показано в примерах
4. **Без breaking changes** - старый код совместим

---

## 🔍 Быстрая навигация по новым файлам

| Файл                       | Строк | Нужен для            |
| -------------------------- | ----- | -------------------- |
| AnalysisMethodSelector.tsx | 46    | Выбор метода анализа |
| GraphGrid.tsx              | 90    | Отрисовка графиков   |
| ControlButtons.tsx         | 48    | Кнопки управления    |
| useWebSocket.ts            | 145   | WebSocket логика     |
| useDataSimulation.ts       | 68    | Симуляция данных     |
| useThresholds.ts           | 67    | Управление порогами  |
| fileUtils.ts               | 47    | Работа с файлами     |
| thresholdUtils.ts          | 43    | Помощники порогов    |

---

## 💡 Примеры в контексте

### Загрузка и анализ файла

```typescript
try {
  const params = {
    method: "FFT",
    window_size: 64,
    score_threshold: 0.5,
  };
  const data = await analyzeFile(file, params);
  // ... работа с данными
} catch (error) {
  console.error("File analysis error:", error);
}
```

### Работа с WebSocket

```typescript
const { connectWebSocket, wsRef } = useWebSocket({
  setLiveData,
  setAnomalyInfo,
  // ... остальные функции
});

// Подключиться
connectWebSocket();

// Закрыть
if (wsRef.current) {
  wsRef.current.close();
}
```

### Симуляция данных

```typescript
const { startDataSimulation, stopSimulation } = useDataSimulation({
  setLiveData,
  setAnomalyInfo,
  setIsSimulationActive,
  MAX_DATA_POINTS: 1000,
});

// Запустить
startDataSimulation();

// Остановить
stopSimulation();
```

---

## 📚 Полная документация

- **REFACTORING_NOTES.md** - Полная документация
- **STRUCTURE.md** - Структура проекта
- **NEW_FILES_CHECKLIST.md** - Перечень файлов

---

## 🎯 Следующие шаги

1. ✅ Скопировать все новые файлы
2. ✅ Протестировать приложение
3. ✅ Убедиться, что всё работает
4. ✅ Наслаждаться чистым кодом! 🎉

---

**Вопросы?** Смотрите документацию в корне проекта.
