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
import { useWebSocket } from "@/hooks/useWebSocket";
import { useDataSimulation } from "@/hooks/useDataSimulation";
import { useDebounce } from "@/hooks/useDebounce";
import { analyzeFile, extractFlightStartTimeFromFile } from "@/utils/fileUtils";
import { buildParametersMessage } from "@/utils/thresholdUtils";
import { DEFAULT_THRESHOLDS } from "@/constants/analysisDefaults";
import SelectionScreen from "@/components/SelectionScreen";
import { ArrowLeft } from "lucide-react";
import { FaEye, FaEyeSlash } from "react-icons/fa";

const MAX_DATA_POINTS = 1000;

export default function Home() {
  const [selectedRig, setSelectedRig] = useState<any>(null);
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
    ...DEFAULT_THRESHOLDS,
  });

  const analysisMethodRef = useRef<AnomalyDetectionMethod>("FFT");
  const thresholdsRef = useRef(thresholds);
  const isFirstDebounceRender = useRef(true);
  const showAnomalyStatus = anomalyInfo.length > 0;
  const debouncedAnalysisMethod = useDebounce(analysisMethod, 3000);
  const debouncedThresholds = useDebounce(thresholds, 3000);

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
        return thresholds.AMMAD_WINDOW_SIZE || 30;
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

  const handleAnalysisMethodChange = (method: AnomalyDetectionMethod) => {
    if (isSimulationActive) useDataSimulationHook.stopSimulation();
    setAnalysisMethod(method);
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

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (useWebSocketHook.wsRef.current) {
      useWebSocketHook.wsRef.current.close();
      useWebSocketHook.wsRef.current = null;
    }
    useDataSimulationHook.stopSimulation();
    useDataSimulationHook.dataIndexRef.current = 0;

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
      useDataSimulationHook.fullDataRef.current = parsedData;

      setLiveData([]);
      setAnomalyInfo([]);
      setConsecutiveAnomaliesCount(0);
      setFlightStart(null);

      if (parsedData.length > 0) {
        const keys = Object.keys(parsedData[0]).filter(
          (k) => k.toLowerCase() !== "время",
        );
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
      console.error("Error analyzing file:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchToRealTime = useCallback(() => {
    useDataSimulationHook.stopSimulation();
    useDataSimulationHook.fullDataRef.current = [];
    useDataSimulationHook.dataIndexRef.current = 0;
    setLiveData([]);
    setAnomalyInfo([]);
    useWebSocketHook.connectWebSocket();
  }, []);

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

  useEffect(() => {
    useWebSocketHook.connectWebSocket();
    return () => {
      if (useWebSocketHook.wsRef.current)
        useWebSocketHook.wsRef.current.close();
      useDataSimulationHook.stopSimulation();
    };
  }, []);

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
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={() => setSelectedRig(null)}
            className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-semibold transition"
          >
            <ArrowLeft size={20} /> Назад к выбору
          </button>
          <div className="text-right">
            <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
              WellPro
            </h1>
            <p className="text-lg text-slate-600 font-medium">
              {selectedRig.name} • Активный мониторинг
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

            <div className="lg:col-span-2 bg-white rounded-xl shadow-md border border-slate-200 p-6">
              <AnalysisMethodSelector
                analysisMethod={analysisMethod}
                thresholds={thresholds}
                onMethodChange={handleAnalysisMethodChange}
                onThresholdChange={handleThresholdChange}
                isDisabled={!isBackendConnected || isSimulationActive}
              />
            </div>

            <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
              <ControlButtons
                isSimulationActive={isSimulationActive}
                hasLoadedData={totalRows > 0}
                isDisabled={false}
                onFileUpload={handleFileChange}
                onStopSimulation={useDataSimulationHook.stopSimulation}
                onStartSimulation={useDataSimulationHook.startDataSimulation}
                onSwitchToRealTime={handleSwitchToRealTime}
              />
            </div>
          </div>
        </div>

        <GraphGrid
          liveData={liveData}
          availableParameters={availableParameters}
          graphVisibility={graphVisibility}
          anomalyInfo={anomalyInfo}
        />

        <AnomalyModal
          isModalOpen={isModalOpen && !doNotShowAgain}
          setIsModalOpen={setIsModalOpen}
          anomalyInfo={anomalyInfo}
          rigId={selectedRig?.rig_id || 0}
          method={analysisMethod}
          threshold={(thresholds as any)[analysisMethod] || 0.75}
          windowSize={getWindowSize(analysisMethod)}
          onDoNotShowAgain={() => setDoNotShowAgain(true)}
        />

        <LoadingOverlay isLoading={isLoading} />
      </div>
    </div>
  );
}
