import React, { useState } from "react";
import {
  FaUpload,
  FaStop,
  FaPlay,
  FaGlobe,
  FaForward,
  FaSlidersH,
} from "react-icons/fa";
import { AnalysisMethodSelector } from "@/components/AnalysisMethodSelector";
import { AnomalyDetectionMethod, Thresholds } from "@/types/types";

interface ControlButtonsProps {
  isSimulationActive: boolean;
  hasLoadedData: boolean;
  isRealTimeDisabled: boolean;
  isRealTimeActive: boolean;
  isSettingsDisabled: boolean;
  analysisMethod: AnomalyDetectionMethod;
  thresholds: Thresholds;
  onMethodChange: (method: AnomalyDetectionMethod) => void;
  onThresholdChange: (key: keyof Thresholds, value: number | string) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onStopSimulation: () => void;
  onStartSimulation: () => void;
  onSwitchToRealTime: () => void;
  onSkipToSummary: () => void;
}

export function ControlButtons({
  isSimulationActive,
  hasLoadedData,
  isRealTimeDisabled,
  isRealTimeActive,
  isSettingsDisabled,
  analysisMethod,
  thresholds,
  onMethodChange,
  onThresholdChange,
  onFileUpload,
  onStopSimulation,
  onStartSimulation,
  onSwitchToRealTime,
  onSkipToSummary,
}: ControlButtonsProps) {
  const [isRealtimeSettingsOpen, setIsRealtimeSettingsOpen] =
    useState<boolean>(false);

  return (
    <div className="space-y-3">
      <button
        onClick={() => setIsRealtimeSettingsOpen((prev) => !prev)}
        className={`w-full px-4 py-3 text-white text-sm font-semibold rounded-xl shadow-md transition-all duration-300 hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 ${
          isRealtimeSettingsOpen
            ? "bg-gradient-to-r from-blue-600 to-blue-700"
            : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
        }`}
      >
        <FaSlidersH />
        {isRealtimeSettingsOpen
          ? "Скрыть настройки Real-time"
          : "Настройки Real-time"}
      </button>

      <div
        className={`overflow-hidden rounded-xl border border-blue-200 bg-blue-50/60 transition-all duration-300 ${
          isRealtimeSettingsOpen
            ? "max-h-[1600px] opacity-100 p-4"
            : "max-h-0 opacity-0 p-0"
        }`}
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Параметры real-time анализа
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Изменения применяются для потока в реальном времени и локального режима.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <AnalysisMethodSelector
              analysisMethod={analysisMethod}
              thresholds={thresholds}
              onMethodChange={onMethodChange}
              onThresholdChange={onThresholdChange}
              isDisabled={isSettingsDisabled}
            />
          </div>
        </div>
      </div>

      <label
        className={`flex items-center justify-center px-4 py-3 text-white text-sm font-semibold rounded-xl shadow-md transition-all duration-300 gap-2 ${
          isSettingsDisabled
            ? "bg-slate-400 cursor-not-allowed"
            : "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 cursor-pointer hover:shadow-lg active:scale-[0.98]"
        }`}
      >
        <FaUpload />
        Загрузить файл для локального режима
        <input
          type="file"
          accept=".txt"
          onChange={onFileUpload}
          className="hidden"
          disabled={isSettingsDisabled}
        />
      </label>

      {isSimulationActive && (
        <button
          onClick={onStopSimulation}
          className="w-full px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-semibold rounded-xl shadow-md hover:from-red-600 hover:to-red-700 transition-all duration-300 hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <FaStop /> Остановить симуляцию
        </button>
      )}

      {hasLoadedData && !isSimulationActive && (
        <button
          onClick={onStartSimulation}
          className="w-full px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white text-sm font-semibold rounded-xl shadow-md hover:from-green-600 hover:to-green-700 transition-all duration-300 hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <FaPlay /> Запустить симуляцию
        </button>
      )}

      {hasLoadedData && (
        <button
          onClick={onSkipToSummary}
          className="w-full px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-semibold rounded-xl shadow-md hover:from-amber-600 hover:to-orange-700 transition-all duration-300 hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <FaForward />
          {isSimulationActive ? "Тайм-скип к сводке" : "Показать сводку"}
        </button>
      )}

      <button
        onClick={onSwitchToRealTime}
        disabled={isRealTimeDisabled}
        className={`w-full px-4 py-3 text-white text-sm font-semibold rounded-xl shadow-md transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-2 ${
          isRealTimeDisabled
            ? "bg-slate-400 cursor-not-allowed"
            : "bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 hover:shadow-lg"
        }`}
      >
        <FaGlobe />
        {isRealTimeActive ? "Real-time активен" : "Перейти в Real-time"}
      </button>
    </div>
  );
}
