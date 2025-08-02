import { useState } from "react";
import { plotConfigs, SensorParamKey } from "./types";

interface GraphControlsProps {
  graphVisibility: Record<SensorParamKey, boolean>;
  onVisibilityChange: (param: SensorParamKey) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}

export function GraphControls({
  graphVisibility,
  onVisibilityChange,
  onShowAll,
  onHideAll,
}: GraphControlsProps) {
  const [isVisible, setIsVisible] = useState(false);

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
      <div className="flex gap-8 items-center mb-4">
        <h3 className="text-2xl font-semibold text-gray-800">
          Выбрать параметры для отображения
        </h3>
        <button
          onClick={toggleVisibility}
          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-md shadow-md hover:bg-gray-300 transition duration-200 ease-in-out"
        >
          {isVisible ? "Скрыть параметры" : "Показать параметры"}
        </button>
      </div>

      {isVisible && (
        <>
          <div className="flex gap-3 mb-4">
            <button
              onClick={onShowAll}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition duration-200 ease-in-out"
            >
              Показать все графики
            </button>
            <button
              onClick={onHideAll}
              className="px-4 py-2 bg-gray-400 text-white text-sm rounded-md shadow-md hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-opacity-75 transition duration-200 ease-in-out"
            >
              Скрыть все графики
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {plotConfigs.map((config) => (
              <label
                key={config.key}
                className="inline-flex items-center cursor-pointer text-gray-700 hover:text-gray-900 transition duration-150 ease-in-out"
              >
                <input
                  type="checkbox"
                  className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                  checked={graphVisibility[config.key]}
                  onChange={() => onVisibilityChange(config.key)}
                />
                <span className="ml-2 font-medium text-sm">{config.title}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
