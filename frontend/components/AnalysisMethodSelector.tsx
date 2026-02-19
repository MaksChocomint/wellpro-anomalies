import React from "react";
import { AnomalyDetectionMethod } from "@/types/types";
import {
  getThresholdKeysForMethod,
  getThresholdLabel,
} from "@/utils/thresholdUtils";
import { getDefaultThresholdByKey } from "@/constants/analysisDefaults";

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

  const getMethodDescription = (method: AnomalyDetectionMethod): string => {
    switch (method) {
      case "FFT":
        return "Анализ частотных составляющих сигнала";
      case "Z_score":
        return "Обнаружение статистических выбросов";
      case "LOF":
        return "Обнаружение локальных аномалий";
      case "AMMAD":
        return "Адаптивный гибридный метод для параметров бурения";
      default:
        return "";
    }
  };

  const getMethodStep = (key: string): string => {
    if (key === "AMMAD") return "0.05";
    if (key.includes("WINDOW")) return "16";
    if (key === "FFT") return "0.05";
    return "0.1";
  };

  const getMethodMinMax = (key: string): { min: number; max: number } => {
    switch (key) {
      case "FFT":
        return { min: 0.1, max: 1.0 };
      case "Z_score":
        return { min: 1.0, max: 10.0 };
      case "LOF":
        return { min: 10, max: 50 };
      case "AMMAD":
        return { min: 0.1, max: 1.0 };
      case "FFT_WINDOW_SIZE":
      case "Z_SCORE_WINDOW_SIZE":
      case "LOF_WINDOW_SIZE":
      case "AMMAD_WINDOW_SIZE":
        return { min: 32, max: 200 };
      default:
        return { min: 0, max: 100 };
    }
  };

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
          <option value="AMMAD">AMMAD (Адаптивный гибридный метод)</option>
        </select>
        <p className="text-xs text-slate-500 mt-1">
          {getMethodDescription(analysisMethod)}
          {analysisMethod === "AMMAD" && (
            <span className="ml-1 text-blue-600 font-medium">
              ⚡ Рекомендуется для параметров бурения
            </span>
          )}
        </p>
      </div>

      {/* Информация для AMMAD метода */}
      {analysisMethod === "AMMAD" && (
        <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-700">
            <span className="font-semibold">Адаптивный метод AMMAD: </span>
            Комбинирует Z-score, LOF и FFT с автоматической настройкой весов для
            каждого параметра бурения на основе их характеристик.
          </p>
        </div>
      )}

      {/* Threshold inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {thresholdKeys.map((key) => {
          const { min, max } = getMethodMinMax(key);
          const step = getMethodStep(key);
          const value =
            thresholds[key] ?? getDefaultThresholdByKey(key);

          return (
            <div key={key} className="flex flex-col">
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-semibold text-slate-700">
                  {getThresholdLabel(key)}
                </label>
                {key === "AMMAD" && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                    {(value * 100).toFixed(0)}% уверенность
                  </span>
                )}
              </div>

              {key === "AMMAD" || key === "FFT" ? (
                // Slider для процентных значений
                <div className="space-y-1">
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onThresholdChange(key, e.target.value)}
                    disabled={isDisabled}
                    className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
                      key === "AMMAD"
                        ? "bg-gradient-to-r from-blue-200 to-blue-400"
                        : "bg-slate-200"
                    }`}
                  />
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{min}</span>
                    <span className="font-medium">
                      {key === "AMMAD" || key === "FFT"
                        ? value.toFixed(2)
                        : Math.round(value)}
                    </span>
                    <span>{max}</span>
                  </div>
                </div>
              ) : (
                // Числовое поле для других параметров
                <input
                  type="number"
                  value={value}
                  onChange={(e) => onThresholdChange(key, e.target.value)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors disabled:bg-slate-100 disabled:cursor-not-allowed"
                  step={step}
                  min={min}
                  max={max}
                  disabled={isDisabled}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
