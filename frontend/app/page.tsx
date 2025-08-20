"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useCallback } from "react";
import Papa from "papaparse";
import axios from "axios";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

import AnomalyModal from "./components/AnomalyModal";
import { StatusDisplay } from "./components/StatusDisplay";
import { GraphControls } from "./components/GraphControls";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { AnomalyDetectionMethod, AnomalyInfo } from "./components/types";

const MAX_DATA_POINTS = 1000;
type DynamicSensorData = Record<string, number | string | [number, boolean]>;

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

const excelSerialToJsDate = (serial: number | string): Date => {
  const num =
    typeof serial === "string" ? parseFloat(serial.replace(",", ".")) : serial;
  const daysBefore1970 = 25569;
  const msInDay = 86400000;
  const unixMilliseconds = (num - daysBefore1970) * msInDay;
  const date = new Date(unixMilliseconds);
  date.setDate(date.getDate() + 1);

  return date;
};

// 💡 Новая функция для выборки меток времени
const getSparseTimeTicks = (
  data: DynamicSensorData[],
  count: number
): [number[], string[]] => {
  if (data.length === 0) return [[], []];

  const tickValues = [];
  const tickTexts = [];
  const step = Math.max(1, Math.floor(data.length / count));

  for (let i = 0; i < data.length; i += step) {
    const d = data[i];
    const excelSerial = d["время"] as number;
    const jsDate = excelSerialToJsDate(excelSerial);
    tickValues.push(excelSerial);
    tickTexts.push(jsDate.toLocaleTimeString("ru-RU"));
  }

  // Убедитесь, что последняя точка всегда включена
  if (
    tickValues.length === 0 ||
    tickValues[tickValues.length - 1] !== data[data.length - 1]["время"]
  ) {
    const lastDataPoint = data[data.length - 1];
    tickValues.push(lastDataPoint["время"] as number);
    tickTexts.push(
      excelSerialToJsDate(lastDataPoint["время"] as number).toLocaleTimeString(
        "ru-RU"
      )
    );
  }

  // Ограничиваем количество меток до 'count'
  if (tickValues.length > count) {
    const newTickValues = [];
    const newTickTexts = [];
    const newStep = Math.max(1, Math.floor(tickValues.length / count));
    for (let i = 0; i < tickValues.length; i += newStep) {
      newTickValues.push(tickValues[i]);
      newTickTexts.push(tickTexts[i]);
    }
    // Убедимся, что последняя метка всегда есть
    if (
      newTickValues[newTickValues.length - 1] !==
      tickValues[tickValues.length - 1]
    ) {
      newTickValues.push(tickValues[tickValues.length - 1]);
      newTickTexts.push(tickTexts[tickTexts.length - 1]);
    }
    return [newTickValues, newTickTexts];
  }

  return [tickValues, tickTexts];
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
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);

  const fullDataRef = useRef<DynamicSensorData[]>([]);
  const intervalRef = useRef<Node.js.Timeout | null>(null);
  const dataIndexRef = useRef<number>(0);

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
                anomalyFoundInThisPoint = true;
                const newAnomaly = {
                  id: `${Date.now()}-${key}`,
                  timestamp: data["время"] as string,
                  param: key,
                  message: `Аномалия обнаружена в ${key}: ${paramValue.toFixed(
                    2
                  )}`,
                };
                setAnomalyInfo((prevInfo) => [...prevInfo, newAnomaly]);
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

          if (anomalyFoundInThisPoint) {
            setConsecutiveAnomaliesCount((prev) => prev + 1);
          } else {
            setConsecutiveAnomaliesCount(0);
          }

          if (isFirstData) {
            const params = Object.keys(newDataPoint).filter(
              (k) =>
                k !== "время" &&
                !isNaN((newDataPoint[k] as [number, boolean])[0])
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
          return updatedData;
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
    if (!file) return;

    if (wsRef.current) {
      wsRef.current.close();
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

      if (parsedData.length > 0) {
        const keys = Object.keys(parsedData[0]);
        const filteredKeys = keys.filter(
          (key) => key.toLowerCase() !== "время"
        );
        setAvailableParameters(filteredKeys);

        const initialVisibility = filteredKeys.reduce((acc, key) => {
          acc[key] = false;
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
          Object.keys(newDataPoint).forEach((paramKey) => {
            if (paramKey.toLowerCase() === "время") return;

            const paramValue = newDataPoint[paramKey] as [number, boolean];
            const isAnomaly = paramValue[1];

            if (isAnomaly) {
              newAnomalies.push({
                param: paramKey,
                timestamp: newDataPoint["время"] as number,
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
            setConsecutiveAnomaliesCount((prev) => prev + 1);
          } else {
            setConsecutiveAnomaliesCount(0);
          }

          const CONSECUTIVE_ANOMALY_THRESHOLD = 5;
          if (
            !isModalOpen &&
            consecutiveAnomaliesCount >= CONSECUTIVE_ANOMALY_THRESHOLD
          ) {
            setIsModalOpen(true);
          }

          index++;
        } else {
          clearInterval(intervalId);
          setIsLoading(false);
        }
      }, 1000);

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
                      x: liveData.map(
                        (d) => (d[paramKey] as [number, boolean])[0]
                      ),
                      y: liveData.map((d) => d["время"]),
                      type: "scatter",
                      mode: "lines",
                      name: paramKey,
                      line: {
                        color: GRAPH_COLORS[index % GRAPH_COLORS.length],
                      },
                      hovertemplate:
                        `<b>${paramKey}</b>: %{x:.2f}<br>` +
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
                    xaxis: {
                      title: "Значение",
                    },
                    yaxis: {
                      title: "Время",
                      autorange: "reversed",
                      ...(() => {
                        const [tickValues, tickTexts] = getSparseTimeTicks(
                          liveData,
                          5
                        );
                        return {
                          tickvals: tickValues,
                          ticktext: tickTexts,
                        };
                      })(),
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
      <AnomalyModal
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        anomalyInfo={anomalyInfo}
      />

      <LoadingOverlay isLoading={isLoading} />
    </div>
  );
}
