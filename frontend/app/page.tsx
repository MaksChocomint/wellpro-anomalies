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
import {
  analyzeFile,
  extractFlightStartTimeFromFile,
  getFileAnalysisProgress,
  type FileAnalysisProgress,
} from "@/utils/fileUtils";
import { processIncomingDataPoint } from "@/utils/dataProcessor";
import { buildParametersMessage } from "@/utils/thresholdUtils";
import { DEFAULT_THRESHOLDS } from "@/constants/analysisDefaults";
import SelectionScreen from "@/components/SelectionScreen";
import { ArrowLeft } from "lucide-react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { SelectedRig } from "@/types/selection";

const MAX_DATA_POINTS = 250000;
const MAX_ANOMALIES = 30000;
const FILE_PROGRESS_POLL_INTERVAL_MS = 2000;
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
  const [fileAnalysisProgress, setFileAnalysisProgress] =
    useState<FileAnalysisProgress | null>(null);
  const [focusAnomalyRequest, setFocusAnomalyRequest] =
    useState<AnomalyInfo | null>(null);
  const [localSummaryMethod, setLocalSummaryMethod] =
    useState<AnomalyDetectionMethod>(DEFAULT_ANALYSIS_METHOD);
  const [localSummaryThresholds, setLocalSummaryThresholds] =
    useState<Thresholds>({
      ...DEFAULT_THRESHOLDS,
    });
  const [thresholds, setThresholds] = useState<Thresholds>({
    ...DEFAULT_THRESHOLDS,
  });

  const analysisMethodRef = useRef<AnomalyDetectionMethod>(
    DEFAULT_ANALYSIS_METHOD,
  );
  const thresholdsRef = useRef(thresholds);
  const isFirstDebounceRender = useRef(true);
  const progressPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const activeProgressJobIdRef = useRef<string | null>(null);
  const showAnomalyStatus = anomalyInfo.length > 0;
  const debouncedAnalysisMethod = useDebounce(analysisMethod, 3000);
  const debouncedThresholds = useDebounce(thresholds, 3000);
  const processedLocalDataRef = useRef<DynamicSensorData[]>([]);

  const hasSelectedRig = Boolean(selectedRig);
  const isRealTimeActive =
    hasSelectedRig && isBackendConnected && !isSimulationActive;

  const getRowTimestamp = useCallback((row: DynamicSensorData): number => {
    const rawTimestamp =
      row["время"] ?? row.time ?? row.Time ?? row.timestamp;
    const timestamp = Array.isArray(rawTimestamp)
      ? rawTimestamp[0]
      : rawTimestamp;
    const parsed = Number(String(timestamp ?? "").replace(",", "."));

    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
  }, []);

  const sortRowsByTime = useCallback((rows: DynamicSensorData[]) => {
    return [...rows].sort((a, b) => getRowTimestamp(a) - getRowTimestamp(b));
  }, [getRowTimestamp]);

  const buildLocalSimulationArtifacts = useCallback(
    (rows: DynamicSensorData[]) => {
      const orderedRows = sortRowsByTime(rows);
      const processedRows: DynamicSensorData[] = [];
      const anomalies: AnomalyInfo[] = [];

      orderedRows.forEach((row) => {
        const { newDataPoint, newAnomalies } = processIncomingDataPoint(row);
        processedRows.push(newDataPoint);
        anomalies.push(...newAnomalies);
      });

      return { processedRows, anomalies };
    },
    [sortRowsByTime],
  );

  const stopProgressPolling = useCallback(() => {
    if (progressPollIntervalRef.current) {
      clearInterval(progressPollIntervalRef.current);
      progressPollIntervalRef.current = null;
    }
  }, []);

  const pollFileAnalysisProgress = useCallback(async (jobId: string) => {
    try {
      const progress = await getFileAnalysisProgress(jobId);
      setFileAnalysisProgress(progress);

      if (progress.status === "completed" || progress.status === "error") {
        stopProgressPolling();
      }
    } catch {
      // Progress endpoint can briefly return 404 before backend registers job.
    }
  }, [stopProgressPolling]);

  const startProgressPolling = useCallback((jobId: string) => {
    activeProgressJobIdRef.current = jobId;
    stopProgressPolling();

    void pollFileAnalysisProgress(jobId);
    progressPollIntervalRef.current = setInterval(() => {
      void pollFileAnalysisProgress(jobId);
    }, FILE_PROGRESS_POLL_INTERVAL_MS);
  }, [pollFileAnalysisProgress, stopProgressPolling]);

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
    MAX_ANOMALIES,
  });

  const useDataSimulationHook = useDataSimulation({
    setLiveData,
    setAnomalyInfo,
    setIsModalOpen,
    setIsSimulationActive,
    MAX_DATA_POINTS,
    MAX_ANOMALIES,
  });

  const resetLiveState = useCallback(() => {
    stopProgressPolling();
    activeProgressJobIdRef.current = null;
    setLiveData([]);
    setAnomalyInfo([]);
    setAvailableParameters([]);
    setGraphVisibility({});
    setFlightStart(null);
    setConsecutiveAnomaliesCount(0);
    setFileErrorMessage(null);
    setLocalSummaryEntries([]);
    setLocalSummaryFileName(null);
    setFileAnalysisProgress(null);
    setFocusAnomalyRequest(null);
    setIsLocalSummaryOpen(false);
    useDataSimulationHook.fullDataRef.current = [];
    useDataSimulationHook.dataIndexRef.current = 0;
    processedLocalDataRef.current = [];
  }, [
    stopProgressPolling,
    useDataSimulationHook.dataIndexRef,
    useDataSimulationHook.fullDataRef,
  ]);

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

  const formatBytes = (value: number): string => {
    if (!Number.isFinite(value) || value <= 0) return "0 Б";
    if (value < 1024) return `${Math.round(value)} Б`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`;
    return `${(value / (1024 * 1024)).toFixed(2)} МБ`;
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
      stopProgressPolling();
    };
  }, [closeSocket, stopProgressPolling, useDataSimulationHook.stopSimulation]);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const inputElement = event.target;
    const file = event.target.files?.[0];
    if (!file) return;

    closeSocket();
    useDataSimulationHook.stopSimulation();
    useDataSimulationHook.dataIndexRef.current = 0;
    stopProgressPolling();
    activeProgressJobIdRef.current = null;
    setFileErrorMessage(null);
    setFileAnalysisProgress(null);
    setFocusAnomalyRequest(null);
    setIsLocalSummaryOpen(false);

    setIsLoading(true);

    try {
      const createAnalysisJobId = () =>
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const analysisJobId = createAnalysisJobId();
      setFileAnalysisProgress({
        job_id: analysisJobId,
        status: "uploading",
        message: "Подготовка файла к отправке",
        uploaded_bytes: file.size,
        total_rows: 0,
        processed_rows: 0,
        percentage: 0,
        total_anomalies: 0,
        error: null,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        finished_at: null,
      });
      startProgressPolling(analysisJobId);

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

      const analysisResponse = await analyzeFile(
        file,
        analysisParams,
        analysisJobId,
      );
      const parsedData = sortRowsByTime(analysisResponse.data);
      if (analysisResponse.jobId && analysisResponse.jobId !== analysisJobId) {
        startProgressPolling(analysisResponse.jobId);
      }
      const { processedRows, anomalies } =
        buildLocalSimulationArtifacts(parsedData);
      if (activeProgressJobIdRef.current) {
        await pollFileAnalysisProgress(activeProgressJobIdRef.current);
      }
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
      const message = formatAnalysisErrorMessage(error);
      setFileErrorMessage(message);
      setFileAnalysisProgress((prev) =>
        prev
          ? {
              ...prev,
              status: "error",
              message: "Ошибка анализа",
              error: message,
              finished_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          : null,
      );
    } finally {
      stopProgressPolling();
      activeProgressJobIdRef.current = null;
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
    setFileAnalysisProgress(null);
    setFocusAnomalyRequest(null);
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

    setLiveData(summaryRows);
    setAnomalyInfo(summaryAnomalies);
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

  const handleNavigateToAnomaly = useCallback((anomaly: AnomalyInfo) => {
    setIsModalOpen(false);
    setIsLocalSummaryOpen(false);
    setGraphVisibility((prev) => ({ ...prev, [anomaly.param]: true }));
    setFocusAnomalyRequest(anomaly);
  }, []);

  const handleFocusHandled = useCallback(() => {
    setFocusAnomalyRequest(null);
  }, []);

  const totalRows = useDataSimulationHook.fullDataRef.current.length;
  const currentRow = useDataSimulationHook.dataIndexRef.current;
  const progressPercent =
    totalRows > 0 ? Math.round((currentRow / totalRows) * 100) : 0;
  const visibleGraphCount = availableParameters.filter(
    (param) => graphVisibility[param],
  ).length;
  const dataModeLabel = isRealTimeActive
    ? "Real-time"
    : totalRows > 0
      ? "Локальная симуляция"
      : "Ожидание данных";

  if (!selectedRig) return <SelectionScreen onSelect={setSelectedRig} />;

  return (
    <div className="app-shell relative">
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        <header className="surface mb-4 flex flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <button
            onClick={() => setSelectedRig(null)}
            className="btn-ghost self-start md:self-center"
          >
            <ArrowLeft size={20} /> Назад к выбору
          </button>

          <div className="min-w-0 flex-1 md:border-l md:border-r md:border-slate-200 md:px-6">
            <div className="ui-label mb-1">WellPro / Мониторинг буровой</div>
            <h1 className="truncate text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              {selectedRig.companyName}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-slate-600">
              <span>Месторождение: {selectedRig.fieldName}</span>
              <span>Куст №{selectedRig.clusterNumber}</span>
              <span>Скважина: {selectedRig.wellName}</span>
              <span>Буровая: {selectedRig.name}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 md:min-w-[440px]">
            <div>
              <div className="ui-label">Режим</div>
              <div className="ui-value mt-1">{dataModeLabel}</div>
            </div>
            <div>
              <div className="ui-label">Метод</div>
              <div className="ui-value mt-1">{analysisMethod}</div>
            </div>
            <div>
              <div className="ui-label">Графики</div>
              <div className="ui-value mt-1">
                {visibleGraphCount}/{availableParameters.length || 0}
              </div>
            </div>
            <div>
              <div className="ui-label">Аномалии</div>
              <div
                className={`mt-1 text-sm font-black ${
                  showAnomalyStatus ? "text-red-700" : "text-emerald-700"
                }`}
              >
                {anomalyInfo.length}
              </div>
            </div>
          </div>
        </header>

        {fileAnalysisProgress && isLoading && (
          <div className="surface mb-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2 text-sm font-semibold text-slate-600">
              <span>Обработка файла: {fileAnalysisProgress.percentage}%</span>
              <span className="text-xs text-slate-500">
                {fileAnalysisProgress.message ||
                  (fileAnalysisProgress.status === "parsing"
                    ? "Парсинг данных"
                    : "Идет анализ")}
              </span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--primary)] transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, fileAnalysisProgress.percentage))}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>Загружено: {formatBytes(fileAnalysisProgress.uploaded_bytes)}</span>
              <span>
                Обработано строк: {fileAnalysisProgress.processed_rows}
                {fileAnalysisProgress.total_rows > 0
                  ? ` / ${fileAnalysisProgress.total_rows}`
                  : ""}
              </span>
              <span>Найдено аномалий: {fileAnalysisProgress.total_anomalies}</span>
            </div>
          </div>
        )}

        {totalRows > 0 && (
          <div className="surface mb-4 p-4">
            <div className="flex justify-between mb-2 text-sm font-bold text-slate-600">
              <span>Прогресс файла: {progressPercent}%</span>
              <span>
                {currentRow} / {totalRows} строк
              </span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--primary)] transition-all duration-300"
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
          <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-amber-100 p-2">
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
              className="btn-secondary"
            >
              <FaEye className="text-lg" />
              <span>Показывать снова</span>
            </button>
          </div>
        )}

        {fileErrorMessage && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
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

        <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(360px,1fr)_minmax(520px,1.4fr)]">
          <div>
              <GraphControls
                graphVisibility={graphVisibility}
                onVisibilityChange={handleVisibilityChange}
                onShowAll={handleShowAll}
                onHideAll={handleHideAll}
                availableParameters={availableParameters}
              />
          </div>

          <div>
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

        <GraphGrid
          liveData={liveData}
          availableParameters={availableParameters}
          graphVisibility={graphVisibility}
          anomalyInfo={anomalyInfo}
          reportMethod={totalRows > 0 ? localSummaryMethod : analysisMethod}
          reportThresholds={totalRows > 0 ? localSummaryThresholds : thresholds}
          focusRequest={focusAnomalyRequest}
          onFocusHandled={handleFocusHandled}
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
          onNavigateToAnomaly={handleNavigateToAnomaly}
        />
        <LocalSummaryModal
          isOpen={isLocalSummaryOpen}
          onClose={() => setIsLocalSummaryOpen(false)}
          anomalies={localSummaryEntries}
          method={localSummaryMethod}
          thresholds={localSummaryThresholds}
          fileName={localSummaryFileName}
          allData={useDataSimulationHook.fullDataRef.current}
          onNavigateToAnomaly={handleNavigateToAnomaly}
        />

        <LoadingOverlay isLoading={isLoading} progress={fileAnalysisProgress} />
      </div>
    </div>
  );
}
