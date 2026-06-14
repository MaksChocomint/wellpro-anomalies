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
  const selectedCount = availableParameters.filter(
    (param) => graphVisibility[param],
  ).length;

  return (
    <section className="surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-700">
            <FaChartArea />
          </div>
          <div className="min-w-0">
            <div className="ui-label">Графики</div>
            <h2 className="mt-1 text-lg font-black text-slate-950">
              Выбрать параметры
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {selectedCount}/{availableParameters.length || 0} каналов выбрано
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsVisible((prev) => !prev)}
          className="btn-secondary"
        >
          {isVisible ? <FaChevronDown /> : <FaChevronRight />}
          {isVisible ? "Скрыть" : "Открыть"}
        </button>
      </div>

      {isVisible && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <button onClick={onShowAll} className="btn-primary">
              <FaCheck /> Показать все
            </button>

            <button onClick={onHideAll} className="btn-secondary">
              <FaTimes /> Скрыть все
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availableParameters.map((paramKey) => {
              const checked = Boolean(graphVisibility[paramKey]);

              return (
                <label
                  key={paramKey}
                  className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                    checked
                      ? "border-blue-200 bg-blue-50 text-slate-950"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--primary)]"
                    checked={checked}
                    onChange={() => onVisibilityChange(paramKey)}
                  />

                  <span className="min-w-0 truncate font-semibold">
                    {formatParamName(paramKey)}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
