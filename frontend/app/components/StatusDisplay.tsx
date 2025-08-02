// components/StatusDisplay.tsx
import { FaExclamationTriangle } from "react-icons/fa";

interface StatusDisplayProps {
  anomalyDetected: boolean;
  isBackendConnected: boolean;
}

export function StatusDisplay({
  anomalyDetected,
  isBackendConnected,
}: StatusDisplayProps) {
  return (
    <>
      {/* Блок статуса аномалии */}
      <div
        className={`p-5 mb-8 rounded-xl shadow-lg text-center transition-all duration-300
          ${
            anomalyDetected
              ? "bg-red-100 text-red-800 border-l-4 border-red-500"
              : "bg-green-100 text-green-800 border-l-4 border-green-500"
          }`}
      >
        <h2 className="text-2xl font-bold flex items-center justify-center">
          {anomalyDetected && (
            <FaExclamationTriangle className="mr-3 text-3xl" />
          )}
          Статус:{" "}
          {anomalyDetected ? "АНОМАЛИЯ ОБНАРУЖЕНА!" : "Нормальная работа"}
        </h2>
        {anomalyDetected && (
          <p className="mt-3 text-lg">
            Обнаружено аномальное значение! Требуется внимание.
          </p>
        )}
      </div>

      {/* Блок статуса подключения к бэкенду/симуляции */}
      <div
        className={`p-4 mb-8 rounded-xl text-center font-medium shadow-sm transition-all duration-300
          ${
            isBackendConnected
              ? "bg-blue-50 text-blue-700 border border-blue-200"
              : "bg-yellow-50 text-yellow-700 border border-yellow-200"
          }`}
      >
        Режим данных:{" "}
        <span className="font-bold">
          {isBackendConnected ? "Real-time" : "Локальная симуляция"}
        </span>
      </div>
    </>
  );
}
