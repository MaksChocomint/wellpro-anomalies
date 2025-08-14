"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useCallback } from "react";
import Papa from "papaparse";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

import AnomalyModal from "./components/AnomalyModal";
import { StatusDisplay } from "./components/StatusDisplay";
import { GraphControls } from "./components/GraphControls";
import { AnomalyDetectionMethod, AnomalyInfo } from "./components/types";

const MAX_DATA_POINTS = 1000;
const CONSECUTIVE_ANOMALY_THRESHOLD = 5;

// Динамический тип для данных, ключи берутся из файла
type DynamicSensorData = Record<string, number | string>;

// Массив цветов для графиков
const GRAPH_COLORS = [
  "#1f77b4", // синий
  "#ff7f0e", // оранжевый
  "#2ca02c", // зеленый
  "#d62728", // красный
  "#9467bd", // фиолетовый
  "#8c564b", // коричневый
  "#e377c2", // розовый
  "#7f7f7f", // серый
  "#bcbd22", // оливковый
  "#17becf", // бирюзовый
];

// ----------------------------------------------------------------------
//
// ФУНКЦИИ ДЛЯ ОБНАРУЖЕНИЯ АНОМАЛИЙ
//
// ----------------------------------------------------------------------

function zScore(
  data: number[],
  threshold: number,
  windowSize: number
): boolean {
  const WINDOW_SIZE = windowSize;
  if (data.length <= WINDOW_SIZE) {
    console.log(`[Z-score] Недостаточно данных: ${data.length}/${WINDOW_SIZE}`);
    return false;
  }

  const window = data.slice(-WINDOW_SIZE - 1, -1);
  const lastValue = data[data.length - 1];

  const mean = window.reduce((sum, val) => sum + val, 0) / window.length;
  const variance =
    window.reduce((sum, val) => sum + (val - mean) ** 2, 0) /
    (window.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    console.log(
      "[Z-score] Стандартное отклонение равно 0. Невозможно вычислить Z-score."
    );
    return false;
  }

  const z = Math.abs((lastValue - mean) / stdDev);
  const Z_SCORE_THRESHOLD = threshold;
  const isAnomaly = z > Z_SCORE_THRESHOLD;

  console.log(
    `[Z-score] Значение: ${lastValue.toFixed(2)}, Среднее: ${mean.toFixed(
      2
    )}, Ст.откл: ${stdDev.toFixed(2)}, Z-score: ${z.toFixed(
      2
    )}. Порог: ${Z_SCORE_THRESHOLD}. ${isAnomaly ? "АНОМАЛИЯ" : "Норма"}`
  );

  return isAnomaly;
}

