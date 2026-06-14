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
    <section className="surface p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="ui-label">Управление режимом</div>
          <h2 className="mt-1 text-lg font-black text-slate-950">
            Анализ и источник данных
          </h2>
        </div>
        <button
          onClick={() => setIsRealtimeSettingsOpen((prev) => !prev)}
          className={isRealtimeSettingsOpen ? "btn-primary" : "btn-secondary"}
        >
          <FaSlidersH />
          {isRealtimeSettingsOpen ? "Скрыть настройки" : "Настройки анализа"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label
          className={`btn-primary min-h-[46px] ${
            isSettingsDisabled
              ? "pointer-events-none opacity-55"
              : "cursor-pointer"
          }`}
        >
          <FaUpload />
          Загрузить файл
          <input
            type="file"
            accept=".txt"
            onChange={onFileUpload}
            className="hidden"
            disabled={isSettingsDisabled}
          />
        </label>

        {isSimulationActive ? (
          <button onClick={onStopSimulation} className="btn-danger min-h-[46px]">
            <FaStop /> Остановить
          </button>
        ) : (
          <button
            onClick={onStartSimulation}
            disabled={!hasLoadedData}
            className="btn-success min-h-[46px] disabled:opacity-45"
          >
            <FaPlay /> Запустить
          </button>
        )}

        <button
          onClick={onSkipToSummary}
          disabled={!hasLoadedData}
          className="btn-secondary min-h-[46px] disabled:opacity-45"
        >
          <FaForward />
          {isSimulationActive ? "К сводке" : "Показать сводку"}
        </button>

        <button
          onClick={onSwitchToRealTime}
          disabled={isRealTimeDisabled}
          className="btn-secondary min-h-[46px] disabled:opacity-45"
        >
          <FaGlobe />
          {isRealTimeActive ? "Real-time активен" : "В Real-time"}
        </button>
      </div>

      <div
        className={`overflow-hidden transition-all duration-300 ${
          isRealtimeSettingsOpen
            ? "mt-4 max-h-[1600px] opacity-100"
            : "max-h-0 opacity-0"
        }`}
      >
        <div className="surface-muted p-4">
          <div className="mb-4">
            <p className="text-sm font-bold text-slate-800">
              Параметры анализа
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Изменения применяются для real-time потока и локальной симуляции.
            </p>
          </div>

          <AnalysisMethodSelector
            analysisMethod={analysisMethod}
            thresholds={thresholds}
            onMethodChange={onMethodChange}
            onThresholdChange={onThresholdChange}
            isDisabled={isSettingsDisabled}
          />
        </div>
      </div>
    </section>
  );
}
