import {
  FaExclamationTriangle,
  FaCheckCircle,
  FaSignal,
  FaDatabase,
} from "react-icons/fa";

interface StatusDisplayProps {
  anomalyDetected: boolean;
  isBackendConnected: boolean;
  onDismissAnomaly: () => void;
}

export function StatusDisplay({
  anomalyDetected,
  isBackendConnected,
  onDismissAnomaly,
}: StatusDisplayProps) {
  return (
    <>
      {/* Блок статуса аномалии */}
      <div
        className={`p-6 mb-4 rounded-xl shadow-lg text-center transition-all duration-300
${
  anomalyDetected
    ? "bg-gradient-to-r from-red-50 to-rose-50 text-red-900 border border-red-200"
    : "bg-gradient-to-r from-green-50 to-emerald-50 text-green-900 border border-green-200"
}`}
      >
        <h2 className="text-2xl font-bold flex items-center justify-center">
          {anomalyDetected ? (
            <FaExclamationTriangle className="mr-3 text-3xl text-red-600" />
          ) : (
            <FaCheckCircle className="mr-3 text-3xl text-green-600" />
          )}
          {anomalyDetected ? "АНОМАЛИЯ ОБНАРУЖЕНА" : "Нормальная работа"}
        </h2>
        {anomalyDetected && (
          <>
            <p className="mt-3 text-lg text-red-800">
              Обнаружено аномальное значение! Требуется внимание.
            </p>
            <button
              onClick={onDismissAnomaly}
              className="mt-4 px-6 py-2 bg-white text-red-700 border border-red-300 rounded-lg shadow-md hover:bg-red-50 hover:border-red-400 transition duration-300 font-semibold flex items-center justify-center mx-auto"
            >
              <FaCheckCircle className="mr-2" /> Отметить как проверенное
            </button>
          </>
        )}
      </div>

      {/* Блок статуса подключения к бэкенду/симуляции */}
      <div
        className={`p-4 mb-6 rounded-xl text-center font-semibold shadow-md transition-all duration-300
${
  isBackendConnected
    ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-900 border border-blue-200"
    : "bg-gradient-to-r from-yellow-50 to-amber-50 text-yellow-900 border border-yellow-200"
}`}
      >
        <div className="flex items-center justify-center gap-2">
          {isBackendConnected ? (
            <FaSignal className="text-xl" />
          ) : (
            <FaDatabase className="text-xl" />
          )}
          <span>Режим данных:</span>
          <span className="font-bold">
            {isBackendConnected ? "Real-time" : "Локальная симуляция"}
          </span>
        </div>
      </div>
    </>
  );
}
