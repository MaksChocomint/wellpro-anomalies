import { useState } from "react";
import {
  FaChartArea,
  FaChevronDown,
  FaChevronRight,
  FaCheck,
  FaTimes,
} from "react-icons/fa";

import { formatParamName } from "@/utils/utils";

interface GraphControlsProps {
  graphVisibility: Record<string, boolean>;
  onVisibilityChange: (param: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  availableParameters: string[];
}

export function GraphControls({
  graphVisibility,
  onVisibilityChange,
  onShowAll,
  onHideAll,
  availableParameters,
}: GraphControlsProps) {
  const [isVisible, setIsVisible] = useState(false);

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg mb-8 border border-slate-200">
      <div className="flex gap-6 items-center mb-4 flex-wrap">
        <h3 className="text-2xl font-bold text-slate-900 flex items-center">
          <FaChartArea className="mr-2" />
          Выбрать параметры
        </h3>

        <button
          onClick={toggleVisibility}
          className="px-4 py-2 bg-gradient-to-r from-slate-200 to-slate-300 text-slate-700 font-semibold text-sm rounded-lg shadow-md hover:from-slate-300 hover:to-slate-400 transition duration-200 ease-in-out flex items-center gap-2"
        >
          {isVisible ? <FaChevronDown /> : <FaChevronRight />}
          {isVisible ? "Скрыть" : "Показать"}
        </button>
      </div>

      {isVisible && (
        <>
          <div className="flex gap-3 mb-6 flex-wrap">
            <button
              onClick={onShowAll}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-semibold rounded-lg shadow-md hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 transition duration-200 ease-in-out flex items-center gap-2"
            >
              <FaCheck /> Показать все
            </button>

            <button
              onClick={onHideAll}
              className="px-4 py-2 bg-gradient-to-r from-slate-400 to-slate-500 text-white text-sm font-semibold rounded-lg shadow-md hover:from-slate-500 hover:to-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400 transition duration-200 ease-in-out flex items-center gap-2"
            >
              <FaTimes /> Скрыть все
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {availableParameters.map((paramKey) => (
              <label
                key={paramKey}
                className="flex items-center cursor-pointer text-slate-700 hover:text-blue-600 transition duration-150 ease-in-out p-3 rounded-lg hover:bg-blue-50"
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
                  checked={!!graphVisibility[paramKey]}
                  onChange={() => onVisibilityChange(paramKey)}
                />

                <span className="ml-2 font-medium text-sm">
                  {formatParamName(paramKey)}
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
