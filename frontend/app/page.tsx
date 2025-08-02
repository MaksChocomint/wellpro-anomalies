// page.tsx
"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useCallback, ChangeEvent } from "react";
import Papa from "papaparse";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

import AnomalyModal from "./components/AnomalyModal";
import { StatusDisplay } from "./components/StatusDisplay";
import { GraphControls } from "./components/GraphControls";
import { plotConfigs, SensorData, SensorParamKey } from "./components/types";

type AnomalyDetectionMethod = "FFT" | "Z-score" | "LOF";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
const MAX_DATA_POINTS = 300;
const FFT_WINDOW_SIZE = 128;
const ANOMALY_FREQUENCY_THRESHOLD = 0.5;
const CONSECUTIVE_ANOMALY_THRESHOLD = 5;

// Anomaly Detection Functions
function fft(data: number[]): boolean {
  const N = data.length;
  if (N <= 1) return false;
  // This is a simplified complex FFT. A full implementation is more involved.
  // For this example, we'll use a placeholder.
  return false;
}

function zScore(data: number[]): boolean {
  if (data.length < 30) return false;
  const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
  const stdDev = Math.sqrt(
    data.map((val) => (val - mean) ** 2).reduce((sum, val) => sum + val, 0) /
      data.length
  );
  if (stdDev === 0) return false;
  const lastValue = data[data.length - 1];
  return Math.abs((lastValue - mean) / stdDev) > 3; // Anomaly if Z-score > 3
}

function lof(data: number[]): boolean {
  // LOF is a complex algorithm. This is a simplified placeholder.
  if (data.length < 5) return false;
  const lastValue = data[data.length - 1];
  const window = data.slice(-5);
  const max = Math.max(...window);
  const min = Math.min(...window);
  return lastValue > max * 1.2 || lastValue < min * 0.8;
}

