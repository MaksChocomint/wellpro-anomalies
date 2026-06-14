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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm transition-opacity duration-300">
      <div className="surface w-full max-w-md p-6 text-center shadow-[var(--shadow)]">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-md border border-blue-200 bg-blue-50">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-200 border-t-[var(--primary)]" />
        </div>
        <h2 className="mb-2 flex items-center justify-center gap-2 text-xl font-black text-slate-950">
          <FaHourglassHalf className="text-[var(--primary)]" />
          Идет анализ данных
        </h2>
        <p className="text-sm text-slate-600">
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
                className="h-full bg-[var(--primary)] transition-all duration-300"
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
