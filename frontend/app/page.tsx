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
  const wsRef = useRef<WebSocket | null>(null);
  const fullDataRef = useRef<DynamicSensorData[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const dataIndexRef = useRef<number>(0);

  const showAnomalyStatus = anomalyInfo.length > 0;

  const [thresholds, setThresholds] = useState({
    Z_score: 3,
    LOF: 25,
    FFT: 0.5,
    FFT_WINDOW_SIZE: 64,
    Z_SCORE_WINDOW_SIZE: 50,
    LOF_WINDOW_SIZE: 50,
  });

  const handleThresholdChange = useCallback(
    (key: string, value: number | string) => {
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
  const handleDoNotShowAgain = () => {
    setDoNotShowAgain(true);
    setIsModalOpen(false);
  };

  const handleDismissAnomaly = () => {
    setAnomalyInfo([]);
  };

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

  const connectWebSocket = useCallback(
    async (file?: File) => {
      if (wsRef.current) {
        console.log("[WebSocket] Closing existing connection.");
        wsRef.current.close();
      }
      setLiveData([]);
      setAnomalyInfo([]);
      setIsBackendConnected(false);
      setConsecutiveAnomaliesCount(0); // Сброс счетчика
      setIsModalOpen(false); // Сброс модального окна

      const ws = new WebSocket("ws://127.0.0.1:8000/api/v1/ws");
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log("[WebSocket] Connection established.");
        setIsBackendConnected(true);

        const message = {
          method: analysisMethod,
          window_size:
            analysisMethod === "FFT"
              ? thresholds.FFT_WINDOW_SIZE
              : analysisMethod === "Z_score"
              ? thresholds.Z_SCORE_WINDOW_SIZE
              : thresholds.LOF_WINDOW_SIZE,
          score_threshold:
            analysisMethod === "FFT"
              ? thresholds.FFT
              : analysisMethod === "Z_score"
              ? thresholds["Z_score"]
              : thresholds.LOF,
        };

        console.log("[WebSocket] Sending initial parameters:", message);
        ws.send(JSON.stringify(message));
      };

      ws.onmessage = (event) => {
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
          let anomalyFoundInThisPoint = false;
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
                anomalyFoundInThisPoint = true;
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
          } // Обновляем состояние аномалий
          setAnomalyInfo((prevInfo) => [...prevInfo, ...newAnomaliesThisPoint]); // Проверяем и обновляем счетчик последовательных аномалий

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
      };
      ws.onclose = (event) => {
        console.log("[WebSocket] Connection closed.", event.code, event.reason);
        setIsBackendConnected(false);
      };

      ws.onerror = (error) => {
        console.error("[WebSocket] Error:", error);
        setIsBackendConnected(false);
      };
    },
    [analysisMethod, thresholds]
  );

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return; // Закрываем текущее WebSocket-соединение

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null; // Очищаем ссылку
    } // Останавливаем симуляцию, если она была активна
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    const score_threshold =
      analysisMethod === "FFT"
        ? thresholds.FFT
        : analysisMethod === "Z_score"
        ? thresholds["Z_score"]
        : thresholds.LOF;

    const window_size =
      analysisMethod === "FFT"
        ? thresholds.FFT_WINDOW_SIZE
        : analysisMethod === "Z_score"
        ? thresholds.Z_SCORE_WINDOW_SIZE
        : thresholds.LOF_WINDOW_SIZE;

    const url = `http://127.0.0.1:8000/api/v1/analyze/file?method=${analysisMethod}&window_size=${window_size}&score_threshold=${score_threshold}`;

    try {
      const response = await axios.post(url, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const parsedData = response.data.data;
      console.log("[File Upload] Data received:", parsedData);

      setLiveData([]);
      setAnomalyInfo([]);
      setConsecutiveAnomaliesCount(0);
      setFlightStart(null); // Сбрасываем дату начала, если она не в файле
      setIsModalOpen(false);

      if (parsedData.length > 0) {
        const keys = Object.keys(parsedData[0]);
        const filteredKeys = keys.filter(
          (key) => key.toLowerCase() !== "время"
        );
        setAvailableParameters(filteredKeys);

        const initialVisibility = filteredKeys.reduce((acc, key) => {
          acc[key] = true; // Изменено на true для автоматического отображения
          return acc;
        }, {} as Record<string, boolean>);
        setGraphVisibility(initialVisibility);
      }

      let index = 0;

      const intervalId = setInterval(() => {
        if (index < parsedData.length) {
          const newDataPoint = parsedData[index];

          setLiveData((prevData) => {
            const newData = [...prevData, newDataPoint];
            const MAX_DISPLAY_POINTS = 1000;
            return newData.slice(-MAX_DISPLAY_POINTS);
          });

          const newAnomalies: AnomalyInfo[] = [];
          let anomalyFoundInThisPoint = false;
          Object.keys(newDataPoint).forEach((paramKey) => {
            if (paramKey.toLowerCase() === "время") return;

            const paramValue = newDataPoint[paramKey] as [number, boolean];
            const isAnomaly = paramValue[1];

            if (isAnomaly) {
              setIsModalOpen(true);
              anomalyFoundInThisPoint = true;
              newAnomalies.push({
                param: paramKey,
                timestamp: newDataPoint["время"] as number,
                message: `Аномалия обнаружена в ${formatParamName(
                  paramKey
                )}: ${paramValue[0].toFixed(2)}`,
              });
            }
          });

          if (newAnomalies.length > 0) {
            setAnomalyInfo((prevAnomalies) => {
              const currentAnomalies = [...prevAnomalies, ...newAnomalies];
              const uniqueAnomalies = Array.from(
                new Set(currentAnomalies.map((a) => JSON.stringify(a)))
              ).map((s) => JSON.parse(s));
              return uniqueAnomalies;
            });
          } // Обновляем локальный счетчик и открываем модальное окно

          index++;
        } else {
          clearInterval(intervalId);
          setIsLoading(false);
        }
      }, 1000);
      intervalRef.current = intervalId;

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
    // Останавливаем симуляцию, если она была активна
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log("[Симуляция] Симуляция остановлена.");
    } // Сбрасываем все состояния
    setLiveData([]);
    setAnomalyInfo([]);
    setConsecutiveAnomaliesCount(0);
    setFlightStart(null); // Перезапускаем WebSocket-соединение
    connectWebSocket();
  }, [connectWebSocket]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

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

      <StatusDisplay // 3. Обновляем пропс, передавая новую логику
        anomalyDetected={showAnomalyStatus}
        isBackendConnected={isBackendConnected} // 4. Передаем функцию для сброса состояния
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
              setAnalysisMethod(e.target.value as AnomalyDetectionMethod)
            }
            disabled={!isBackendConnected}
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
                disabled={!isBackendConnected}
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
                disabled={!isBackendConnected}
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
                disabled={!isBackendConnected}
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
                disabled={!isBackendConnected}
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
                disabled={!isBackendConnected}
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
                disabled={!isBackendConnected}
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

          <button
            onClick={handleSwitchToRealTime}
            className="px-4 py-2 ml-3 bg-green-600 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-green-700 transition-colors"
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
                      // Значение теперь на оси X
                      x: liveData.map(
                        (d) => (d[paramKey] as [number, boolean])[0]
                      ), // Время теперь на оси Y
                      y: liveData.map((d) => d["время"]),
                      type: "scatter",
                      mode: "lines",
                      name: formatParamName(paramKey),
                      line: {
                        color: GRAPH_COLORS[index % GRAPH_COLORS.length],
                      },
                      hovertemplate:
                        `<b>${formatParamName(paramKey)}</b>: %{x:.2f}<br>` + // Обновлено
                        `<b>Время</b>: %{customdata}<br>` + // Обновлено
                        `<extra></extra>`,
                      customdata: liveData.map((d) =>
                        formatDate(excelSerialToJsDate(d["время"] as number))
                      ),
                    },
                    {
                      // Координаты для аномалий также поменяны
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
                    margin: { l: 70, r: 10, t: 20, b: 40 }, // Конфигурация оси Y
                    yaxis: {
                      title: "Время", // Новое название
                      autorange: "reversed", // Перевернута, как и раньше для времени // Логика для меток времени перенесена на ось Y
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
                    }, // Конфигурация оси X
                    xaxis: {
                      title: "Значение", // Новое название // autorange: "reversed", // Это больше не нужно // Логика для меток времени удалена с оси X
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
