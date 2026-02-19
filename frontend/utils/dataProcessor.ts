import { DynamicSensorData, AnomalyInfo } from "@/types/types";
import { formatParamName } from "@/utils/utils";

export interface ProcessedDataResult {
  newDataPoint: DynamicSensorData;
  newAnomalies: AnomalyInfo[];
}

export function processIncomingDataPoint(data: any): ProcessedDataResult {
  const newDataPoint: DynamicSensorData = {};
  const newAnomalies: AnomalyInfo[] = [];
  const timestamp = data["время"];

  for (const key in data) {
    if (key === "время") {
      newDataPoint[key] = timestamp;
      continue;
    }

    const value = data[key];

    // Случай 1: Данные в формате [значение, флаг_аномалии] (из WebSocket)
    if (Array.isArray(value) && value.length === 2) {
      const [paramValue, isAnomaly] = value;
      newDataPoint[key] = [paramValue, isAnomaly];

      if (isAnomaly) {
        newAnomalies.push(createAnomalyObject(key, paramValue, timestamp));
      }
    }
    // Случай 2: Объект с полем is_anomaly (часто бывает после парсинга файлов)
    else if (typeof value === "object" && value !== null) {
      const paramValue = value.value ?? 0;
      const isAnomaly = value.is_anomaly ?? false;
      newDataPoint[key] = [paramValue, isAnomaly];
      if (isAnomaly)
        newAnomalies.push(createAnomalyObject(key, paramValue, timestamp));
    }
    // Случай 3: Просто число (без аномалии)
    else {
      const paramValue = parseFloat(value);
      if (!isNaN(paramValue)) {
        newDataPoint[key] = [paramValue, false];
      }
    }
  }

  return { newDataPoint, newAnomalies };
}

function createAnomalyObject(
  key: string,
  value: number,
  timestamp: any,
): AnomalyInfo {
  // Обработка timestamp, если это массив [number, boolean]
  const cleanTimestamp = Array.isArray(timestamp) ? timestamp[0] : timestamp;

  return {
    id: `${Date.now()}-${key}-${Math.random()}`,
    timestamp: cleanTimestamp,
    param: key,
    message: `Аномалия обнаружена в ${formatParamName(key)}: ${value.toFixed(2)}`,
    // Добавьте поля, если они требуются вашим интерфейсом AnomalyInfo (value, type и т.д.)
    value: value,
  } as AnomalyInfo;
}
