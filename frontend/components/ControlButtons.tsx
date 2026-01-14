import React from "react";
import { FaUpload, FaStop, FaPlay, FaGlobe } from "react-icons/fa";

interface ControlButtonsProps {
  isSimulationActive: boolean;
  hasLoadedData: boolean;
  isDisabled: boolean;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onStopSimulation: () => void;
  onStartSimulation: () => void;
  onSwitchToRealTime: () => void;
}

export function ControlButtons({
  isSimulationActive,
  hasLoadedData,
  isDisabled,
  onFileUpload,
  onStopSimulation,
  onStartSimulation,
  onSwitchToRealTime,
}: ControlButtonsProps) {
  return (
    <div className="space-y-3">
      {/* File Upload */}
      <label className="flex items-center justify-center px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-semibold rounded-lg shadow-md hover:from-blue-600 hover:to-blue-700 cursor-pointer transition-all duration-200 hover:shadow-lg active:scale-95">
        <FaUpload className="mr-2" />
        <span>Загрузить данные</span>
        <input
          type="file"
          accept=".txt"
          onChange={onFileUpload}
          className="hidden"
        />
      </label>

      {/* Simulation Control */}
      {isSimulationActive && (
        <button
          onClick={onStopSimulation}
          className="w-full px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-semibold rounded-lg shadow-md hover:from-red-600 hover:to-red-700 transition-all duration-200 hover:shadow-lg active:scale-95 flex items-center justify-center gap-2"
        >
          <FaStop /> Остановить
        </button>
      )}

      {hasLoadedData && !isSimulationActive && (
        <button
          onClick={onStartSimulation}
          className="w-full px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white text-sm font-semibold rounded-lg shadow-md hover:from-green-600 hover:to-green-700 transition-all duration-200 hover:shadow-lg active:scale-95 flex items-center justify-center gap-2"
        >
          <FaPlay /> Запустить
        </button>
      )}

      {/* Real-time Mode */}
      <button
        onClick={onSwitchToRealTime}
        disabled={isDisabled}
        className={`w-full px-4 py-3 text-white text-sm font-semibold rounded-lg shadow-md transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 ${
          isDisabled
            ? "bg-slate-400 cursor-not-allowed"
            : "bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 hover:shadow-lg"
        }`}
      >
        <FaGlobe /> Real-time
      </button>
    </div>
  );
}
