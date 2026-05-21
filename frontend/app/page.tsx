"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import AnomalyModal from "@/components/AnomalyModal";
import { StatusDisplay } from "@/components/StatusDisplay";
import { GraphControls } from "@/components/GraphControls";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { GraphGrid } from "@/components/GraphGrid";
import { ControlButtons } from "@/components/ControlButtons";
import LocalSummaryModal from "@/components/LocalSummaryModal";
import { AnomalyDetectionMethod, AnomalyInfo, Thresholds } from "@/types/types";
import { DynamicSensorData } from "@/types/types";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useDataSimulation } from "@/hooks/useDataSimulation";
import { useDebounce } from "@/hooks/useDebounce";
import { analyzeFile, extractFlightStartTimeFromFile } from "@/utils/fileUtils";
import { processIncomingDataPoint } from "@/utils/dataProcessor";
import { buildParametersMessage } from "@/utils/thresholdUtils";
import { DEFAULT_THRESHOLDS } from "@/constants/analysisDefaults";
import SelectionScreen from "@/components/SelectionScreen";
import { ArrowLeft } from "lucide-react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { SelectedRig } from "@/types/selection";

const MAX_DATA_POINTS = 1000;
const DEFAULT_ANALYSIS_METHOD: AnomalyDetectionMethod = "AMMAD";