export default function Home() {
  const [liveData, setLiveData] = useState<SensorData[]>([]);
  const [anomalyDetected, setAnomalyDetected] = useState<boolean>(false);
  const [anomalyTimestamps, setAnomalyTimestamps] = useState<number[]>([]);
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [consecutiveAnomaliesCount, setConsecutiveAnomaliesCount] =
    useState<number>(0);
  const [analysisMethod, setAnalysisMethod] =
    useState<AnomalyDetectionMethod>("FFT");

  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Инициализация видимости графиков для всех параметров.
  const initialGraphVisibility = plotConfigs.reduce((acc, config) => {
    // Включаем только наиболее важные графики по умолчанию
    const defaultVisible = [
      "pressure",
      "temperature",
      "rpm",
      "torque",
      "flowRate",
      "depth",
    ].includes(config.key);
    acc[config.key] = defaultVisible;
    return acc;
  }, {} as Record<SensorParamKey, boolean>);

  const [graphVisibility, setGraphVisibility] = useState<
    Record<SensorParamKey, boolean>
  >(initialGraphVisibility);

  const detectAnomaly = useCallback(
    (data: SensorData[], method: AnomalyDetectionMethod) => {
      if (data.length < FFT_WINDOW_SIZE) return false;
      const pressures = data.slice(-FFT_WINDOW_SIZE).map((d) => d.pressure);

      switch (method) {
        case "FFT":
          const fftResult = fft(pressures);
          return fftResult as unknown as boolean; // simplified for example
        case "Z-score":
          return zScore(pressures);
        case "LOF":
          return lof(pressures);
        default:
          return false;
      }
    },
    []
  );

  const simulateLocalData = useCallback(() => {
    setLiveData((prevData) => {
      const lastData =
        prevData.length > 0
          ? prevData[prevData.length - 1]
          : {
              timestamp: Date.now() - 500,
              pressure: 500,
              temperature: 150,
              rpm: 120,
              torque: 3000,
              flowRate: 50,
              depth: 0,
              weightOnHook: 10000,
              pumpStrokes1: 10,
              pumpStrokes2: 12,
              level1: 50,
              level2: 60,
              level3: 70,
              level4: 80,
              level5: 90,
              level6: 100,
              blockPosition: 10,
              mudVolumeInTanks: 5000,
              weightOnBit: 5000,
              flowRateOutlet: 45,
              drillStringVelocity: 1,
              mechanicalSpeed: 10,
              drillingSpeed: 5,
              methaneAbs: 0.1,
              propaneAbs: 0.01,
              butaneAbs: 0.005,
              pentaneAbs: 0.002,
              totalChromeGases: 0.117,
              methaneRel: 50,
              ethaneRel: 20,
              propaneRel: 10,
              butaneRel: 5,
              pentaneRel: 2,
              integratedGasTotal: 0.87,
              maximumGas: 1.5,
              totalStringWeight: 20000,
              stands: 10,
              mudVolumeInActiveTanks: 4000,
              totalMudVolume: 9000,
              depthAboveBottom: 20,
              volumeInTopUp: 100,
              reamingSpeed: 0.5,
              blockSpeed: 0.2,
              // Инициализация новых параметров
              bottomHoleDepth: 1500,
              instrumentDepth: 1505,
              glDelay: 0.5,
              level7: 55,
              level8: 65,
              parameter2: 10,
              volume1: 100,
              volume2: 200,
              volume3: 300,
              volume4: 400,
              volume5: 500,
              volume6: 600,
              volume7: 700,
              v21prov: 1,
              v22prov: 2,
              v31prov: 3,
              parameter6: 15,
            };

      const newData: SensorData = {
        timestamp: Date.now(),
        pressure: lastData.pressure + (Math.random() - 0.5) * 10,
        temperature: lastData.temperature + (Math.random() - 0.5) * 2,
        rpm: lastData.rpm + (Math.random() - 0.5) * 5,
        torque: lastData.torque + (Math.random() - 0.5) * 50,
        flowRate: lastData.flowRate + (Math.random() - 0.5) * 1,
        depth: lastData.depth + 0.1,
        weightOnHook: lastData.weightOnHook + (Math.random() - 0.5) * 50,
        pumpStrokes1: lastData.pumpStrokes1 + (Math.random() - 0.5) * 0.5,
        pumpStrokes2: lastData.pumpStrokes2 + (Math.random() - 0.5) * 0.5,
        level1: lastData.level1 + (Math.random() - 0.5) * 0.1,
        level2: lastData.level2 + (Math.random() - 0.5) * 0.1,
        level3: lastData.level3 + (Math.random() - 0.5) * 0.1,
        level4: lastData.level4 + (Math.random() - 0.5) * 0.1,
        level5: lastData.level5 + (Math.random() - 0.5) * 0.1,
        level6: lastData.level6 + (Math.random() - 0.5) * 0.1,
        blockPosition: lastData.blockPosition + (Math.random() - 0.5) * 0.05,
        mudVolumeInTanks:
          lastData.mudVolumeInTanks + (Math.random() - 0.5) * 50,
        weightOnBit: lastData.weightOnBit + (Math.random() - 0.5) * 20,
        flowRateOutlet: lastData.flowRateOutlet + (Math.random() - 0.5) * 1,
        drillStringVelocity:
          lastData.drillStringVelocity + (Math.random() - 0.5) * 0.01,
        mechanicalSpeed: lastData.mechanicalSpeed + (Math.random() - 0.5) * 0.1,
        drillingSpeed: lastData.drillingSpeed + (Math.random() - 0.5) * 0.05,
        methaneAbs: lastData.methaneAbs + (Math.random() - 0.5) * 0.01,
        propaneAbs: lastData.propaneAbs + (Math.random() - 0.5) * 0.001,
        butaneAbs: lastData.butaneAbs + (Math.random() - 0.5) * 0.0005,
        pentaneAbs: lastData.pentaneAbs + (Math.random() - 0.5) * 0.0002,
        totalChromeGases:
          lastData.totalChromeGases + (Math.random() - 0.5) * 0.01,
        methaneRel: lastData.methaneRel + (Math.random() - 0.5) * 0.1,
        ethaneRel: lastData.ethaneRel + (Math.random() - 0.5) * 0.05,
        propaneRel: lastData.propaneRel + (Math.random() - 0.5) * 0.02,
        butaneRel: lastData.butaneRel + (Math.random() - 0.5) * 0.01,
        pentaneRel: lastData.pentaneRel + (Math.random() - 0.5) * 0.005,
        integratedGasTotal:
          lastData.integratedGasTotal + (Math.random() - 0.5) * 0.05,
        maximumGas: lastData.maximumGas + (Math.random() - 0.5) * 0.1,
        totalStringWeight:
          lastData.totalStringWeight + (Math.random() - 0.5) * 100,
        stands: lastData.stands + (Math.random() - 0.5) * 0.01,
        mudVolumeInActiveTanks:
          lastData.mudVolumeInActiveTanks + (Math.random() - 0.5) * 20,
        totalMudVolume: lastData.totalMudVolume + (Math.random() - 0.5) * 50,
        depthAboveBottom:
          lastData.depthAboveBottom + (Math.random() - 0.5) * 0.02,
        volumeInTopUp: lastData.volumeInTopUp + (Math.random() - 0.5) * 1,
        reamingSpeed: lastData.reamingSpeed + (Math.random() - 0.5) * 0.01,
        blockSpeed: lastData.blockSpeed + (Math.random() - 0.5) * 0.005,
        // Генерация значений для новых параметров
        bottomHoleDepth: lastData.bottomHoleDepth + (Math.random() - 0.5) * 0.1,
        instrumentDepth: lastData.instrumentDepth + (Math.random() - 0.5) * 0.1,
        glDelay: lastData.glDelay + (Math.random() - 0.5) * 0.01,
        level7: lastData.level7 + (Math.random() - 0.5) * 0.1,
        level8: lastData.level8 + (Math.random() - 0.5) * 0.1,
        parameter2: lastData.parameter2 + (Math.random() - 0.5) * 0.1,
        volume1: lastData.volume1 + (Math.random() - 0.5) * 1,
        volume2: lastData.volume2 + (Math.random() - 0.5) * 1,
        volume3: lastData.volume3 + (Math.random() - 0.5) * 1,
        volume4: lastData.volume4 + (Math.random() - 0.5) * 1,
        volume5: lastData.volume5 + (Math.random() - 0.5) * 1,
        volume6: lastData.volume6 + (Math.random() - 0.5) * 1,
        volume7: lastData.volume7 + (Math.random() - 0.5) * 1,
        v21prov: lastData.v21prov + (Math.random() - 0.5) * 0.01,
        v22prov: lastData.v22prov + (Math.random() - 0.5) * 0.01,
        v31prov: lastData.v31prov + (Math.random() - 0.5) * 0.01,
        parameter6: lastData.parameter6 + (Math.random() - 0.5) * 0.1,
      };

      newData.pressure = Math.max(100, Math.min(1000, newData.pressure));
      newData.temperature = Math.max(50, Math.min(200, newData.temperature));
      newData.rpm = Math.max(10, Math.min(200, newData.rpm));
      newData.weightOnHook = Math.max(0, Math.min(50000, newData.weightOnHook));
      newData.depth = Math.max(0, newData.depth);
      newData.drillingSpeed = Math.max(0, newData.drillingSpeed);

      const updatedData = [...prevData, newData].slice(-MAX_DATA_POINTS);

      const anomaly = detectAnomaly(updatedData, analysisMethod);
      setAnomalyDetected(anomaly);

      if (anomaly) {
        setConsecutiveAnomaliesCount((prev) => prev + 1);
        if (
          anomalyTimestamps.length === 0 ||
          newData.timestamp - anomalyTimestamps[anomalyTimestamps.length - 1] >
            5000
        ) {
          setAnomalyTimestamps((prev) =>
            [...prev, newData.timestamp].slice(-MAX_DATA_POINTS / 2)
          );
        }
        if (
          !isModalOpen &&
          consecutiveAnomaliesCount < CONSECUTIVE_ANOMALY_THRESHOLD
        ) {
          setIsModalOpen(true);
        }
      } else {
        setConsecutiveAnomaliesCount(0);
        if (isModalOpen) {
          setIsModalOpen(false);
        }
      }
      return updatedData;
    });
  }, [
    detectAnomaly,
    anomalyTimestamps,
    isModalOpen,
    consecutiveAnomaliesCount,
    analysisMethod,
  ]);

  // В вашем компоненте React, где вы обрабатываете файл
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result as string;

      // Разделяем файл на строки
      const lines = text.split(/\r?\n/);

      // Получаем метаданные (начало и окончание рейса)
      const flightStartLine = lines[0]; // "Начало рейса - 8 июня 2016г. 20:49"
      const flightEndLine = lines[1]; // "Окончание рейса - 11 июня 2016г. 22:10"

      // Удаляем первые две строки и соединяем оставшиеся
      const dataText = lines.slice(2).join("\n");

      // Теперь парсим только данные
      Papa.parse(dataText, {
        header: true, // Теперь заголовки находятся в первой строке, которую мы передаем
        dynamicTyping: true,
        skipEmptyLines: true,
        delimiter: "\t", // Убедитесь, что разделитель указан правильно
        complete: (result) => {
          // В этом месте result.data будет содержать только ваши данные
          console.log(result.data);
          // Вы можете сохранить метаданные отдельно, если они нужны
          // setFlightInfo({ start: flightStartLine, end: flightEndLine });
        },
        error: (error) => {
          console.error("Error parsing TXT file:", error);
        },
      });
    };

    reader.readAsText(file);
  };

  useEffect(() => {
    const startLocalSimulation = () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
      simulationIntervalRef.current = setInterval(simulateLocalData, 500);
      setIsBackendConnected(false);
      console.log("Starting local data simulation.");
    };

    const stopLocalSimulation = () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      console.log("Stopping local data simulation.");
    };

    startLocalSimulation();

    return () => {
      stopLocalSimulation();
    };
  }, [simulateLocalData]);

  const handleVisibilityChange = (param: SensorParamKey) => {
    setGraphVisibility((prev) => ({
      ...prev,
      [param]: !prev[param],
    }));
  };

  const handleShowAll = () => {
    setGraphVisibility(
      plotConfigs.reduce((acc, config) => {
        acc[config.key] = true;
        return acc;
      }, {} as Record<SensorParamKey, boolean>)
    );
  };

  const handleHideAll = () => {
    setGraphVisibility(
      plotConfigs.reduce((acc, config) => {
        acc[config.key] = false;
        return acc;
      }, {} as Record<SensorParamKey, boolean>)
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-4xl font-extrabold text-center mb-8 text-gray-900">
        WellPro: Мониторинг Буровых Данных
      </h1>

      <StatusDisplay
        anomalyDetected={anomalyDetected}
        isBackendConnected={isBackendConnected}
      />

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8 p-4 bg-white rounded-xl shadow-md">
        <GraphControls
          graphVisibility={graphVisibility}
          onVisibilityChange={handleVisibilityChange}
          onShowAll={handleShowAll}
          onHideAll={handleHideAll}
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
        {plotConfigs.map(
          (config) =>
            graphVisibility[config.key] && (
              <div
                key={config.key}
                className="bg-white p-5 rounded-xl shadow-lg border border-gray-100"
              >
                <h3 className="text-xl font-semibold mb-3 text-gray-800">
                  {config.title}
                </h3>
                <Plot
                  data={[
                    {
                      x: liveData.map((d) => d[config.key]),
                      y: liveData.map((d) => new Date(d.timestamp)),
                      type: "scatter",
                      mode: "lines",
                      name: config.name,
                      line: { color: config.color },
                    },
                    ...(config.key === "pressure" &&
                    anomalyTimestamps.length > 0
                      ? [
                          {
                            x: anomalyTimestamps
                              .map((ts) => {
                                const dataPoint = liveData.find(
                                  (d) => d.timestamp === ts
                                );
                                return dataPoint ? dataPoint.pressure : null;
                              })
                              .filter((x) => x !== null),
                            y: anomalyTimestamps.map((ts) => new Date(ts)),
                            mode: "markers",
                            type: "scatter",
                            marker: {
                              symbol: "triangle-up",
                              color: "red",
                              size: 15,
                              line: { width: 2, color: "darkred" },
                            },
                            name: "Аномалия",
                            showlegend: true,
                            hovertemplate:
                              "<b>Аномалия</b><br>Время: %{y}<br>Давление: %{x}<extra></extra>",
                          },
                        ]
                      : []),
                  ]}
                  layout={{
                    autosize: true,
                    margin: { l: 70, r: 10, t: 20, b: 40 },
                    xaxis: { title: config.title },
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

      <AnomalyModal isModalOpen={isModalOpen} setIsModalOpen={setIsModalOpen} />
    </div>
  );
}
