# Новые файлы после декомпозиции page.tsx

## Компоненты (frontend/components)

### 1. AnalysisMethodSelector.tsx

**Назначение:** Компонент выбора метода анализа и управления порогами  
**Размер:** 46 строк  
**Используется в:** page.tsx

```typescript
<AnalysisMethodSelector
  analysisMethod={analysisMethod}
  thresholds={thresholds}
  onMethodChange={handleAnalysisMethodChange}
  onThresholdChange={handleThresholdChange}
  isDisabled={!isBackendConnected || isSimulationActive}
/>
```

### 2. GraphGrid.tsx

**Назначение:** Сетка интерактивных графиков Plotly  
**Размер:** 90 строк  
**Используется в:** page.tsx

```typescript
<GraphGrid
  liveData={liveData}
  availableParameters={availableParameters}
  graphVisibility={graphVisibility}
  anomalyInfo={anomalyInfo}
/>
```

### 3. ControlButtons.tsx

**Назначение:** Кнопки управления загрузкой, симуляцией и режимами  
**Размер:** 48 строк  
**Используется в:** page.tsx

```typescript
<ControlButtons
  isSimulationActive={isSimulationActive}
  hasLoadedData={useDataSimulationHook.fullDataRef.current.length > 0}
  isDisabled={isSimulationActive}
  onFileUpload={handleFileChange}
  onStopSimulation={useDataSimulationHook.stopSimulation}
  onStartSimulation={useDataSimulationHook.startDataSimulation}
  onSwitchToRealTime={handleSwitchToRealTime}
/>
```

---

## Хуки (frontend/hooks)

### 1. useWebSocket.ts

**Назначение:** Управление WebSocket соединением и получением данных  
**Размер:** 145 строк

**Экспортирует:**

- `connectWebSocket()` - Подключение к WebSocket
- `wsRef` - Ссылка на WebSocket

**Принимает:**

```typescript
{
  setLiveData,
    setAnomalyInfo,
    setIsBackendConnected,
    setConsecutiveAnomaliesCount,
    setIsModalOpen,
    setAvailableParameters,
    setGraphVisibility,
    setFlightStart,
    sendParametersToServer,
    MAX_DATA_POINTS;
}
```

### 2. useDataSimulation.ts

**Назначение:** Симуляция потока данных из загруженного файла  
**Размер:** 68 строк

**Экспортирует:**

- `startDataSimulation()` - Запуск симуляции
- `stopSimulation()` - Остановка симуляции
- `fullDataRef` - Ссылка на полные данные
- `intervalRef` - Ссылка на интервал
- `dataIndexRef` - Ссылка на индекс данных

**Принимает:**

```typescript
{
  setLiveData, setAnomalyInfo, setIsSimulationActive, MAX_DATA_POINTS;
}
```

### 3. useThresholds.ts

**Назначение:** Управление порогами анализа для разных методов  
**Размер:** 67 строк

**Экспортирует:**

- `handleThresholdChange()` - Обновление порога
- `getThresholdValue()` - Получение значения порога
- `buildMessageForMethod()` - Построение сообщения
- `thresholdsRef` - Ссылка на пороги

**Принимает:**

```typescript
{
  isBackendConnected, onParametersChange;
}
```

### 4. index.ts

**Назначение:** Индекс для удобства импорта  
**Размер:** 3 строки

```typescript
export { useWebSocket } from "./useWebSocket";
export { useDataSimulation } from "./useDataSimulation";
export { useThresholds } from "./useThresholds";
```

---

## Утилиты (frontend/utils)

### 1. fileUtils.ts

**Назначение:** Функции для работы с файлами  
**Размер:** 47 строк

**Экспортирует:**

- `analyzeFile(file, params)` - Загрузка и анализ файла
- `extractFlightStartTimeFromFile(fileContent)` - Извлечение времени начала

```typescript
// Использование
const data = await analyzeFile(file, {
  method: "FFT",
  window_size: 64,
  score_threshold: 0.5,
});

const startTime = extractFlightStartTimeFromFile(fileText);
```

### 2. thresholdUtils.ts

**Назначение:** Помощники для работы с порогами анализа  
**Размер:** 43 строки

**Экспортирует:**

- `buildParametersMessage(method, thresholds)` - Формирование сообщения
- `getThresholdKeysForMethod(method)` - Получение ключей порогов
- `getThresholdLabel(key)` - Получение метки для UI

```typescript
// Использование
const message = buildParametersMessage("FFT", thresholds);
const keys = getThresholdKeysForMethod("Z_score");
const label = getThresholdLabel("FFT_WINDOW_SIZE");
```

---

## Файлы документации

### 1. REFACTORING_NOTES.md

Подробная документация всех изменений с примерами

### 2. STRUCTURE.md

Визуальная структура проекта с древом файлов

### 3. REFACTORING_SUMMARY.md (в корне)

Итоговый отчет о рефакторинге

---

## Статистика

| Категория    | Количество | Строк кода |
| ------------ | ---------- | ---------- |
| Компоненты   | 3          | 184        |
| Хуки         | 3          | 280        |
| Утилиты      | 2          | 90         |
| Документация | 3          | -          |
| **Итого**    | **11**     | **554**    |

---

## Проверка импортов

Все импорты работают корректно:

```typescript
// page.tsx импортирует:
import { AnalysisMethodSelector } from "@/components/AnalysisMethodSelector";
import { GraphGrid } from "@/components/GraphGrid";
import { ControlButtons } from "@/components/ControlButtons";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useDataSimulation } from "@/hooks/useDataSimulation";
import { analyzeFile, extractFlightStartTimeFromFile } from "@/utils/fileUtils";
import { buildParametersMessage } from "@/utils/thresholdUtils";
```

---

## Миграция

Если вы обновляете существующий проект:

1. Скопируйте все новые файлы в соответствующие директории
2. Замените содержимое `page.tsx`
3. Проверьте, что все импорты работают
4. Протестируйте приложение

**Функциональность остается 100% прежней!** ✅
