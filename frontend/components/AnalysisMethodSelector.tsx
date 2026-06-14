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
    description: "Частотные отклонения сигнала",
  },
  {
    value: "Z_score",
    title: "Z-score",
    description: "Статистические выбросы",
  },
  {
    value: "LOF",
    title: "LOF",
    description: "Локальная плотность точек",
  },
  {
    value: "AMMAD",
    title: "AMMAD",
    description: "Гибридный метод для буровой телеметрии",
  },
];

const getMethodDescription = (method: AnomalyDetectionMethod): string =>
  METHOD_OPTIONS.find((option) => option.value === method)?.description || "";

const getMethodStep = (key: keyof Thresholds): number => {
  if (key === "AMMAD") return 0.05;
  if (key === "FFT") return 0.05;
  if (key.includes("WINDOW")) return 1;
  return 0.1;
};

const getMethodMinMax = (
  key: keyof Thresholds,
): { min: number; max: number } => {
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
        <p className="text-sm font-bold text-slate-800">Метод анализа</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {METHOD_OPTIONS.map((methodOption) => {
            const isSelected = methodOption.value === analysisMethod;

            return (
              <button
                key={methodOption.value}
                type="button"
                disabled={isDisabled}
                onClick={() => onMethodChange(methodOption.value)}
                className={`rounded-md border px-3 py-3 text-left transition-colors ${
                  isSelected
                    ? "border-blue-300 bg-blue-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-slate-900">
                    {methodOption.title}
                  </span>
                  {isSelected && (
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">
                      выбран
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {methodOption.description}
                </p>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-slate-500">
          {getMethodDescription(analysisMethod)}
          {analysisMethod === "AMMAD" && (
            <span className="ml-1 font-semibold text-blue-700">
              Рекомендуется для параметров бурения.
            </span>
          )}
        </p>
      </div>

      {analysisMethod === "AMMAD" && (
        <div className="rounded-md border border-blue-200 bg-white px-3 py-2.5">
          <p className="text-xs leading-relaxed text-slate-700">
            <span className="font-black text-slate-900">AMMAD:</span>{" "}
            объединяет Z-score, LOF и FFT с весами, настроенными под каналы
            буровой телеметрии.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {thresholdKeys.map((key) => {
          const { min, max } = getMethodMinMax(key);
          const step = getMethodStep(key);
          const value = thresholds[key] ?? getDefaultThresholdByKey(key);

          return (
            <div
              key={key}
              className="rounded-md border border-slate-200 bg-white p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="text-sm font-bold text-slate-700">
                  {getThresholdLabel(key)}
                </label>
                <span className="min-w-[64px] rounded border border-slate-200 bg-slate-50 px-2 py-1 text-center text-xs font-black text-slate-900">
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
                className="h-2 w-full cursor-pointer accent-[var(--primary)] disabled:cursor-not-allowed"
              />

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjustThreshold(key, -step)}
                  disabled={isDisabled || value <= min}
                  className="btn-secondary h-8 min-h-8 w-8 px-0 disabled:opacity-40"
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
                  className="input-control h-8 min-h-8 flex-1 disabled:bg-slate-100 disabled:opacity-70"
                />

                <button
                  type="button"
                  onClick={() => adjustThreshold(key, step)}
                  disabled={isDisabled || value >= max}
                  className="btn-secondary h-8 min-h-8 w-8 px-0 disabled:opacity-40"
                >
                  +
                </button>
              </div>

              <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-400">
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