export default function Home() {
  const [selectedRig, setSelectedRig] = useState<SelectedRig | null>(null);
  const [liveData, setLiveData] = useState<DynamicSensorData[]>([]);
  const [anomalyInfo, setAnomalyInfo] = useState<AnomalyInfo[]>([]);
  const [fileErrorMessage, setFileErrorMessage] = useState<string | null>(null);
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [doNotShowAgain, setDoNotShowAgain] = useState<boolean>(false);
  const [consecutiveAnomaliesCount, setConsecutiveAnomaliesCount] =
    useState<number>(0);
  const [analysisMethod, setAnalysisMethod] = useState<AnomalyDetectionMethod>(
    DEFAULT_ANALYSIS_METHOD,
  );
  const [availableParameters, setAvailableParameters] = useState<string[]>([]);
  const [graphVisibility, setGraphVisibility] = useState<
    Record<string, boolean>
  >({});
  const [flightStart, setFlightStart] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSimulationActive, setIsSimulationActive] = useState<boolean>(false);
  const [localSummaryEntries, setLocalSummaryEntries] = useState<AnomalyInfo[]>(
    [],
  );
  const [isLocalSummaryOpen, setIsLocalSummaryOpen] = useState<boolean>(false);
  const [localSummaryFileName, setLocalSummaryFileName] = useState<
    string | null
  >(null);
  const [localSummaryMethod, setLocalSummaryMethod] =
    useState<AnomalyDetectionMethod>(DEFAULT_ANALYSIS_METHOD);
  const [localSummaryThresholds, setLocalSummaryThresholds] =
    useState<Thresholds>({
      ...DEFAULT_THRESHOLDS,
    });
  const [thresholds, setThresholds] = useState<Thresholds>({
    ...DEFAULT_THRESHOLDS,
  });

  const analysisMethodRef =
    useRef<AnomalyDetectionMethod>(DEFAULT_ANALYSIS_METHOD);
  const thresholdsRef = useRef(thresholds);
  const isFirstDebounceRender = useRef(true);
  const showAnomalyStatus = anomalyInfo.length > 0;
  const debouncedAnalysisMethod = useDebounce(analysisMethod, 3000);
  const debouncedThresholds = useDebounce(thresholds, 3000);
  const processedLocalDataRef = useRef<DynamicSensorData[]>([]);

  const hasSelectedRig = Boolean(selectedRig);
  const isRealTimeActive =
    hasSelectedRig && isBackendConnected && !isSimulationActive;

  const buildLocalSimulationArtifacts = useCallback(
    (rows: DynamicSensorData[]) => {
      const processedRows: DynamicSensorData[] = [];
      const anomalies: AnomalyInfo[] = [];

      rows.forEach((row) => {
        const { newDataPoint, newAnomalies } = processIncomingDataPoint(row);
        processedRows.push(newDataPoint);
        anomalies.push(...newAnomalies);
      });

      return { processedRows, anomalies };
    },
    [],
  );

  useEffect(() => {
    analysisMethodRef.current = analysisMethod;
  }, [analysisMethod]);

  useEffect(() => {
    thresholdsRef.current = thresholds;
  }, [thresholds]);

  const sendParametersToServer = useCallback(() => {
    const wsRef = useWebSocketHook.wsRef;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const message = buildParametersMessage(
      analysisMethodRef.current,
      thresholdsRef.current,
    );
    wsRef.current.send(JSON.stringify(message));
  }, []);

  const handleThresholdChange = useCallback(
    (key: keyof Thresholds, value: number | string) => {
      const numericValue =
        typeof value === "string" ? parseFloat(value) : value;
      if (!isNaN(numericValue) && numericValue >= 0) {
        setThresholds((prev) => ({ ...prev, [key]: numericValue }));
      }
    },
    [],
  );

  const getWindowSize = (method: AnomalyDetectionMethod): number => {
    switch (method) {
      case "FFT":
        return thresholds.FFT_WINDOW_SIZE || 32;
      case "Z_score":
        return thresholds.Z_SCORE_WINDOW_SIZE || 50;
      case "LOF":
        return thresholds.LOF_WINDOW_SIZE || 20;
      case "AMMAD":
        return thresholds.AMMAD_WINDOW_SIZE || 48;
      default:
        return 32;
    }
  };

  const useWebSocketHook = useWebSocket({
    setLiveData,
    setAnomalyInfo,
    setIsBackendConnected,
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
    setIsModalOpen,
    setIsSimulationActive,
    MAX_DATA_POINTS,
  });

  const resetLiveState = useCallback(() => {
    setLiveData([]);
    setAnomalyInfo([]);
    setAvailableParameters([]);
    setGraphVisibility({});
    setFlightStart(null);
    setConsecutiveAnomaliesCount(0);
    setFileErrorMessage(null);
    setLocalSummaryEntries([]);
    setLocalSummaryFileName(null);
    setIsLocalSummaryOpen(false);
    useDataSimulationHook.fullDataRef.current = [];
    useDataSimulationHook.dataIndexRef.current = 0;
    processedLocalDataRef.current = [];
  }, [useDataSimulationHook.dataIndexRef, useDataSimulationHook.fullDataRef]);

  const closeSocket = useCallback(() => {
    if (useWebSocketHook.wsRef.current) {
      useWebSocketHook.wsRef.current.close();
      useWebSocketHook.wsRef.current = null;
    }
    setIsBackendConnected(false);
  }, [useWebSocketHook.wsRef]);

  const handleAnalysisMethodChange = (method: AnomalyDetectionMethod) => {
    if (isSimulationActive) useDataSimulationHook.stopSimulation();
    setAnalysisMethod(method);
  };

  const formatAnalysisErrorMessage = (error: unknown): string => {
    const rawMessage =
      error instanceof Error
        ? error.message.trim()
        : "Не удалось выполнить анализ файла.";
    const normalizedMessage = rawMessage.toLowerCase();

    if (
      normalizedMessage.includes('столбец "время" обязателен') ||
      (normalizedMessage.includes("время") &&
        normalizedMessage.includes("обязател")) ||
      normalizedMessage.includes("time column is required")
    ) {
      return 'Ошибка анализа файла: столбец "Время" обязателен в загружаемом файле.';
    }

    if (
      normalizedMessage.includes("network error") ||
      normalizedMessage.includes("failed to fetch")
    ) {
      return "Нет соединения с сервером анализа. Проверьте, что backend запущен.";
    }

    if (normalizedMessage.startsWith("ошибка анализа файла")) {
      return rawMessage;
    }

    return `Ошибка анализа файла: ${rawMessage}`;
  };

  useEffect(() => {
    if (isFirstDebounceRender.current) {
      isFirstDebounceRender.current = false;
      return;
    }
    if (!isBackendConnected || isSimulationActive) return;
    sendParametersToServer();
  }, [
    debouncedAnalysisMethod,
    debouncedThresholds,
    isBackendConnected,
    isSimulationActive,
    sendParametersToServer,
  ]);

  useEffect(() => {
    if (!selectedRig) {
      closeSocket();
      useDataSimulationHook.stopSimulation();
      resetLiveState();
      return;
    }

    useWebSocketHook.connectWebSocket({
      clusterNumber: selectedRig.clusterNumber,
      wellName: selectedRig.wellName,
      rigId: selectedRig.rig_id,
    });
  }, [
    selectedRig,
    closeSocket,
    resetLiveState,
    useDataSimulationHook.stopSimulation,
    useWebSocketHook.connectWebSocket,
  ]);

  useEffect(() => {
    return () => {
      closeSocket();
      useDataSimulationHook.stopSimulation();
    };
  }, [closeSocket, useDataSimulationHook.stopSimulation]);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const inputElement = event.target;
    const file = event.target.files?.[0];
    if (!file) return;

    closeSocket();
    useDataSimulationHook.stopSimulation();
    useDataSimulationHook.dataIndexRef.current = 0;
    setFileErrorMessage(null);
    setIsLocalSummaryOpen(false);

    setIsLoading(true);

    try {
      const method = analysisMethodRef.current;
      const analysisParams = {
        method,
        window_size:
          method === "FFT"
            ? thresholdsRef.current.FFT_WINDOW_SIZE
            : method === "Z_score"
              ? thresholdsRef.current.Z_SCORE_WINDOW_SIZE
              : method === "LOF"
                ? thresholdsRef.current.LOF_WINDOW_SIZE
                : thresholdsRef.current.AMMAD_WINDOW_SIZE,
        score_threshold:
          method === "FFT"
            ? thresholdsRef.current.FFT
            : method === "Z_score"
              ? thresholdsRef.current.Z_score
              : method === "LOF"
                ? thresholdsRef.current.LOF
                : thresholdsRef.current.AMMAD,
      };

      const parsedData = await analyzeFile(file, analysisParams);
      const { processedRows, anomalies } =
        buildLocalSimulationArtifacts(parsedData);
      setFileErrorMessage(null);
      useDataSimulationHook.fullDataRef.current = parsedData;
      processedLocalDataRef.current = processedRows;
      setLocalSummaryEntries(anomalies);
      setLocalSummaryMethod(method);
      setLocalSummaryThresholds({ ...thresholdsRef.current });
      setLocalSummaryFileName(file.name);

      setLiveData([]);
      setAnomalyInfo([]);
      setConsecutiveAnomaliesCount(anomalies.length);
      setFlightStart(null);

      if (parsedData.length > 0) {
        const keys = Object.keys(parsedData[0]).filter((k) => {
          const key = k.toLowerCase();
          return key !== "время" && !key.includes("врем") && key !== "time";
        });
        setAvailableParameters(keys);
        const initialVisibility = keys.reduce(
          (acc, key) => ({ ...acc, [key]: true }),
          {} as Record<string, boolean>,
        );
        setGraphVisibility(initialVisibility);
      }

      useDataSimulationHook.startDataSimulation();

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const startTime = extractFlightStartTimeFromFile(text);
        if (startTime) setFlightStart(startTime);
      };
      reader.readAsText(file);
    } catch (error) {
      processedLocalDataRef.current = [];
      setLocalSummaryEntries([]);
      setLocalSummaryFileName(null);
      setFileErrorMessage(formatAnalysisErrorMessage(error));
    } finally {
      setIsLoading(false);
      inputElement.value = "";
    }
  };

  const handleSwitchToRealTime = useCallback(() => {
    if (isRealTimeActive) return;

    if (!selectedRig) {
      closeSocket();
      return;
    }

    useDataSimulationHook.stopSimulation();
    setIsLocalSummaryOpen(false);
    useDataSimulationHook.fullDataRef.current = [];
    useDataSimulationHook.dataIndexRef.current = 0;
    processedLocalDataRef.current = [];
    setLocalSummaryEntries([]);
    setLocalSummaryFileName(null);
    setLiveData([]);
    setAnomalyInfo([]);
    useWebSocketHook.connectWebSocket({
      clusterNumber: selectedRig?.clusterNumber,
      wellName: selectedRig?.wellName,
      rigId: selectedRig?.rig_id,
    });
  }, [
    isRealTimeActive,
    selectedRig,
    closeSocket,
    useDataSimulationHook.stopSimulation,
    useWebSocketHook.connectWebSocket,
  ]);

  const handleSkipToSummary = useCallback(() => {
    const totalRowsInFile = useDataSimulationHook.fullDataRef.current.length;
    if (totalRowsInFile === 0) return;

    useDataSimulationHook.stopSimulation();
    setIsModalOpen(false);

    let summaryRows = processedLocalDataRef.current;
    let summaryAnomalies = localSummaryEntries;

    if (summaryRows.length === 0 || summaryAnomalies.length === 0) {
      const artifacts = buildLocalSimulationArtifacts(
        useDataSimulationHook.fullDataRef.current,
      );
      summaryRows = artifacts.processedRows;
      summaryAnomalies = artifacts.anomalies;
      processedLocalDataRef.current = summaryRows;
      setLocalSummaryEntries(summaryAnomalies);
    }

    setLiveData(summaryRows.slice(-MAX_DATA_POINTS));
    setAnomalyInfo(summaryAnomalies.slice(-500));
    setConsecutiveAnomaliesCount(summaryAnomalies.length);
    useDataSimulationHook.dataIndexRef.current = totalRowsInFile;
    setIsLocalSummaryOpen(true);
  }, [
    buildLocalSimulationArtifacts,
    localSummaryEntries,
    useDataSimulationHook.dataIndexRef,
    useDataSimulationHook.fullDataRef,
    useDataSimulationHook.stopSimulation,
  ]);

  const handleStartSimulation = useCallback(() => {
    setIsLocalSummaryOpen(false);

    if (
      useDataSimulationHook.dataIndexRef.current >=
      useDataSimulationHook.fullDataRef.current.length
    ) {
      useDataSimulationHook.dataIndexRef.current = 0;
    }

    useDataSimulationHook.startDataSimulation();
  }, [
    useDataSimulationHook.dataIndexRef,
    useDataSimulationHook.fullDataRef,
    useDataSimulationHook.startDataSimulation,
  ]);

  const handleVisibilityChange = (param: string) =>
    setGraphVisibility((prev) => ({ ...prev, [param]: !prev[param] }));

  const handleShowAll = () =>
    setGraphVisibility(
      availableParameters.reduce((acc, p) => ({ ...acc, [p]: true }), {}),
    );

  const handleHideAll = () =>
    setGraphVisibility(
      availableParameters.reduce((acc, p) => ({ ...acc, [p]: false }), {}),
    );

  const handleResetDoNotShowAgain = () => {
    setDoNotShowAgain(false);
  };

  const totalRows = useDataSimulationHook.fullDataRef.current.length;
  const currentRow = useDataSimulationHook.dataIndexRef.current;
  const progressPercent =
    totalRows > 0 ? Math.round((currentRow / totalRows) * 100) : 0;

  if (!selectedRig) return <SelectionScreen onSelect={setSelectedRig} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-6 relative">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-8">
          <button
            onClick={() => setSelectedRig(null)}
            className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-semibold transition"
          >
            <ArrowLeft size={20} /> Назад к выбору
          </button>
          <div className="min-w-0 md:max-w-4xl md:text-right">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent break-words">
              {selectedRig.companyName}
            </h1>
            <p className="text-lg text-slate-600 font-medium break-words">
              Месторождение: {selectedRig.fieldName} • Куст №
              {selectedRig.clusterNumber}
            </p>
            <p className="text-sm text-slate-500 font-medium break-words">
              Скважина: {selectedRig.wellName} • Буровая: {selectedRig.name}
            </p>
          </div>
        </div>

        {totalRows > 0 && (
          <div className="mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between mb-2 text-sm font-bold text-slate-600">
              <span>Прогресс файла: {progressPercent}%</span>
              <span>
                {currentRow} / {totalRows} строк
              </span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        <StatusDisplay
          anomalyDetected={showAnomalyStatus}
          isBackendConnected={isBackendConnected && !isSimulationActive}
          onDismissAnomaly={() => setAnomalyInfo([])}
        />

        {doNotShowAgain && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <FaEyeSlash className="text-amber-600" />
              </div>
              <div>
                <p className="font-medium text-amber-800">
                  Уведомления об аномалиях скрыты
                </p>
                <p className="text-sm text-amber-600">
                  Модальные окна не будут показываться при обнаружении аномалий
                </p>
              </div>
            </div>
            <button
              onClick={handleResetDoNotShowAgain}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
            >
              <FaEye className="text-lg" />
              <span>Показывать снова</span>
            </button>
          </div>
        )}

        {fileErrorMessage && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm font-medium">{fileErrorMessage}</p>
              <button
                onClick={() => setFileErrorMessage(null)}
                className="text-xs font-semibold text-red-700 hover:text-red-900"
              >
                Закрыть
              </button>
            </div>
          </div>
        )}

        <div className="space-y-6 mb-10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-3 bg-white rounded-xl shadow-md border border-slate-200 p-6">
              <GraphControls
                graphVisibility={graphVisibility}
                onVisibilityChange={handleVisibilityChange}
                onShowAll={handleShowAll}
                onHideAll={handleHideAll}
                availableParameters={availableParameters}
              />
            </div>

            <div className="lg:col-span-3 bg-white rounded-xl shadow-md border border-slate-200 p-6">
              <ControlButtons
                isSimulationActive={isSimulationActive}
                hasLoadedData={totalRows > 0}
                isRealTimeDisabled={isRealTimeActive}
                isRealTimeActive={isRealTimeActive}
                isSettingsDisabled={isLoading}
                analysisMethod={analysisMethod}
                thresholds={thresholds}
                onMethodChange={handleAnalysisMethodChange}
                onThresholdChange={handleThresholdChange}
                onFileUpload={handleFileChange}
                onStopSimulation={useDataSimulationHook.stopSimulation}
                onStartSimulation={handleStartSimulation}
                onSwitchToRealTime={handleSwitchToRealTime}
                onSkipToSummary={handleSkipToSummary}
              />
            </div>
          </div>
        </div>

        <GraphGrid
          liveData={liveData}
          availableParameters={availableParameters}
          graphVisibility={graphVisibility}
          anomalyInfo={anomalyInfo}
          reportMethod={totalRows > 0 ? localSummaryMethod : analysisMethod}
          reportThresholds={totalRows > 0 ? localSummaryThresholds : thresholds}
        />

        <AnomalyModal
          isModalOpen={isModalOpen && !doNotShowAgain}
          setIsModalOpen={setIsModalOpen}
          anomalyInfo={anomalyInfo}
          rigId={selectedRig?.rig_id || 0}
          method={analysisMethod}
          threshold={
            (thresholds as any)[analysisMethod] ??
            (analysisMethod === "AMMAD"
              ? 0.8
              : analysisMethod === "FFT"
                ? 0.3
                : analysisMethod === "Z_score"
                  ? 3
                  : 25)
          }
          windowSize={getWindowSize(analysisMethod)}
          onDoNotShowAgain={() => setDoNotShowAgain(true)}
        />
        <LocalSummaryModal
          isOpen={isLocalSummaryOpen}
          onClose={() => setIsLocalSummaryOpen(false)}
          anomalies={localSummaryEntries}
          method={localSummaryMethod}
          thresholds={localSummaryThresholds}
          fileName={localSummaryFileName}
        />

        <LoadingOverlay isLoading={isLoading} />
      </div>
    </div>
  );
}
