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
    <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
      <div
        className={`surface p-4 transition-colors duration-200 ${
          anomalyDetected ? "border-red-200 bg-red-50" : "border-emerald-200"
        }`}
      >
        <div className="flex items-start gap-4">
          <div
            className={`rounded-md border p-2 ${
              anomalyDetected
                ? "border-red-200 bg-white text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {anomalyDetected ? (
              <FaExclamationTriangle className="text-xl" />
            ) : (
              <FaCheckCircle className="text-xl" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="ui-label">Статус аномалий</div>
            <h2
              className={`mt-1 text-lg font-black ${
                anomalyDetected ? "text-red-800" : "text-emerald-800"
              }`}
            >
              {anomalyDetected ? "Аномалия обнаружена" : "Нормальная работа"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {anomalyDetected
                ? "Есть параметры, требующие проверки оператором."
                : "Критических отклонений сейчас не найдено."}
            </p>
          </div>
          {anomalyDetected && (
            <button
              onClick={onDismissAnomaly}
              className="btn-secondary whitespace-nowrap"
            >
              <FaCheckCircle /> Проверено
            </button>
          )}
        </div>
      </div>

      <div className="surface p-4">
        <div className="flex items-start gap-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-700">
            {isBackendConnected ? (
              <FaSignal className="text-xl" />
            ) : (
              <FaDatabase className="text-xl" />
            )}
          </div>
          <div>
            <div className="ui-label">Режим данных</div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`status-dot ${
                  isBackendConnected ? "bg-emerald-600" : "bg-amber-500"
                }`}
              />
              <span className="text-lg font-black text-slate-900">
                {isBackendConnected ? "Real-time" : "Локальная симуляция"}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {isBackendConnected
                ? "Backend подключен, поток данных активен."
                : "Работа идёт с локальным файлом или симуляцией."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
