"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useCallback } from "react";
import Papa from "papaparse";
import axios from "axios";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

import AnomalyModal from "@/components/AnomalyModal";
import { StatusDisplay } from "@/components/StatusDisplay";
import { GraphControls } from "@/components/GraphControls";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { AnomalyDetectionMethod, AnomalyInfo } from "@/types/types";
import { DynamicSensorData } from "@/types/types";
import {
  excelSerialToJsDate,
  formatDate,
  formatParamName,
  getSparseTimeTicks,
} from "@/utils/utils";

const MAX_DATA_POINTS = 1000;

const GRAPH_COLORS = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf",
];

export default function Home() {
  const [liveData, setLiveData] = useState<DynamicSensorData[]>([]);
  const [anomalyInfo, setAnomalyInfo] = useState<AnomalyInfo[]>([]);
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [doNotShowAgain, setDoNotShowAgain] = useState<boolean>(false);
  const [consecutiveAnomaliesCount, setConsecutiveAnomaliesCount] =
    useState<number>(0);
  const [analysisMethod, setAnalysisMethod] =
    useState<AnomalyDetectionMethod>("FFT");
  const [availableParameters, setAvailableParameters] = useState<string[]>([]);
  const [graphVisibility, setGraphVisibility] = useState<
    Record<string, boolean>
  >({});
  const [flightStart, setFlightStart] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSimulationActive, setIsSimulationActive] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const fullDataRef = useRef<DynamicSensorData[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const dataIndexRef = useRef<number>(0);

  // Используем ref для актуальных значений
  const analysisMethodRef = useRef<AnomalyDetectionMethod>("FFT");
  const thresholdsRef = useRef({
    Z_score: 3,
    LOF: 25,
    FFT: 0.5,
    FFT_WINDOW_SIZE: 64,
    Z_SCORE_WINDOW_SIZE: 50,
    LOF_WINDOW_SIZE: 50,
  });

  const showAnomalyStatus = anomalyInfo.length > 0;

  const [thresholds, setThresholds] = useState({
    Z_score: 3,
    LOF: 25,
    FFT: 0.5,
    FFT_WINDOW_SIZE: 64,
    Z_SCORE_WINDOW_SIZE: 50,
    LOF_WINDOW_SIZE: 50,
  });

  // Обновляем ref при изменении состояния
  useEffect(() => {
    analysisMethodRef.current = analysisMethod;
  }, [analysisMethod]);

  useEffect(() => {
    thresholdsRef.current = thresholds;
  }, [thresholds]);

  // Функция для отправки параметров на сервер
  const sendParametersToServer = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn(
        "[WebSocket] Connection is not open, cannot send parameters"
      );
      return;
    }

    // Используем актуальные значения из ref
    const currentMethod = analysisMethodRef.current;
    const currentThresholds = thresholdsRef.current;

    // Создаем сообщение с учетом текущего метода
    const message: any = {
      method: currentMethod,
    };

    // Добавляем специфичные параметры в зависимости от метода
    if (currentMethod === "FFT") {
      message.window_size = currentThresholds.FFT_WINDOW_SIZE;
      message.score_threshold = currentThresholds.FFT;
      message.FFT = currentThresholds.FFT; // Добавляем для совместимости
    } else if (currentMethod === "Z_score") {
      message.window_size = currentThresholds.Z_SCORE_WINDOW_SIZE;
      message.score_threshold = currentThresholds["Z_score"];
      message.Z_score = currentThresholds["Z_score"];
    } else if (currentMethod === "LOF") {
      message.window_size = currentThresholds.LOF_WINDOW_SIZE;
      message.score_threshold = currentThresholds.LOF;
      message.LOF = currentThresholds.LOF;
    }

    console.log("[WebSocket] Sending updated parameters:", message);
    wsRef.current.send(JSON.stringify(message));
  }, []); // Нет зависимостей, используем ref

  const handleThresholdChange = useCallback(
    (key: string, value: number | string) => {
      const numericValue =
        typeof value === "string" ? parseFloat(value) : value;
      if (!isNaN(numericValue) && numericValue >= 0) {
        setThresholds((prev) => ({
          ...prev,
          [key]: numericValue,
        }));

        // Если WebSocket подключен, отправляем обновленные параметры
        if (isBackendConnected) {
          // Используем setTimeout для асинхронного обновления
          setTimeout(() => {
            sendParametersToServer();
          }, 100);
        }
      }
    },
    [isBackendConnected, sendParametersToServer]
  );

  const handleDoNotShowAgain = () => {
    setDoNotShowAgain(true);
    setIsModalOpen(false);
  };

  const handleDismissAnomaly = () => {
    setAnomalyInfo([]);
  };

  // Функция остановки симуляции
  const stopSimulation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setIsSimulationActive(false);
      console.log("[Симуляция] Симуляция остановлена.");
    }
  }, []);

  const startDataSimulation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setLiveData([]);
    setAnomalyInfo([]);
    dataIndexRef.current = 0;
    console.log("[Симуляция] Начинаем загрузку данных. Интервал: 1000 мс.");

    setIsSimulationActive(true);

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
          intervalRef.current = null;
          setIsSimulationActive(false);
          console.log(
            "[Симуляция] Данные из файла закончились. Симуляция остановлена."
          );
        }
      }
    }, 1000);
  }, []);

  const connectWebSocket = useCallback(() => {
    // Останавливаем симуляцию, если она активна
    stopSimulation();

    if (wsRef.current) {
      console.log("[WebSocket] Closing existing connection.");
      wsRef.current.close();
    }

    setLiveData([]);
    setAnomalyInfo([]);
    setIsBackendConnected(false);
    setConsecutiveAnomaliesCount(0);
    setIsModalOpen(false);
    setIsSimulationActive(false);

    const ws = new WebSocket("ws://127.0.0.1:8000/api/v1/ws");
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WebSocket] Connection established.");
      setIsBackendConnected(true);

      // Отправляем начальные параметры
      setTimeout(() => {
        sendParametersToServer();
      }, 500); // Небольшая задержка для стабилизации соединения
    };

    ws.onmessage = (event) => {
      try {
        const incomingMessage = JSON.parse(event.data);
        const data = incomingMessage.data;

        if (!data) {
          console.warn(
            "[WebSocket] Received message with no 'data' key. Skipping."
          );
          return;
        }

        console.log("[WebSocket] Data received:", data);

        setLiveData((prevData) => {
          const newDataPoint: DynamicSensorData = {};
          let isFirstData = prevData.length === 0;
          const newAnomaliesThisPoint: AnomalyInfo[] = [];

          for (const key in data) {
            if (key === "время") {
              newDataPoint[key] = data[key];
              continue;
            }

            const value = data[key];

            if (Array.isArray(value) && value.length === 2) {
              const [paramValue, isAnomaly] = value;
              newDataPoint[key] = [paramValue, isAnomaly];

              if (isAnomaly) {
                setIsModalOpen(true);
                newAnomaliesThisPoint.push({
                  id: `${Date.now()}-${key}`,
                  timestamp: data["время"] as number,
                  param: key,
                  message: `Аномалия обнаружена в ${formatParamName(
                    key
                  )}: ${paramValue.toFixed(2)}`,
                });
              }
            } else {
              const paramValue = parseFloat(value);
              if (!isNaN(paramValue)) {
                newDataPoint[key] = [paramValue, false];
              } else {
                console.warn(
                  `[WebSocket] Skipping invalid data for key '${key}':`,
                  value
                );
                continue;
              }
            }
          }

          if (newAnomaliesThisPoint.length > 0) {
            setAnomalyInfo((prevInfo) => [
              ...prevInfo,
              ...newAnomaliesThisPoint,
            ]);
          }

          if (isFirstData) {
            const params = Object.keys(newDataPoint).filter(
              (k) => k !== "время" && Array.isArray(newDataPoint[k])
            );
            setAvailableParameters(params);
            setGraphVisibility(
              params.reduce((acc, param) => ({ ...acc, [param]: true }), {})
            );
            setFlightStart(
              excelSerialToJsDate(newDataPoint["время"] as number)
            );
          }

          const updatedData = [...prevData, newDataPoint];
          return updatedData.slice(-MAX_DATA_POINTS);
        });
      } catch (error) {
        console.error("[WebSocket] Error parsing message:", error);
      }
    };

    ws.onclose = (event) => {
      console.log("[WebSocket] Connection closed.", event.code, event.reason);
      setIsBackendConnected(false);
    };

    ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
      setIsBackendConnected(false);
    };
  }, [stopSimulation, sendParametersToServer]);

  const handleAnalysisMethodChange = (method: AnomalyDetectionMethod) => {
    // Если активна симуляция, останавливаем ее
    if (isSimulationActive) {
      stopSimulation();
    }

    setAnalysisMethod(method);

    // Если WebSocket подключен, отправляем новые параметры
    if (isBackendConnected) {
      // Небольшая задержка для того чтобы состояние обновилось
      setTimeout(() => {
        sendParametersToServer();
      }, 100);
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Останавливаем WebSocket соединение
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Останавливаем симуляцию, если она была активна
    stopSimulation();

    setIsLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    // Используем актуальные значения из ref
    const currentMethod = analysisMethodRef.current;
    const currentThresholds = thresholdsRef.current;

    const score_threshold =
      currentMethod === "FFT"
        ? currentThresholds.FFT
        : currentMethod === "Z_score"
        ? currentThresholds["Z_score"]
        : currentThresholds.LOF;

    const window_size =
      currentMethod === "FFT"
        ? currentThresholds.FFT_WINDOW_SIZE
        : currentMethod === "Z_score"
        ? currentThresholds.Z_SCORE_WINDOW_SIZE
        : currentThresholds.LOF_WINDOW_SIZE;

    const url = `http://127.0.0.1:8000/api/v1/analyze/file?method=${currentMethod}&window_size=${window_size}&score_threshold=${score_threshold}`;

    try {
      const response = await axios.post(url, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const parsedData = response.data.data;
      console.log("[File Upload] Data received:", parsedData);

      // Сохраняем данные для симуляции
      fullDataRef.current = parsedData;

      setLiveData([]);
      setAnomalyInfo([]);
      setConsecutiveAnomaliesCount(0);
      setFlightStart(null);
      setIsModalOpen(false);

      if (parsedData.length > 0) {
        const keys = Object.keys(parsedData[0]);
        const filteredKeys = keys.filter(
          (key) => key.toLowerCase() !== "время"
        );
        setAvailableParameters(filteredKeys);

        const initialVisibility = filteredKeys.reduce((acc, key) => {
          acc[key] = true;
          return acc;
        }, {} as Record<string, boolean>);
        setGraphVisibility(initialVisibility);
      }

      // Запускаем симуляцию с загруженными данными
      startDataSimulation();

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
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
      };
      reader.readAsText(file);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("Axios error analyzing file:", error.message);
        if (error.response) {
          console.error("Response data:", error.response.data);
          console.error("Response status:", error.response.status);
        }
      } else {
        console.error("Error analyzing file:", error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchToRealTime = useCallback(() => {
    // Останавливаем симуляцию
    stopSimulation();

    // Сбрасываем данные симуляции
    fullDataRef.current = [];
    dataIndexRef.current = 0;

    // Сбрасываем состояния
    setLiveData([]);
    setAnomalyInfo([]);
    setConsecutiveAnomaliesCount(0);
    setFlightStart(null);

    // Подключаемся к WebSocket
    connectWebSocket();
  }, [connectWebSocket, stopSimulation]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      stopSimulation();
    };
  }, []); // Убраны зависимости, чтобы не переподключаться при каждом изменении

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

  return (
    <div className="min-h-screen bg-gray-50 p-6 relative">
      <h1 className="text-4xl font-extrabold text-center mb-2 text-gray-900">
        WellPro: Мониторинг Буровых Данных
      </h1>

      {flightStart && (
        <p className="text-center text-gray-600 mb-8">
          Начало бурения: {formatDate(flightStart)}
        </p>
      )}

      <StatusDisplay
        anomalyDetected={showAnomalyStatus}
        isBackendConnected={isBackendConnected && !isSimulationActive}
        onDismissAnomaly={handleDismissAnomaly}
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
              handleAnalysisMethodChange(
                e.target.value as AnomalyDetectionMethod
              )
            }
            disabled={!isBackendConnected || isSimulationActive}
            className="p-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="FFT">FFT</option>
            <option value="Z_score">Z-score</option>
            <option value="LOF">LOF</option>
          </select>

          {analysisMethod === "Z_score" && (
            <>
              <label className="text-gray-700 font-medium whitespace-nowrap">
                Порог Z-score:
              </label>

              <input
                type="number"
                value={thresholds["Z_score"]}
                onChange={(e) =>
                  handleThresholdChange("Z_score", parseFloat(e.target.value))
                }
                className="p-2 border border-gray-300 rounded-md shadow-sm w-24 text-sm"
                step="0.1"
                disabled={!isBackendConnected || isSimulationActive}
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
                disabled={!isBackendConnected || isSimulationActive}
              />
            </>
          )}

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
                disabled={!isBackendConnected || isSimulationActive}
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
                disabled={!isBackendConnected || isSimulationActive}
              />
            </>
          )}

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
                disabled={!isBackendConnected || isSimulationActive}
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
                disabled={!isBackendConnected || isSimulationActive}
              />
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
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

          {/* Кнопка остановки симуляции */}
          {isSimulationActive && (
            <button
              onClick={stopSimulation}
              className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-red-700 transition-colors"
            >
              Остановить симуляцию
            </button>
          )}

          {/* Кнопка запуска симуляции (если данные уже загружены, но симуляция остановлена) */}
          {fullDataRef.current.length > 0 && !isSimulationActive && (
            <button
              onClick={startDataSimulation}
              className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-green-700 transition-colors"
            >
              Запустить симуляцию
            </button>
          )}

          <button
            onClick={handleSwitchToRealTime}
            disabled={isSimulationActive}
            className={`px-4 py-2 text-white text-sm font-semibold rounded-lg shadow-md transition-colors ${
              isSimulationActive
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-700"
            }`}
          >
            Режим Real-time
          </button>
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
                  {formatParamName(paramKey)}
                </h3>

                <Plot
                  data={[
                    {
                      x: liveData.map(
                        (d) => (d[paramKey] as [number, boolean])[0]
                      ),
                      y: liveData.map((d) => d["время"]),
                      type: "scatter",
                      mode: "lines",
                      name: formatParamName(paramKey),
                      line: {
                        color: GRAPH_COLORS[index % GRAPH_COLORS.length],
                      },
                      hovertemplate:
                        `<b>${formatParamName(paramKey)}</b>: %{x:.2f}<br>` +
                        `<b>Время</b>: %{customdata}<br>` +
                        `<extra></extra>`,
                      customdata: liveData.map((d) =>
                        formatDate(excelSerialToJsDate(d["время"] as number))
                      ),
                    },
                    {
                      x: anomalyInfo
                        .filter((info) => info.param === paramKey)
                        .map((info) => {
                          const dataPoint = liveData.find(
                            (d) => d["время"] === info.timestamp
                          );
                          return dataPoint
                            ? (dataPoint[paramKey] as [number, boolean])[0]
                            : null;
                        }),
                      y: anomalyInfo
                        .filter((info) => info.param === paramKey)
                        .map((info) => info.timestamp),
                      mode: "markers",
                      type: "scatter",
                      name: "Аномалия",
                      marker: {
                        color: "red",
                        symbol: "x",
                        size: 10,
                      },
                    },
                  ]}
                  layout={{
                    autosize: true,
                    margin: { l: 70, r: 10, t: 20, b: 40 },
                    yaxis: {
                      title: "Время",
                      autorange: "reversed",
                      ...(() => {
                        const [tickValues, tickTexts] = getSparseTimeTicks(
                          liveData,
                          3
                        );
                        return {
                          tickvals: tickValues,
                          ticktext: tickTexts,
                        };
                      })(),
                    },
                    xaxis: {
                      title: "Значение",
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

      {isModalOpen && !doNotShowAgain && (
        <AnomalyModal
          isModalOpen={isModalOpen}
          setIsModalOpen={setIsModalOpen}
          anomalyInfo={anomalyInfo}
          onDoNotShowAgain={handleDoNotShowAgain}
        />
      )}
      <LoadingOverlay isLoading={isLoading} />
    </div>
  );
}