function lof(data: number[], threshold: number, windowSize: number): boolean {
  const WINDOW_SIZE = windowSize;
  const K = 5;
  const EPS = 1e-6; // минимальное расстояние
  const MAX_DENSITY = 1e3; // ограничение максимальной плотности

  if (data.length <= WINDOW_SIZE) {
    console.log(`[LOF] Недостаточно данных: ${data.length}/${WINDOW_SIZE}`);
    return false;
  }

  const window = data.slice(-WINDOW_SIZE - 1, -1);
  const lastValue = data[data.length - 1];

  // Проверка на "все точки почти одинаковые"
  const allSame =
    window.every((v) => Math.abs(v - window[0]) < EPS) &&
    Math.abs(lastValue - window[0]) < EPS;
  if (allSame) {
    console.log(`[LOF] Все значения почти одинаковые. LOF = 1. Норма.`);
    return false;
  }

  const distance = (a: number, b: number) => Math.abs(a - b);

  const kNearest = (point: number, arr: number[], k: number) =>
    arr
      .map((val) => ({ val, dist: distance(point, val) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, k);

  const localReachDensity = (point: number, arr: number[]) => {
    const neighbors = kNearest(point, arr, K);
    const meanDist =
      neighbors.reduce((sum, n) => sum + n.dist, 0) / neighbors.length;
    const density = 1 / Math.max(meanDist, EPS);
    return Math.min(density, MAX_DENSITY); // ограничиваем плотность
  };

  const lrdLast = localReachDensity(lastValue, window);

  const neighbors = kNearest(lastValue, window, K);
  const lofScore =
    neighbors.reduce(
      (sum, n) => sum + localReachDensity(n.val, window) / lrdLast,
      0
    ) / neighbors.length;

  const LOF_THRESHOLD = threshold;
  const isAnomaly = lofScore > LOF_THRESHOLD;

  console.log(
    `[LOF] Значение: ${lastValue.toFixed(2)}, LOF-оценка: ${lofScore.toFixed(
      4
    )}, Порог: ${LOF_THRESHOLD}. ${isAnomaly ? "АНОМАЛИЯ" : "Норма"}`
  );

  return isAnomaly;
}

function fft(data: number[], threshold: number, windowSize: number): boolean {
  const FFT_WINDOW_SIZE = windowSize; // степень двойки
  const EPS = 1e-12;

  if (data.length < FFT_WINDOW_SIZE) {
    console.log(`[FFT] Недостаточно данных: ${data.length}/${FFT_WINDOW_SIZE}`);
    return false;
  }

  const window = data.slice(-FFT_WINDOW_SIZE);
  const complexData: [number, number][] = window.map((val) => [val, 0]);

  function _fftRecursive(arr: [number, number][]): [number, number][] {
    const n = arr.length;
    if (n <= 1) return arr;

    const half = n / 2;
    const even: [number, number][] = [];
    const odd: [number, number][] = [];

    for (let i = 0; i < half; i++) {
      even.push(arr[i * 2]);
      odd.push(arr[i * 2 + 1]);
    }

    const evenFft = _fftRecursive(even);
    const oddFft = _fftRecursive(odd);
    const result: [number, number][] = new Array(n);

    for (let k = 0; k < half; k++) {
      const angle = (-2 * Math.PI * k) / n;
      const t: [number, number] = [
        oddFft[k][0] * Math.cos(angle) - oddFft[k][1] * Math.sin(angle),
        oddFft[k][0] * Math.sin(angle) + oddFft[k][1] * Math.cos(angle),
      ];
      result[k] = [evenFft[k][0] + t[0], evenFft[k][1] + t[1]];
      result[k + half] = [evenFft[k][0] - t[0], evenFft[k][1] - t[1]];
    }
    return result;
  }

  const fftResult = _fftRecursive(complexData);
  const magnitudes = fftResult.map(([re, im]) => Math.sqrt(re ** 2 + im ** 2));

  const highFreqMagnitudes = magnitudes.slice(
    FFT_WINDOW_SIZE / 4,
    FFT_WINDOW_SIZE / 2
  );
  const totalMagnitude = magnitudes.reduce((sum, val) => sum + val, 0);
  const highFreqMagnitudeSum = highFreqMagnitudes.reduce(
    (sum, val) => sum + val,
    0
  );

  if (totalMagnitude < EPS) {
    console.log(
      "[FFT] Общая магнитуда слишком мала. Невозможно вычислить отношение."
    );
    return false;
  }

  const highFreqRatio = highFreqMagnitudeSum / totalMagnitude;
  const HIGH_FREQ_THRESHOLD = threshold;
  const isAnomaly = highFreqRatio > HIGH_FREQ_THRESHOLD;

  console.log(
    `[FFT] Отношение высокочастотной энергии к общей: ${highFreqRatio.toFixed(
      2
    )}. Порог: ${HIGH_FREQ_THRESHOLD}. ${isAnomaly ? "АНОМАЛИЯ" : "Норма"}`
  );

  return isAnomaly;
}

// ----------------------------------------------------------------------
//
// КОНЕЦ ФУНКЦИЙ
//
// ----------------------------------------------------------------------

// Утилитарная функция для форматирования даты
const formatDate = (date: Date | null) => {
  if (!date) return "N/A";
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const excelSerialToJsDate = (serial: number | string): Date => {
  const num =
    typeof serial === "string" ? parseFloat(serial.replace(",", ".")) : serial;

  const daysBefore1970 = 25569;
  const msInDay = 86400000;
  const unixMilliseconds = (num - daysBefore1970) * msInDay;

  const date = new Date(unixMilliseconds);
  date.setUTCDate(date.getUTCDate() + 1); // фикс бага Excel 1900

  // Отнимаем 4 часа
  date.setHours(date.getHours() - 4);

  return date;
};

export default function Home() {
  const [liveData, setLiveData] = useState<DynamicSensorData[]>([]);
  const [anomalyInfo, setAnomalyInfo] = useState<AnomalyInfo[]>([]);
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [consecutiveAnomaliesCount, setConsecutiveAnomaliesCount] =
    useState<number>(0);
  const [analysisMethod, setAnalysisMethod] =
    useState<AnomalyDetectionMethod>("FFT");
  const [availableParameters, setAvailableParameters] = useState<string[]>([]);
  const [graphVisibility, setGraphVisibility] = useState<
    Record<string, boolean>
  >({});
  const [flightStart, setFlightStart] = useState<Date | null>(null);
  // Новое состояние для настраиваемых порогов и размеров окон
  const [thresholds, setThresholds] = useState({
    "Z-score": 3,
    LOF: 25,
    FFT: 0.5,
    FFT_WINDOW_SIZE: 64, // Степень двойки для FFT
    Z_SCORE_WINDOW_SIZE: 50,
    LOF_WINDOW_SIZE: 50,
  });

  const fullDataRef = useRef<DynamicSensorData[]>([]);
  const intervalRef = useRef<Node.js.Timeout | null>(null);
  const dataIndexRef = useRef<number>(0);

  // Обработчик для изменения значений порогов
  const handleThresholdChange = useCallback(
    (key: string, value: number | string) => {
      // Парсим значение в число, если оно строковое
      const numericValue =
        typeof value === "string" ? parseFloat(value) : value;

      if (!isNaN(numericValue) && numericValue >= 0) {
        setThresholds((prev) => ({
          ...prev,
          [key]: numericValue,
        }));
      }
    },
    []
  );

  // Логирование смены метода
  useEffect(() => {
    console.log(`[Смена метода] Выбран новый метод анализа: ${analysisMethod}`);
  }, [analysisMethod]);

  const detectAnomaly = useCallback(
    (
      data: DynamicSensorData[],
      method: AnomalyDetectionMethod,
      paramKey: string
    ) => {
      let warmUpThreshold = 0;
      switch (method) {
        case "FFT":
          // Для FFT окно должно быть не меньше размера, кратного двум.
          // Увеличиваем порог для разогрева.
          warmUpThreshold = (thresholds["FFT_WINDOW_SIZE"] as number) * 2;
          break;
        case "Z-score":
          warmUpThreshold = thresholds["Z_SCORE_WINDOW_SIZE"] as number;
          break;
        case "LOF":
        default:
          warmUpThreshold = thresholds["LOF_WINDOW_SIZE"] as number;
          break;
      }

      console.log(
        `[Анализ] Проверка параметра "${paramKey}" с методом "${method}". Точек в выборке: ${data.length}`
      );

      if (data.length < warmUpThreshold) {
        console.log(
          `[Анализ] Фаза разогрева. Текущих точек ${data.length}, требуется ${warmUpThreshold}. Обнаружение аномалий пропущено.`
        );
        return false;
      }

      const values = data
        .slice(-warmUpThreshold)
        .map((d) => {
          const val = d[paramKey];
          return typeof val === "string"
            ? parseFloat(val.replace(",", "."))
            : val;
        })
        .filter((v) => typeof v === "number" && !isNaN(v)) as number[];

      if (values.length === 0) {
        console.log(
          `[Анализ] Некорректные данные для параметра "${paramKey}". Пропуск.`
        );
        return false;
      }

      console.log(
        `[Анализ] Запуск алгоритма "${method}" на ${values.length} последних точках.`
      );
      let isAnomaly = false;
      switch (method) {
        case "FFT":
          isAnomaly = fft(
            values,
            thresholds["FFT"] as number,
            thresholds["FFT_WINDOW_SIZE"] as number
          );
          break;
        case "Z-score":
          isAnomaly = zScore(
            values,
            thresholds["Z-score"] as number,
            thresholds["Z_SCORE_WINDOW_SIZE"] as number
          );
          break;
        case "LOF":
        default:
          isAnomaly = lof(
            values,
            thresholds["LOF"] as number,
            thresholds["LOF_WINDOW_SIZE"] as number
          );
          break;
      }

      if (isAnomaly) {
        console.warn(
          `[!!! АНОМАЛИЯ !!!] Обнаружена аномалия для параметра "${paramKey}" с методом "${method}"`
        );
      } else {
        console.log(
          `[Анализ] Для параметра "${paramKey}" аномалии не найдено.`
        );
      }

      return isAnomaly;
    },
    [thresholds]
  );

  const startDataSimulation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setLiveData([]);
    setAnomalyInfo([]);
    dataIndexRef.current = 0;
    console.log("[Симуляция] Начинаем загрузку данных. Интервал: 1000 мс.");

    intervalRef.current = setInterval(() => {
      if (dataIndexRef.current < fullDataRef.current.length) {
        setLiveData((prevData) => {
          const newData = [
            ...prevData,
            fullDataRef.current[dataIndexRef.current],
          ];
          return newData.slice(-MAX_DATA_POINTS);
        });
        dataIndexRef.current++;
      } else {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          console.log(
            "[Симуляция] Данные из файла закончились. Симуляция остановлена."
          );
        }
      }
    }, 1000);
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result as string;

      const lines = text.split(/\r?\n/);

      const flightStartLine = lines[0];
      console.log(flightStartLine);
      const timeMatch = flightStartLine.match(
        /(\d{1,2}) (.*) (\d{4})г. (\d{1,2}):(\d{1,2})/
      );
      let startTime = null;
      if (timeMatch) {
        const [, day, monthStr, year, hour, minute] = timeMatch;
        console.log(timeMatch);
        const monthIndex = [
          "января",
          "февраля",
          "марта",
          "апреля",
          "мая",
          "июня",
          "июля",
          "августа",
          "сентября",
          "октября",
          "ноября",
          "декабря",
        ].indexOf(monthStr);
        if (monthIndex !== -1) {
          startTime = new Date(
            parseInt(year),
            monthIndex,
            parseInt(day),
            parseInt(hour),
            parseInt(minute)
          );
        }
      }
      setFlightStart(startTime);
      console.log(`[Загрузка файла] Начало бурения: ${formatDate(startTime)}`);

      const dataText = lines.slice(2).join("\n");

      Papa.parse(dataText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        delimiter: "\t",
        complete: (result) => {
          const parsedData = result.data as DynamicSensorData[];

          if (parsedData.length > 0) {
            const keys = Object.keys(parsedData[0]);
            const filteredKeys = keys.filter(
              (key) => key && key.toLowerCase() !== "время"
            );
            setAvailableParameters(filteredKeys);
            console.log(
              `[Загрузка файла] Обнаружены параметры: ${filteredKeys.join(
                ", "
              )}`
            );

            const initialVisibility = filteredKeys.reduce((acc, key) => {
              acc[key] = false;
              return acc;
            }, {} as Record<string, boolean>);
            setGraphVisibility(initialVisibility);
          }

          fullDataRef.current = parsedData;
          startDataSimulation();
        },
        error: (error) => {
          console.error("Error parsing TXT file:", error);
        },
      });
    };

    reader.readAsText(file);
  };

  useEffect(() => {
    if (liveData.length > 0 && availableParameters.length > 0) {
      const newAnomalies: AnomalyInfo[] = [];
      const lastDataPoint = liveData[liveData.length - 1];

      availableParameters.forEach((paramKey) => {
        if (graphVisibility[paramKey]) {
          const anomaly = detectAnomaly(liveData, analysisMethod, paramKey);
          if (anomaly) {
            newAnomalies.push({
              param: paramKey,
              timestamp: lastDataPoint["Время"] as number | string,
            });
          }
        }
      });

      setAnomalyInfo((prevAnomalies) => {
        const currentAnomalies = [...prevAnomalies, ...newAnomalies];
        const uniqueAnomalies = Array.from(
          new Set(currentAnomalies.map((a) => JSON.stringify(a)))
        ).map((s) => JSON.parse(s));
        return uniqueAnomalies;
      });

      if (newAnomalies.length > 0) {
        setConsecutiveAnomaliesCount((prev) => prev + 1);
        if (
          !isModalOpen &&
          consecutiveAnomaliesCount >= CONSECUTIVE_ANOMALY_THRESHOLD
        ) {
          setIsModalOpen(true);
          console.warn(
            `[!!! Тревога !!!] Обнаружено ${
              consecutiveAnomaliesCount + 1
            } аномалий подряд. Открываем модальное окно.`
          );
        }
      } else {
        if (consecutiveAnomaliesCount > 0) {
          console.log(`[Сброс] Последовательность аномалий прервана.`);
        }
        setConsecutiveAnomaliesCount(0);
      }
    }
  }, [
    liveData,
    availableParameters,
    detectAnomaly,
    isModalOpen,
    consecutiveAnomaliesCount,
    analysisMethod,
    graphVisibility,
  ]);

  const handleVisibilityChange = (param: string) => {
    setGraphVisibility((prev) => ({
      ...prev,
      [param]: !prev[param],
    }));
  };

  const handleShowAll = () => {
    const newVisibility = availableParameters.reduce((acc, param) => {
      acc[param] = true;
      return acc;
    }, {} as Record<string, boolean>);
    setGraphVisibility(newVisibility);
  };

  const handleHideAll = () => {
    const newVisibility = availableParameters.reduce((acc, param) => {
      acc[param] = false;
      return acc;
    }, {} as Record<string, boolean>);
    setGraphVisibility(newVisibility);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-4xl font-extrabold text-center mb-2 text-gray-900">
        WellPro: Мониторинг Буровых Данных
      </h1>
      {flightStart && (
        <p className="text-center text-gray-600 mb-8">
          Начало бурения: {formatDate(flightStart)}
        </p>
      )}

      <StatusDisplay
        anomalyDetected={anomalyInfo.length > 0}
        isBackendConnected={isBackendConnected}
      />

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8 p-4 bg-white rounded-xl shadow-md">
        <GraphControls
          graphVisibility={graphVisibility}
          onVisibilityChange={handleVisibilityChange}
          onShowAll={handleShowAll}
          onHideAll={handleHideAll}
          availableParameters={availableParameters}
        />
        <div className="flex items-center gap-3">
          <label
            htmlFor="analysis-method"
            className="text-gray-700 font-medium whitespace-nowrap"
          >
            Метод анализа:
          </label>
          <select
            id="analysis-method"
            value={analysisMethod}
            onChange={(e) =>
              setAnalysisMethod(e.target.value as AnomalyDetectionMethod)
            }
            className="p-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="FFT">FFT</option>
            <option value="Z-score">Z-score</option>
            <option value="LOF">LOF</option>
          </select>

          {/* Поля ввода для Z-score */}
          {analysisMethod === "Z-score" && (
            <>
              <label className="text-gray-700 font-medium whitespace-nowrap">
                Порог Z-score:
              </label>
              <input
                type="number"
                value={thresholds["Z-score"]}
                onChange={(e) =>
                  handleThresholdChange("Z-score", parseFloat(e.target.value))
                }
                className="p-2 border border-gray-300 rounded-md shadow-sm w-24 text-sm"
                step="0.1"
              />
              <label className="text-gray-700 font-medium whitespace-nowrap">
                Размер окна:
              </label>
              <input
                type="number"
                value={thresholds["Z_SCORE_WINDOW_SIZE"]}
                onChange={(e) =>
                  handleThresholdChange(
                    "Z_SCORE_WINDOW_SIZE",
                    parseInt(e.target.value)
                  )
                }
                className="p-2 border border-gray-300 rounded-md shadow-sm w-24 text-sm"
              />
            </>
          )}

          {/* Поля ввода для LOF */}
          {analysisMethod === "LOF" && (
            <>
              <label className="text-gray-700 font-medium whitespace-nowrap">
                Порог LOF:
              </label>
              <input
                type="number"
                value={thresholds["LOF"]}
                onChange={(e) =>
                  handleThresholdChange("LOF", parseFloat(e.target.value))
                }
                className="p-2 border border-gray-300 rounded-md shadow-sm w-24 text-sm"
                step="0.1"
              />
              <label className="text-gray-700 font-medium whitespace-nowrap">
                Размер окна:
              </label>
              <input
                type="number"
                value={thresholds["LOF_WINDOW_SIZE"]}
                onChange={(e) =>
                  handleThresholdChange(
                    "LOF_WINDOW_SIZE",
                    parseInt(e.target.value)
                  )
                }
                className="p-2 border border-gray-300 rounded-md shadow-sm w-24 text-sm"
              />
            </>
          )}

          {/* Поля ввода для FFT */}
          {analysisMethod === "FFT" && (
            <>
              <label className="text-gray-700 font-medium whitespace-nowrap">
                Порог FFT:
              </label>
              <input
                type="number"
                value={thresholds["FFT"]}
                onChange={(e) =>
                  handleThresholdChange("FFT", parseFloat(e.target.value))
                }
                className="p-2 border border-gray-300 rounded-md shadow-sm w-24 text-sm"
                step="0.01"
              />
              <label className="text-gray-700 font-medium whitespace-nowrap">
                Размер окна:
              </label>
              <input
                type="number"
                value={thresholds["FFT_WINDOW_SIZE"]}
                onChange={(e) =>
                  handleThresholdChange(
                    "FFT_WINDOW_SIZE",
                    parseInt(e.target.value)
                  )
                }
                className="p-2 border border-gray-300 rounded-md shadow-sm w-24 text-sm"
                step="16"
              />
            </>
          )}
        </div>
        <div className="flex items-center">
          <label
            htmlFor="file-upload"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-blue-700 cursor-pointer transition-colors"
          >
            Загрузить данные
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".txt"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {availableParameters.map(
          (paramKey, index) =>
            graphVisibility[paramKey] && (
              <div
                key={paramKey}
                className="bg-white p-5 rounded-xl shadow-lg border border-gray-100"
              >
                <h3 className="text-xl font-semibold mb-3 text-gray-800">
                  {paramKey}
                </h3>
                <Plot
                  data={[
                    {
                      x: liveData.map((d) => {
                        const val = d[paramKey];
                        return typeof val === "string"
                          ? parseFloat(val.replace(",", "."))
                          : val;
                      }),
                      y: liveData.map((d) => excelSerialToJsDate(d["Время"])),
                      type: "scatter",
                      mode: "lines",
                      name: paramKey,
                      line: {
                        color: GRAPH_COLORS[index % GRAPH_COLORS.length],
                      },
                    },
                    {
                      x: anomalyInfo
                        .filter((info) => info.param === paramKey)
                        .map((info) => {
                          const dataPoint = liveData.find(
                            (d) => d["Время"] === info.timestamp
                          );
                          const val = dataPoint?.[paramKey];
                          return typeof val === "string"
                            ? parseFloat(val.replace(",", "."))
                            : val;
                        }),
                      y: anomalyInfo
                        .filter((info) => info.param === paramKey)
                        .map((info) => excelSerialToJsDate(info.timestamp)),
                      mode: "markers",
                      type: "scatter",
                      name: "Аномалия",
                      marker: {
                        color: "red",
                        symbol: "triangle-right",
                        size: 10,
                      },
                    },
                  ]}
                  layout={{
                    autosize: true,
                    margin: { l: 70, r: 10, t: 20, b: 40 },
                    xaxis: { title: paramKey },
                    yaxis: {
                      title: "Время",
                      type: "date", // важно — говорит Plotly, что это временная ось
                      autorange: "reversed",
                      tickformat: "%H:%M:%S", // только время
                    },
                    height: 300,
                    hovermode: "y unified",
                  }}
                  useResizeHandler={true}
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            )
        )}
      </div>
      {/* <AnomalyModal
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        anomalyInfo={anomalyInfo}
      /> */}
    </div>
  );
}
