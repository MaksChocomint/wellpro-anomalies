import React from "react";
import { FaHourglassHalf } from "react-icons/fa";

interface LoadingOverlayProps {
  isLoading: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isLoading,
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
      </div>
    </div>
  );
};
