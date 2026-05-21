import React from "react";
import { AnomalyDetectionMethod, Thresholds } from "@/types/types";
import {
  getThresholdKeysForMethod,
  getThresholdLabel,
} from "@/utils/thresholdUtils";
import { getDefaultThresholdByKey } from "@/constants/analysisDefaults";

interface AnalysisMethodSelectorProps {
  analysisMethod: AnomalyDetectionMethod;
  thresholds: Thresholds;
  onMethodChange: (method: AnomalyDetectionMethod) => void;
  onThresholdChange: (key: keyof Thresholds, value: number | string) => void;
  isDisabled: boolean;
}

const METHOD_OPTIONS: Array<{
  value: AnomalyDetectionMethod;
  title: string;
  description: string;
}> = [
  {
    value: "FFT",
    title: "FFT",
    description: "Поиск аномалий в частотной составляющей сигнала",
  },
  {
    value: "Z_score",
    title: "Z-score",
    description: "Статистический контроль выбросов относительно среднего",
  },
  {
    value: "LOF",
    title: "LOF",
    description: "Поиск локальных аномалий по соседним точкам",
  },
  {
    value: "AMMAD",
    title: "AMMAD",
    description: "Адаптивный гибридный метод для параметров бурения",
  },
];

const getMethodDescription = (method: AnomalyDetectionMethod): string => {
  return METHOD_OPTIONS.find((option) => option.value === method)?.description || "";
};

const getMethodStep = (key: keyof Thresholds): number => {
  if (key === "AMMAD") return 0.05;
  if (key === "FFT") return 0.05;
  if (key.includes("WINDOW")) return 1;
  return 0.1;
};

const getMethodMinMax = (key: keyof Thresholds): { min: number; max: number } => {
  switch (key) {
    case "FFT":
      return { min: 0.1, max: 1 };
    case "Z_score":
      return { min: 1, max: 10 };
    case "LOF":
      return { min: 10, max: 50 };
    case "AMMAD":
      return { min: 0.1, max: 1 };
    case "FFT_WINDOW_SIZE":
    case "Z_SCORE_WINDOW_SIZE":
    case "LOF_WINDOW_SIZE":
    case "AMMAD_WINDOW_SIZE":
      return { min: 32, max: 200 };
    default:
      return { min: 0, max: 100 };
  }
};

const clampValue = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const snapToStep = (value: number, min: number, step: number): number => {
  const snapped = min + Math.round((value - min) / step) * step;
  return Number(snapped.toFixed(4));
};

const normalizeThresholdValue = (
  key: keyof Thresholds,
  value: number,
  min: number,
  max: number,
  step: number,
): number => {
  const clamped = clampValue(value, min, max);
  const snapped = snapToStep(clamped, min, step);

  if (key.includes("WINDOW")) return Math.round(snapped);
  return Number(snapped.toFixed(2));
};

const toSliderProgress = (value: number, min: number, max: number): number => {
  if (max <= min) return 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
};

const formatValue = (key: keyof Thresholds, value: number): string => {
  if (key.includes("WINDOW")) return String(Math.round(value));
  return value.toFixed(2);
};

export function AnalysisMethodSelector({
  analysisMethod,
  thresholds,
  onMethodChange,
  onThresholdChange,
  isDisabled,
}: AnalysisMethodSelectorProps) {
  const thresholdKeys = getThresholdKeysForMethod(analysisMethod);

  const updateThreshold = (key: keyof Thresholds, rawValue: number) => {
    const { min, max } = getMethodMinMax(key);
    const step = getMethodStep(key);
    const nextValue = normalizeThresholdValue(key, rawValue, min, max, step);
    onThresholdChange(key, nextValue);
  };

  const adjustThreshold = (key: keyof Thresholds, delta: number) => {
    const currentValue = thresholds[key] ?? getDefaultThresholdByKey(key);
    updateThreshold(key, currentValue + delta);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">Метод анализа</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {METHOD_OPTIONS.map((methodOption) => {
            const isSelected = methodOption.value === analysisMethod;

            return (
              <button
                key={methodOption.value}
                type="button"
                disabled={isDisabled}
                onClick={() => onMethodChange(methodOption.value)}
                className={`rounded-xl border px-3 py-3 text-left transition-all duration-200 ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {methodOption.title}
                  </span>
                  {isSelected && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                      выбран
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  {methodOption.description}
                </p>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-slate-500">
          {getMethodDescription(analysisMethod)}
          {analysisMethod === "AMMAD" && (
            <span className="ml-1 text-blue-600 font-medium">⚡ Рекомендуется для параметров бурения</span>
          )}
        </p>
      </div>

      {analysisMethod === "AMMAD" && (
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-3 py-2.5">
          <p className="text-xs leading-relaxed text-blue-800">
            <span className="font-semibold">AMMAD:</span> объединяет Z-score, LOF и FFT с автоматической
            подстройкой весов по параметрам бурения.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {thresholdKeys.map((key) => {
          const { min, max } = getMethodMinMax(key);
          const step = getMethodStep(key);
          const value = thresholds[key] ?? getDefaultThresholdByKey(key);
          const sliderProgress = toSliderProgress(value, min, max);

          return (
            <div
              key={key}
              className="rounded-xl border border-slate-200 bg-white p-3 transition-all duration-200 hover:border-slate-300"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="text-sm font-semibold text-slate-700">{getThresholdLabel(key)}</label>
                <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-1 rounded-full min-w-[64px] text-center">
                  {formatValue(key, value)}
                </span>
              </div>

              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => updateThreshold(key, Number(event.target.value))}
                disabled={isDisabled}
                className="w-full h-2 rounded-full appearance-none cursor-pointer transition-all duration-200 disabled:cursor-not-allowed"
                style={{
                  background: `linear-gradient(90deg, #2563eb 0%, #3b82f6 ${sliderProgress}%, #e2e8f0 ${sliderProgress}%, #e2e8f0 100%)`,
                }}
              />

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjustThreshold(key, -step)}
                  disabled={isDisabled || value <= min}
                  className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  -
                </button>

                <input
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={formatValue(key, value)}
                  onChange={(event) => {
                    const numericValue = Number(event.target.value.replace(",", "."));
                    if (Number.isFinite(numericValue)) {
                      updateThreshold(key, numericValue);
                    }
                  }}
                  disabled={isDisabled}
                  className="h-8 flex-1 rounded-lg border border-slate-300 px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 disabled:bg-slate-100 disabled:cursor-not-allowed"
                />

                <button
                  type="button"
                  onClick={() => adjustThreshold(key, step)}
                  disabled={isDisabled || value >= max}
                  className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  +
                </button>
              </div>

              <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                <span>Мин: {formatValue(key, min)}</span>
                <span>Макс: {formatValue(key, max)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
