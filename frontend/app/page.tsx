"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import AnomalyModal from "@/components/AnomalyModal";
import { StatusDisplay } from "@/components/StatusDisplay";
import { GraphControls } from "@/components/GraphControls";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { AnalysisMethodSelector } from "@/components/AnalysisMethodSelector";
import { GraphGrid } from "@/components/GraphGrid";
import { ControlButtons } from "@/components/ControlButtons";
import { AnomalyDetectionMethod, AnomalyInfo, Thresholds } from "@/types/types";
import { DynamicSensorData } from "@/types/types";
import {
  formatDate,
  formatParamName,
  excelSerialToJsDate,
} from "@/utils/utils";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useDataSimulation } from "@/hooks/useDataSimulation";
import { analyzeFile, extractFlightStartTimeFromFile } from "@/utils/fileUtils";
import { buildParametersMessage } from "@/utils/thresholdUtils";

const MAX_DATA_POINTS = 1000;

// Константы по умолчанию для AMMAD
const DEFAULT_AMMAD_THRESHOLD = 0.7;
const DEFAULT_AMMAD_WINDOW_SIZE = 32;

export default function Home() {
  // ===== State =====
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
  const [thresholds, setThresholds] = useState<Thresholds>({
    Z_score: 3,
    LOF: 35,
    FFT: 0.2,
    FFT_WINDOW_SIZE: 64,
    Z_SCORE_WINDOW_SIZE: 30,
    LOF_WINDOW_SIZE: 50,
    AMMAD: DEFAULT_AMMAD_THRESHOLD,
    AMMAD_WINDOW_SIZE: DEFAULT_AMMAD_WINDOW_SIZE,
  });

  // ===== Refs =====
  const analysisMethodRef = useRef<AnomalyDetectionMethod>("FFT");
  const thresholdsRef = useRef(thresholds);
  const showAnomalyStatus = anomalyInfo.length > 0;

  // Sync refs with state
  useEffect(() => {
    analysisMethodRef.current = analysisMethod;
  }, [analysisMethod]);

  useEffect(() => {
    thresholdsRef.current = thresholds;
  }, [thresholds]);

  // ===== Callbacks =====

  // Send parameters to server
  const sendParametersToServer = useCallback(() => {
    const wsRef = useWebSocketHook.wsRef;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn(
        "[WebSocket] Connection is not open, cannot send parameters"
      );
      return;
    }

    const message = buildParametersMessage(
      analysisMethodRef.current,
      thresholdsRef.current
    );
    console.log("[WebSocket] Sending updated parameters:", message);
    wsRef.current.send(JSON.stringify(message));
  }, []);

  // Threshold handler
  const handleThresholdChange = useCallback(
    (key: keyof Thresholds, value: number | string) => {
      const numericValue =
        typeof value === "string" ? parseFloat(value) : value;

      if (!isNaN(numericValue) && numericValue >= 0) {
        setThresholds((prev) => ({
          ...prev,
          [key]: numericValue,
        }));

        if (isBackendConnected) {
          setTimeout(() => {
            sendParametersToServer();
          }, 100);
        }
      }
    },
    [isBackendConnected, sendParametersToServer]
  );

  // ===== Custom Hooks =====
  const useWebSocketHook = useWebSocket({
    setLiveData,
    setAnomalyInfo,
    setIsBackendConnected,
    setConsecutiveAnomaliesCount,
    setIsModalOpen,
    setAvailableParameters,
    setGraphVisibility,
    setFlightStart,
    sendParametersToServer,
    MAX_DATA_POINTS,
  });

  const useDataSimulationHook = useDataSimulation({
    setLiveData,
    setAnomalyInfo,
    setIsSimulationActive,
    MAX_DATA_POINTS,
  });

  // ===== Modal Handlers =====
  const handleDoNotShowAgain = () => {
    setDoNotShowAgain(true);
    setIsModalOpen(false);
  };

  const handleDismissAnomaly = () => {
    setAnomalyInfo([]);
  };

  // ===== Method Change Handler =====
  const handleAnalysisMethodChange = (method: AnomalyDetectionMethod) => {
    if (isSimulationActive) {
      useDataSimulationHook.stopSimulation();
    }

    setAnalysisMethod(method);

    // Автоматически устанавливаем разумные значения для AMMAD
    if (method === "AMMAD") {
      setThresholds((prev) => ({
        ...prev,
        AMMAD: prev.AMMAD || DEFAULT_AMMAD_THRESHOLD,
        AMMAD_WINDOW_SIZE: prev.AMMAD_WINDOW_SIZE || DEFAULT_AMMAD_WINDOW_SIZE,
      }));
    }

    if (isBackendConnected) {
      setTimeout(() => {
        sendParametersToServer();
      }, 100);
    }
  };

  // ===== File Upload Handler =====
  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (useWebSocketHook.wsRef.current) {
      useWebSocketHook.wsRef.current.close();
      useWebSocketHook.wsRef.current = null;
    }

    useDataSimulationHook.stopSimulation();
    setIsLoading(true);

    try {
      const method = analysisMethodRef.current;
      const analysisParams = {
        method: method,
        window_size:
          method === "FFT"
            ? thresholdsRef.current.FFT_WINDOW_SIZE
            : method === "Z_score"
            ? thresholdsRef.current.Z_SCORE_WINDOW_SIZE
            : method === "LOF"
            ? thresholdsRef.current.LOF_WINDOW_SIZE
            : thresholdsRef.current.AMMAD_WINDOW_SIZE ||
              DEFAULT_AMMAD_WINDOW_SIZE,
        score_threshold:
          method === "FFT"
            ? thresholdsRef.current.FFT
            : method === "Z_score"
            ? thresholdsRef.current.Z_score
            : method === "LOF"
            ? thresholdsRef.current.LOF
            : thresholdsRef.current.AMMAD || DEFAULT_AMMAD_THRESHOLD,
      };

      const parsedData = await analyzeFile(file, analysisParams);
      useDataSimulationHook.fullDataRef.current = parsedData;

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

      useDataSimulationHook.startDataSimulation();

      // Extract flight start time
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const startTime = extractFlightStartTimeFromFile(text);
        if (startTime) {
          setFlightStart(startTime);
        }
      };
      reader.readAsText(file);
    } catch (error) {
      console.error("Error analyzing file:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // ===== Switch to Real-time Handler =====
  const handleSwitchToRealTime = useCallback(() => {
    useDataSimulationHook.stopSimulation();
    useDataSimulationHook.fullDataRef.current = [];
    useDataSimulationHook.dataIndexRef.current = 0;

    setLiveData([]);
    setAnomalyInfo([]);
    setConsecutiveAnomaliesCount(0);
    setFlightStart(null);

    useWebSocketHook.connectWebSocket();
  }, []);

  // ===== Visibility Handlers =====
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

  // ===== Initialize WebSocket on Mount =====
  useEffect(() => {
    useWebSocketHook.connectWebSocket();

    return () => {
      if (useWebSocketHook.wsRef.current) {
        useWebSocketHook.wsRef.current.close();
      }
      useDataSimulationHook.stopSimulation();
    };
  }, []);

  // ===== Render =====
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-6 relative">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
              <span className="text-white text-xl font-bold">W</span>
            </div>
          </div>
          <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 bg-clip-text text-transparent">
            WellPro
          </h1>
          <p className="text-lg text-slate-600 font-medium">
            Интеллектуальный мониторинг буровых данных
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Теперь с адаптивным методом AMMAD
          </p>
        </div>

        {flightStart && (
          <div className="text-center mb-8 p-4 bg-white/80 backdrop-blur-sm rounded-lg border border-slate-200 shadow-sm">
            <p className="text-slate-600 font-medium">
              📅 Начало бурения:{" "}
              <span className="text-blue-600 font-semibold">
                {formatDate(flightStart)}
              </span>
            </p>
          </div>
        )}

        <StatusDisplay
          anomalyDetected={showAnomalyStatus}
          isBackendConnected={isBackendConnected && !isSimulationActive}
          onDismissAnomaly={handleDismissAnomaly}
        />

        {/* Controls Section */}
        <div className="space-y-6 mb-10">
          {/* Top Control Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Graph Controls */}
            <div className="lg:col-span-3 bg-white rounded-xl shadow-md border border-slate-200 p-6 backdrop-blur-sm bg-white/95">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
                <span className="w-1 h-6 bg-blue-500 rounded-full mr-3"></span>
                Параметры отображения
              </h2>
              <GraphControls
                graphVisibility={graphVisibility}
                onVisibilityChange={handleVisibilityChange}
                onShowAll={handleShowAll}
                onHideAll={handleHideAll}
                availableParameters={availableParameters}
              />
            </div>

            {/* Analysis Method Selector */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-md border border-slate-200 p-6 backdrop-blur-sm bg-white/95">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
                <span className="w-1 h-6 bg-blue-500 rounded-full mr-3"></span>
                Метод анализа
              </h2>
              <AnalysisMethodSelector
                analysisMethod={analysisMethod}
                thresholds={thresholds}
                onMethodChange={handleAnalysisMethodChange}
                onThresholdChange={handleThresholdChange}
                isDisabled={!isBackendConnected || isSimulationActive}
              />
            </div>

            {/* Control Buttons */}
            <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 backdrop-blur-sm bg-white/95">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
                <span className="w-1 h-6 bg-blue-500 rounded-full mr-3"></span>
                Управление
              </h2>
              <div className="flex flex-col gap-3">
                <ControlButtons
                  isSimulationActive={isSimulationActive}
                  hasLoadedData={
                    useDataSimulationHook.fullDataRef.current.length > 0
                  }
                  isDisabled={isSimulationActive}
                  onFileUpload={handleFileChange}
                  onStopSimulation={useDataSimulationHook.stopSimulation}
                  onStartSimulation={useDataSimulationHook.startDataSimulation}
                  onSwitchToRealTime={handleSwitchToRealTime}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Информация о методе AMMAD */}
        {analysisMethod === "AMMAD" && (
          <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5 shadow-sm">
            <div className="flex items-start">
              <div className="flex-shrink-0 p-2 bg-blue-100 rounded-lg mr-4">
                <span className="text-blue-600 font-bold">⚡</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-blue-800 mb-1">
                  Адаптивный метод AMMAD (Adaptive Multi-Method Anomaly
                  Detection)
                </h3>
                <p className="text-blue-700 mb-2">
                  Комбинирует три метода анализа с адаптивными весами для
                  каждого параметра бурения
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="bg-white/70 p-3 rounded-lg">
                    <span className="font-medium text-blue-600">Z-score: </span>
                    <span>обнаружение статистических выбросов</span>
                  </div>
                  <div className="bg-white/70 p-3 rounded-lg">
                    <span className="font-medium text-blue-600">LOF: </span>
                    <span>анализ локальной плотности данных</span>
                  </div>
                  <div className="bg-white/70 p-3 rounded-lg">
                    <span className="font-medium text-blue-600">FFT: </span>
                    <span>частотный анализ сигналов</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Graphs Section */}
        <div className="mb-8">
          <div className="flex items-center mb-6">
            <span className="w-1 h-8 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full mr-3"></span>
            <h2 className="text-2xl font-bold text-slate-900">
              Анализ параметров
              {analysisMethod === "AMMAD" && (
                <span className="ml-2 text-sm font-normal text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  адаптивный режим
                </span>
              )}
            </h2>
          </div>
          <GraphGrid
            liveData={liveData}
            availableParameters={availableParameters}
            graphVisibility={graphVisibility}
            anomalyInfo={anomalyInfo}
          />
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
    </div>
  );
}
