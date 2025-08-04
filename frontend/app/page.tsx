"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useCallback, ChangeEvent } from "react";
import Papa from "papaparse";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

import AnomalyModal from "./components/AnomalyModal";
import { StatusDisplay } from "./components/StatusDisplay";
import { GraphControls } from "./components/GraphControls";
import { AnomalyDetectionMethod, AnomalyInfo } from "./components/types";

const MAX_DATA_POINTS = 1000;
const FFT_WINDOW_SIZE = 256;
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

function zScore(data: number[]): boolean {
  const WINDOW_SIZE = 50;
  if (data.length < WINDOW_SIZE) {
    console.log(
      `[Z-score] Недостаточно данных для анализа: ${data.length}/${WINDOW_SIZE}`
    );
    return false;
  }

  const window = data.slice(-WINDOW_SIZE);
  const mean = window.reduce((sum, val) => sum + val, 0) / window.length;
  const variance =
    window.map((val) => (val - mean) ** 2).reduce((sum, val) => sum + val, 0) /
    window.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    console.log(
      `[Z-score] Стандартное отклонение равно 0. Невозможно вычислить Z-score.`
    );
    return false;
  }

  const lastValue = window[window.length - 1];
  const z = Math.abs((lastValue - mean) / stdDev);

  const Z_SCORE_THRESHOLD = 5;
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

function lof(data: number[]): boolean {
  const WINDOW_SIZE = 10;
  if (data.length < WINDOW_SIZE) {
    console.log(
      `[LOF] Недостаточно данных для анализа: ${data.length}/${WINDOW_SIZE}`
    );
    return false;
  }

  const window = data.slice(-WINDOW_SIZE);
  const lastValue = window[window.length - 1];
  const avg = window.reduce((sum, val) => sum + val, 0) / window.length;

  const LOF_THRESHOLD = 1.0;
  if (Math.abs(avg) < 1e-6) {
    const isAnomaly = Math.abs(lastValue) > 1e-6;
    console.log(
      `[LOF] Среднее значение в окне почти 0. Последнее значение: ${lastValue}. ${
        isAnomaly ? "АНОМАЛИЯ" : "Норма"
      }`
    );
    return isAnomaly;
  }

  const deviationRatio = Math.abs(lastValue - avg) / Math.abs(avg);
  const isAnomaly = deviationRatio > LOF_THRESHOLD;

  console.log(
    `[LOF] Значение: ${lastValue.toFixed(2)}, Среднее в окне: ${avg.toFixed(
      2
    )}, Отклонение: ${deviationRatio.toFixed(2)}. Порог: ${LOF_THRESHOLD}. ${
      isAnomaly ? "АНОМАЛИЯ" : "Норма"
    }`
  );

  return isAnomaly;
}

function fft(data: number[]): boolean {
  const N = FFT_WINDOW_SIZE;
  if (data.length < N) {
    console.log(`[FFT] Недостаточно данных для анализа: ${data.length}/${N}`);
    return false;
  }

  const window = data.slice(-N);
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
      const t = [
        oddFft[k][0] * Math.cos(angle) - oddFft[k][1] * Math.sin(angle),
        oddFft[k][0] * Math.sin(angle) + oddFft[k][1] * Math.cos(angle),
      ];
      result[k] = [evenFft[k][0] + t[0], evenFft[k][1] + t[1]];
      result[k + half] = [evenFft[k][0] - t[0], evenFft[k][1] - t[1]];
    }
    return result;
  }

  const fftResult = _fftRecursive(complexData);
  const magnitudes = fftResult.map((c) => Math.sqrt(c[0] ** 2 + c[1] ** 2));

  const highFreqMagnitudes = magnitudes.slice(N / 4, N / 2);
  const totalMagnitude = magnitudes.reduce((sum, val) => sum + val, 0);
  const highFreqMagnitudeSum = highFreqMagnitudes.reduce(
    (sum, val) => sum + val,
    0
  );

  if (totalMagnitude === 0) {
    console.log(
      "[FFT] Общая магнитуда равна 0. Невозможно вычислить отношение."
    );
    return false;
  }

  const highFreqRatio = highFreqMagnitudeSum / totalMagnitude;
  const HIGH_FREQ_THRESHOLD = 0.5;
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
  });
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

  const fullDataRef = useRef<DynamicSensorData[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const dataIndexRef = useRef<number>(0);

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
      // КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Увеличен порог разогрева
      const WARM_UP_THRESHOLD = FFT_WINDOW_SIZE * 2; // 256 * 2 = 512

      console.log(
        `[Анализ] Проверка параметра "${paramKey}" с методом "${method}". Точек в выборке: ${data.length}`
      );

      if (data.length < WARM_UP_THRESHOLD) {
        console.log(
          `[Анализ] Фаза разогрева. Текущих точек ${data.length}, требуется ${WARM_UP_THRESHOLD}. Обнаружение аномалий пропущено.`
        );
        return false;
      }

      const values = data
        .slice(-FFT_WINDOW_SIZE)
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
          isAnomaly = fft(values);
          break;
        case "Z-score":
          isAnomaly = zScore(values);
          break;
        case "LOF":
        default:
          isAnomaly = lof(values);
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
    []
  );

  const startDataSimulation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setLiveData([]);
    setAnomalyInfo([]);
    dataIndexRef.current = 0;
    console.log("[Симуляция] Начинаем загрузку данных. Интервал: 10 мс.");

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
    }, 10);
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
      const timeMatch = flightStartLine.match(
        /(\d{1,2}) (.*) (\d{4})г. (\d{1,2}):(\d{1,2})/
      );
      let startTime = null;
      if (timeMatch) {
        const [, day, monthStr, year, hour, minute] = timeMatch;
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
                      y: liveData.map((d) => {
                        const time = d["Время"];
                        return typeof time === "string"
                          ? parseFloat(time.replace(",", "."))
                          : time;
                      }),
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
                        .map((info) => {
                          const time = info.timestamp;
                          return typeof time === "string"
                            ? parseFloat(time.replace(",", "."))
                            : time;
                        }),
                      mode: "markers",
                      type: "scatter",
                      name: "Аномалия",
                      marker: {
                        color: "red",
                        symbol: "triangle-up",
                        size: 10,
                      },
                    },
                  ]}
                  layout={{
                    autosize: true,
                    margin: { l: 70, r: 10, t: 20, b: 40 },
                    xaxis: { title: paramKey },
                    yaxis: { title: "Время" },
                    height: 300,
                    hovermode: "x unified",
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
