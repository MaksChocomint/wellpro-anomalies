import React, { useMemo } from "react";
import {
  AnomalyDetectionMethod,
  AnomalyInfo,
  Thresholds,
} from "@/types/types";
import { excelSerialToJsDate, formatDate, formatParamName } from "@/utils/utils";
import { X } from "lucide-react";

interface LocalSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  anomalies: AnomalyInfo[];
  method: AnomalyDetectionMethod;
  thresholds: Thresholds;
  fileName: string | null;
}

const CORE_PARAMETERS: string[] = [
  "глубина",
  "скорость_бурения",
  "вес_на_крюке",
  "момент_ротора",
  "обороты_ротора",
  "давление_на_входе",
  "расход_на_входе",
  "температура_на_выходе",
  "уровень_в_емкости",
  "скорость_спо",
  "нагрузка",
  "дмк",
];

function formatTimestamp(timestamp: number | string): string {
  if (typeof timestamp === "number") {
    return formatDate(excelSerialToJsDate(timestamp));
  }

  const numeric = Number(String(timestamp).replace(",", "."));
  if (!Number.isNaN(numeric)) {
    return formatDate(excelSerialToJsDate(numeric));
  }

  const date = new Date(timestamp);
  if (!Number.isNaN(date.getTime())) {
    return formatDate(date);
  }

  return String(timestamp);
}

function formatValue(value: number | string | undefined): string {
  if (typeof value === "number") {
    return value.toFixed(2);
  }

  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value);
}

function getMethodSettings(method: AnomalyDetectionMethod, thresholds: Thresholds) {
  switch (method) {
    case "FFT":
      return {
        scoreThreshold: thresholds.FFT,
        windowSize: thresholds.FFT_WINDOW_SIZE,
        thresholdLabel: "Порог FFT",
      };
    case "Z_score":
      return {
        scoreThreshold: thresholds.Z_score,
        windowSize: thresholds.Z_SCORE_WINDOW_SIZE,
        thresholdLabel: "Порог Z-score",
      };
    case "LOF":
      return {
        scoreThreshold: thresholds.LOF,
        windowSize: thresholds.LOF_WINDOW_SIZE,
        thresholdLabel: "Порог LOF",
      };
    case "AMMAD":
      return {
        scoreThreshold: thresholds.AMMAD,
        windowSize: thresholds.AMMAD_WINDOW_SIZE,
        thresholdLabel: "Порог AMMAD",
      };
    default:
      return {
        scoreThreshold: 0,
        windowSize: 0,
        thresholdLabel: "Порог",
      };
  }
}

function formatThreshold(method: AnomalyDetectionMethod, value: number): string {
  if (method === "LOF" || method === "Z_score") {
    return value.toFixed(2);
  }
  return value.toFixed(2);
}

export default function LocalSummaryModal({
  isOpen,
  onClose,
  anomalies,
  method,
  thresholds,
  fileName,
}: LocalSummaryModalProps) {
  const totalAnomalies = anomalies.length;
  const methodSettings = getMethodSettings(method, thresholds);

  const parameterSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    anomalies.forEach((item) => {
      counts[item.param] = (counts[item.param] || 0) + 1;
    });

    return CORE_PARAMETERS.map((param) => {
      const count = counts[param] || 0;
      const percent =
        totalAnomalies > 0 ? Number(((count / totalAnomalies) * 100).toFixed(2)) : 0;

      return {
        param,
        count,
        percent,
      };
    });
  }, [anomalies, totalAnomalies]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1200] bg-slate-950/60 backdrop-blur-sm p-4 flex items-center justify-center">
      <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Сводка локального анализа</h2>
            <p className="text-sm text-slate-600 mt-1">
              Режим: <span className="font-semibold">Локальная симуляция</span> • Файл:{" "}
              <span className="font-semibold">{fileName || "—"}</span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors"
            title="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-auto p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Метод</p>
              <p className="text-base font-semibold text-slate-900 mt-1">{method}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Окно анализа</p>
              <p className="text-base font-semibold text-slate-900 mt-1">
                {methodSettings.windowSize}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{methodSettings.thresholdLabel}</p>
              <p className="text-base font-semibold text-slate-900 mt-1">
                {formatThreshold(method, methodSettings.scoreThreshold)}
              </p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs text-rose-700">Всего аномалий</p>
              <p className="text-base font-semibold text-rose-800 mt-1">{totalAnomalies}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-100 border-b border-slate-200">
              <p className="text-sm font-semibold text-slate-800">
                Аномалии по 12 ключевым параметрам
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Процент считается от общего количества аномалий в файле ({totalAnomalies}).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Параметр</th>
                    <th className="text-left px-4 py-2 font-semibold">Количество</th>
                    <th className="text-left px-4 py-2 font-semibold">% от общего</th>
                  </tr>
                </thead>
                <tbody>
                  {parameterSummary.map((item, index) => (
                    <tr
                      key={item.param}
                      className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}
                    >
                      <td className="px-4 py-2 text-slate-900 font-medium">
                        {formatParamName(item.param)}
                      </td>
                      <td className="px-4 py-2 text-slate-700">{item.count}</td>
                      <td className="px-4 py-2 text-slate-700">{item.percent.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {anomalies.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
              Аномалии в выбранном файле не обнаружены.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Параметр</th>
                    <th className="text-left px-4 py-3 font-semibold">Когда выявлено</th>
                    <th className="text-left px-4 py-3 font-semibold">Значение</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.map((entry, index) => (
                    <tr
                      key={entry.id || `summary-${index}`}
                      className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}
                    >
                      <td className="px-4 py-3 text-slate-900 font-medium">
                        {formatParamName(entry.param)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatTimestamp(entry.timestamp)}
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-mono">
                        {formatValue(entry.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
