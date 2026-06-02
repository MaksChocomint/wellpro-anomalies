import React from "react";
import { FaHourglassHalf } from "react-icons/fa";

interface LoadingOverlayProps {
  isLoading: boolean;
  progress?: {
    percentage: number;
    message: string;
    processed_rows: number;
    total_rows: number;
    uploaded_bytes: number;
    total_anomalies: number;
  } | null;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isLoading,
  progress = null,
}) => {
  if (!isLoading) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity duration-300">
      <div className="bg-white p-8 rounded-2xl shadow-2xl text-center max-w-sm w-full border border-slate-200">
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 border-r-blue-500 animate-spin"></div>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2 flex items-center justify-center gap-2">
          <FaHourglassHalf className="text-blue-500" />
          Идет анализ данных...
        </h2>
        <p className="text-slate-600">
          Пожалуйста, подождите, пока мы обработаем файл.
        </p>
        {progress && (
          <div className="mt-5 text-left">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>{progress.message || "Идет анализ"}</span>
              <span>{Math.max(0, Math.min(100, progress.percentage))}%</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all duration-300"
                style={{
                  width: `${Math.max(0, Math.min(100, progress.percentage))}%`,
                }}
              />
            </div>
            <div className="mt-2 text-[11px] text-slate-500 space-y-1">
              <p>
                Обработано строк: {progress.processed_rows}
                {progress.total_rows > 0 ? ` / ${progress.total_rows}` : ""}
              </p>
              <p>Найдено аномалий: {progress.total_anomalies}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
