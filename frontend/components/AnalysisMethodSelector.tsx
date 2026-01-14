import React from "react";
import { AnomalyDetectionMethod } from "@/types/types";
import {
  getThresholdKeysForMethod,
  getThresholdLabel,
} from "@/utils/thresholdUtils";

interface AnalysisMethodSelectorProps {
  analysisMethod: AnomalyDetectionMethod;
  thresholds: Record<string, number>;
  onMethodChange: (method: AnomalyDetectionMethod) => void;
  onThresholdChange: (key: string, value: number | string) => void;
  isDisabled: boolean;
}

export function AnalysisMethodSelector({
  analysisMethod,
  thresholds,
  onMethodChange,
  onThresholdChange,
  isDisabled,
}: AnalysisMethodSelectorProps) {
  const thresholdKeys = getThresholdKeysForMethod(analysisMethod);

  return (
    <div className="space-y-4">
      <div className="flex flex-col">
        <label className="text-sm font-semibold text-slate-700 mb-2">
          Выберите метод анализа
        </label>
        <select
          value={analysisMethod}
          onChange={(e) =>
            onMethodChange(e.target.value as AnomalyDetectionMethod)
          }
          disabled={isDisabled}
          className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-colors disabled:bg-slate-100 disabled:cursor-not-allowed"
        >
          <option value="FFT">FFT (Быстрое преобразование Фурье)</option>
          <option value="Z_score">Z-score (Стандартное отклонение)</option>
          <option value="LOF">LOF (Локальный коэффициент выбросов)</option>
        </select>
      </div>

      {/* Threshold inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {thresholdKeys.map((key) => (
          <div key={key} className="flex flex-col">
            <label className="text-sm font-semibold text-slate-700 mb-2">
              {getThresholdLabel(key)}
            </label>
            <input
              type="number"
              value={thresholds[key] ?? ""}
              onChange={(e) => onThresholdChange(key, e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors disabled:bg-slate-100 disabled:cursor-not-allowed"
              step={key.includes("WINDOW") ? "16" : "0.1"}
              disabled={isDisabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
