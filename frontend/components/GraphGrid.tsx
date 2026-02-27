import React, {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import dynamic from "next/dynamic";
import { DynamicSensorData, AnomalyInfo } from "@/types/types";
import { excelSerialToJsDate, formatParamName } from "@/utils/utils";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  ArrowDown,
  Eye,
  EyeOff,
  Download,
  Settings,
} from "lucide-react";

import { UNIT_MAP } from "@/constants/units";

const GRAPH_COLORS = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf",
];

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface GraphGridProps {
  liveData: DynamicSensorData[];
  availableParameters: string[];
  graphVisibility: Record<string, boolean>;
  anomalyInfo: AnomalyInfo[];
}

const MAX_VISIBLE_POINTS = 75;

export function GraphGrid({
  liveData,
  availableParameters,
  graphVisibility,
  anomalyInfo,
}: GraphGridProps) {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<string | null>(null);
  const [trackNewData, setTrackNewData] = useState<boolean>(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const lastLiveDataLength = useRef<number>(liveData.length);
  const plotRefs = useRef<{ [key: string]: any }>({});

  const processedData = useMemo(() => {
    return liveData.map((d) => ({
      ...d,
      dateTime: excelSerialToJsDate(d["время"] as number),
      dateTimeString: excelSerialToJsDate(
        d["время"] as number,
      ).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    }));
  }, [liveData]);

  // Эффект для автоматического трекинга новых данных
  useEffect(() => {
    if (liveData.length > lastLiveDataLength.current) {
      if (trackNewData) {
        // Автоматически переходим к последним данным
        const newMaxIndex = Math.max(
          0,
          processedData.length - MAX_VISIBLE_POINTS,
        );
        if (currentIndex < newMaxIndex) {
          setCurrentIndex(newMaxIndex);
          setShowJumpToLatest(false);
        }
      } else {
        // Показываем уведомление о новых данных
        const isAtLatest =
          currentIndex >= processedData.length - MAX_VISIBLE_POINTS;
        if (!isAtLatest) {
          setShowJumpToLatest(true);
        }
      }
    }
    lastLiveDataLength.current = liveData.length;
  }, [liveData.length, processedData.length, trackNewData, currentIndex]);

  // Получаем данные для текущего окна просмотра
  const getWindowData = useCallback((data: any[], startIdx: number) => {
    const endIdx = Math.min(startIdx + MAX_VISIBLE_POINTS, data.length);
    return data.slice(startIdx, endIdx);
  }, []);

  // Рассчитываем максимальный доступный индекс для скролла
  const maxIndex = Math.max(0, processedData.length - MAX_VISIBLE_POINTS);

  // Получаем временной диапазон для текущего окна
  const getTimeRange = useCallback(
    (startIdx: number) => {
      if (processedData.length === 0) return { start: "", end: "" };

      const startData = processedData[startIdx];
      const endIdx = Math.min(
        startIdx + MAX_VISIBLE_POINTS - 1,
        processedData.length - 1,
      );
      const endData = processedData[endIdx];

      return {
        start: startData?.dateTimeString || "",
        end: endData?.dateTimeString || "",
      };
    },
    [processedData],
  );

  // Перейти к самым последним данным
  const handleJumpToLatest = () => {
    if (maxIndex >= 0) {
      setCurrentIndex(maxIndex);
      setShowJumpToLatest(false);
    }
  };

  // Функции навигации
  const handleNext = () => {
    if (currentIndex < maxIndex) {
      setCurrentIndex((prev) => Math.min(prev + MAX_VISIBLE_POINTS, maxIndex));
      setShowJumpToLatest(false);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => Math.max(prev - MAX_VISIBLE_POINTS, 0));
    }
  };

  // Переключить режим трекинга
  const toggleTracking = () => {
    const newTrackingState = !trackNewData;
    setTrackNewData(newTrackingState);

    // Если включаем трекинг и не на последних данных, переходим к ним
    if (newTrackingState && currentIndex < maxIndex) {
      setCurrentIndex(maxIndex);
      setShowJumpToLatest(false);
    }
  };

  const handleFullscreen = (paramKey: string) => {
    if (isFullscreen === paramKey) {
      setIsFullscreen(null);
    } else {
      setIsFullscreen(paramKey);
    }
  };

  // Экспорт данных графика в CSV с правильной кодировкой
  const handleExportData = (paramKey: string) => {
    const windowData = getWindowData(processedData, currentIndex);
    const unit = UNIT_MAP[paramKey] || "";

    // Подготовка данных для CSV
    const data = windowData.map((d) => {
      const value = d[paramKey];
      const numericValue = Array.isArray(value) ? value[0] : value;
      const isAnomaly = anomalyInfo.some(
        (info) => info.param === paramKey && info.timestamp === d["время"],
      );

      return {
        Время: d.dateTimeString,
        Значение:
          numericValue !== null && numericValue !== undefined
            ? numericValue
            : "",
        Аномалия: isAnomaly ? "Да" : "Нет",
        "Единица измерения": unit,
      };
    });

    // Создание заголовков CSV
    const headers = ["Время", "Значение", "Аномалия", "Единица измерения"];

    // Создание CSV строки с правильным разделителем (точка с запятой для Excel)
    const csvRows = [];

    // Добавляем метаданные
    csvRows.push(`Параметр: ${formatParamName(paramKey)}`);
    csvRows.push(
      `Временной диапазон: ${getTimeRange(currentIndex).start} - ${
        getTimeRange(currentIndex).end
      }`,
    );
    csvRows.push(`Всего записей: ${data.length}`);
    csvRows.push("");

    // Добавляем заголовки
    csvRows.push(headers.join(";"));

    // Добавляем данные
    data.forEach((row) => {
      const rowData = headers.map((header) => {
        const value = row[header];
        // Оборачиваем строки в кавычки, если они содержат разделители
        if (
          typeof value === "string" &&
          (value.includes(";") || value.includes(",") || value.includes('"'))
        ) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvRows.push(rowData.join(";"));
    });

    // Добавляем BOM для правильного отображения кириллицы в Excel
    const BOM = "\uFEFF";
    const csvString = BOM + csvRows.join("\r\n");

    // Создаем и скачиваем файл
    const blob = new Blob([csvString], {
      type: "text/csv;charset=utf-8;",
    });

    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    // Создаем имя файла без специальных символов
    const safeParamName = paramKey.replace(/[^a-zA-Z0-9_а-яА-Я]/g, "_");
    const safeTimeRange = getTimeRange(currentIndex)
      .start.replace(/:/g, "-")
      .replace(/\s/g, "_");

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `данные_${safeParamName}_${safeTimeRange}.csv`,
    );
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Освобождаем память
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // Если график в полноэкранном режиме, показываем только его
  if (isFullscreen) {
    const paramKey = isFullscreen;
    const windowData = getWindowData(processedData, currentIndex);
    const timeRange = getTimeRange(currentIndex);
    const xValues = windowData.map((d) => {
      const val = d[paramKey];
      return Array.isArray(val) ? val[0] : val;
    });
    const yValues = windowData.map((d) => d.dateTime);
    const unit = UNIT_MAP[paramKey] || "";

    return (
      <div className="fixed inset-0 bg-white z-50 p-4 flex flex-col">
        <div className="flex justify-between items-center mb-4 border-b pb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsFullscreen(null)}
              className="p-2 hover:bg-slate-100 rounded-lg"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                {formatParamName(paramKey).toUpperCase()} {unit && `(${unit})`}
              </h2>
              <p className="text-sm text-slate-500">
                {timeRange.start} - {timeRange.end}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                disabled={currentIndex === 0}
                className={`px-3 py-1 rounded ${
                  currentIndex === 0
                    ? "bg-slate-100 text-slate-400"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                <ChevronLeft size={18} />
              </button>

              <button
                onClick={handleNext}
                disabled={currentIndex >= maxIndex}
                className={`px-3 py-1 rounded ${
                  currentIndex >= maxIndex
                    ? "bg-slate-100 text-slate-400"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <button
              onClick={() => handleExportData(paramKey)}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-800"
              title="Экспорт данных в CSV"
            >
              <Download size={20} />
            </button>

            <button
              onClick={() => setIsFullscreen(null)}
              className="p-2 hover:bg-slate-100 rounded-lg"
            >
              <Maximize2 size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 relative">
          <Plot
            data={[
              {
                x: xValues,
                y: yValues,
                type: "scatter",
                mode: "lines",
                line: {
                  color:
                    GRAPH_COLORS[
                      availableParameters.indexOf(paramKey) %
                        GRAPH_COLORS.length
                    ],
                  width: 2,
                },
                hovertemplate: `<b>%{x:.2f}</b> ${unit}<br>%{y|%H:%M:%S}<extra></extra>`,
              },
              {
                x: anomalyInfo
                  .filter(
                    (info) =>
                      info.param === paramKey &&
                      info.timestamp >=
                        processedData[currentIndex]?.["время"] &&
                      info.timestamp <=
                        processedData[
                          Math.min(
                            currentIndex + MAX_VISIBLE_POINTS - 1,
                            processedData.length - 1,
                          )
                        ]?.["время"],
                  )
                  .map((info) => {
                    const dPoint = processedData.find(
                      (d) => d["время"] === info.timestamp,
                    );
                    const val = dPoint?.[paramKey];
                    return Array.isArray(val) ? val[0] : val;
                  }),
                y: anomalyInfo
                  .filter(
                    (info) =>
                      info.param === paramKey &&
                      info.timestamp >=
                        processedData[currentIndex]?.["время"] &&
                      info.timestamp <=
                        processedData[
                          Math.min(
                            currentIndex + MAX_VISIBLE_POINTS - 1,
                            processedData.length - 1,
                          )
                        ]?.["время"],
                  )
                  .map((info) => excelSerialToJsDate(info.timestamp)),
                mode: "markers",
                type: "scatter",
                marker: { color: "#ff4d4f", symbol: "diamond", size: 10 },
                hovertemplate: `<b>АНОМАЛИЯ</b><br>%{x:.2f} ${unit}<extra></extra>`,
                name: "Аномалии",
              },
            ]}
            layout={{
              autosize: true,
              margin: { l: 80, r: 40, t: 40, b: 80 },
              showlegend: true,
              legend: {
                x: 1,
                y: 1,
                xanchor: "right",
                yanchor: "top",
                bgcolor: "rgba(255, 255, 255, 0.8)",
              },
              yaxis: {
                type: "date",
                autorange: "reversed",
                tickformat: "%H:%M:%S",
                nticks: 10,
                gridcolor: "#f1f5f9",
                title: "Время",
                titlefont: { size: 14 },
                tickfont: { size: 12 },
              },
              xaxis: {
                gridcolor: "#f1f5f9",
                zeroline: false,
                tickfont: { size: 12 },
                title: unit ? `Значение (${unit})` : "Значение",
                titlefont: { size: 14 },
              },
              hovermode: "closest",
              plot_bgcolor: "#ffffff",
              paper_bgcolor: "#ffffff",
              dragmode: "pan",
              uirevision: trackNewData ? "auto" : "fixed",
            }}
            config={{
              displayModeBar: true,
              responsive: true,
              scrollZoom: true,
            }}
            useResizeHandler={true}
            style={{ width: "100%", height: "100%" }}
          />
        </div>

        {/* Панель управления в полноэкранном режиме */}
        <div className="mt-4 pt-4 border-t flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTracking}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                trackNewData
                  ? "bg-green-500 text-white"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {trackNewData ? <Eye size={18} /> : <EyeOff size={18} />}
              {trackNewData ? "Трекинг новых данных" : "Свободный просмотр"}
            </button>

            <div className="text-sm text-slate-600">
              {trackNewData
                ? "Автоматически переходит к новым данным"
                : "График фиксирован, нажмите кнопку для перехода"}
            </div>
          </div>

          {showJumpToLatest && !trackNewData && (
            <button
              onClick={handleJumpToLatest}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
            >
              <ArrowDown size={16} />
              Перейти к новым данным
            </button>
          )}
        </div>
      </div>
    );
  }

  // Обычный режим - сетка графиков
  return (
    <div className="space-y-6">
      {/* Панель управления */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className={`p-2 rounded-lg ${
                currentIndex === 0
                  ? "text-slate-300"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex items-center gap-2">
              <div className="text-sm">
                <span className="text-slate-600">Временной диапазон:</span>
                <span className="font-medium text-slate-800 ml-2">
                  {getTimeRange(currentIndex).start} -{" "}
                  {getTimeRange(currentIndex).end}
                </span>
              </div>
              <div className="w-48 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      (MAX_VISIBLE_POINTS / processedData.length) * 100
                    }%`,
                    marginLeft: `${
                      (currentIndex / processedData.length) * 100
                    }%`,
                  }}
                />
              </div>
            </div>

            <button
              onClick={handleNext}
              disabled={currentIndex >= maxIndex}
              className={`p-2 rounded-lg ${
                currentIndex >= maxIndex
                  ? "text-slate-300"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Переключатель режимов */}
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-800"
                title="Настройки"
              >
                <Settings size={20} />
              </button>

              {showSettings && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-lg border border-slate-200 p-4 w-64 z-10">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-slate-700">
                      Режим просмотра
                    </span>
                    <button
                      onClick={toggleTracking}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full ${
                        trackNewData ? "bg-green-500" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                          trackNewData ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                    {trackNewData ? <Eye size={16} /> : <EyeOff size={16} />}
                    {trackNewData
                      ? "Трекинг новых данных"
                      : "Свободный просмотр"}
                  </div>
                  <p className="text-xs text-slate-500">
                    {trackNewData
                      ? "График автоматически показывает последние данные"
                      : "График фиксирован, вы можете свободно исследовать историю"}
                  </p>
                </div>
              )}
            </div>

            {/* Кнопка перехода к новым данным */}
            {showJumpToLatest && !trackNewData && (
              <button
                onClick={handleJumpToLatest}
                className="px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2 text-sm"
              >
                <ArrowDown size={14} />
                Новые данные
              </button>
            )}

            <div className="text-sm text-slate-500">
              {MAX_VISIBLE_POINTS} записей
            </div>
          </div>
        </div>

        {/* Индикатор режима */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                trackNewData
                  ? "bg-green-100 text-green-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {trackNewData ? <Eye size={12} /> : <EyeOff size={12} />}
              {trackNewData ? "Трекинг активен" : "Свободный просмотр"}
            </div>
            <span className="text-xs text-slate-500">
              {processedData.length} записей всего
            </span>
          </div>
          <span className="text-xs text-slate-400">
            {currentIndex === maxIndex
              ? "Показаны последние данные"
              : "Просмотр истории"}
          </span>
        </div>
      </div>

      {/* Сетка графиков */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {availableParameters.map((paramKey, index) => {
          if (!graphVisibility[paramKey]) return null;

          const windowData = getWindowData(processedData, currentIndex);

          const xValues = windowData.map((d) => {
            const val = d[paramKey];
            return Array.isArray(val) ? val[0] : val;
          });

          const yValues = windowData.map((d) => d.dateTime);
          const unit = UNIT_MAP[paramKey] || "";

          // Фильтруем аномалии для текущего окна
          const currentWindowAnomalies = anomalyInfo.filter(
            (info) =>
              info.param === paramKey &&
              info.timestamp >= processedData[currentIndex]?.["время"] &&
              info.timestamp <=
                processedData[
                  Math.min(
                    currentIndex + MAX_VISIBLE_POINTS - 1,
                    processedData.length - 1,
                  )
                ]?.["время"],
          );

          return (
            <div
              key={paramKey}
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all duration-300 flex flex-col group"
            >
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <span className="text-sm font-bold text-slate-700 truncate mr-2">
                  {formatParamName(paramKey).toUpperCase()}
                </span>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleExportData(paramKey)}
                    className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-700"
                    title="Экспорт данных в CSV"
                  >
                    <Download size={14} />
                  </button>
                  <button
                    onClick={() => handleFullscreen(paramKey)}
                    className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-700"
                    title="Полноэкранный режим"
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
              </div>

              <div className="p-1 flex-1 relative">
                <Plot
                  ref={(ref) => (plotRefs.current[paramKey] = ref)}
                  data={[
                    {
                      x: xValues,
                      y: yValues,
                      type: "scatter",
                      mode: "lines",
                      line: {
                        color: GRAPH_COLORS[index % GRAPH_COLORS.length],
                        width: 2,
                      },
                      hovertemplate: `<b>%{x:.2f}</b> ${unit}<br>%{y|%H:%M:%S}<extra></extra>`,
                    },
                    {
                      x: currentWindowAnomalies.map((info) => {
                        const dPoint = processedData.find(
                          (d) => d["время"] === info.timestamp,
                        );
                        const val = dPoint?.[paramKey];
                        return Array.isArray(val) ? val[0] : val;
                      }),
                      y: currentWindowAnomalies.map((info) =>
                        excelSerialToJsDate(info.timestamp),
                      ),
                      mode: "markers",
                      type: "scatter",
                      marker: { color: "#ff4d4f", symbol: "diamond", size: 8 },
                      hovertemplate: `<b>АНОМАЛИЯ</b><br>%{x:.2f} ${unit}<extra></extra>`,
                      name: "Аномалии",
                    },
                  ]}
                  layout={{
                    autosize: true,
                    margin: { l: 50, r: 20, t: 20, b: 50 },
                    showlegend: false,
                    yaxis: {
                      type: "date",
                      autorange: "reversed",
                      tickformat: "%H:%M:%S",
                      nticks: 6,
                      gridcolor: "#f1f5f9",
                      tickfont: { size: 10 },
                      tickangle: 0,
                    },
                    xaxis: {
                      gridcolor: "#f1f5f9",
                      zeroline: false,
                      tickfont: { size: 10 },
                    },
                    height: 250,
                    hovermode: "closest",
                    plot_bgcolor: "#ffffff",
                    paper_bgcolor: "#ffffff",
                    dragmode: "pan",
                    uirevision: trackNewData ? "auto" : "fixed",
                  }}
                  config={{
                    displayModeBar: false,
                    responsive: true,
                    scrollZoom: true,
                  }}
                  useResizeHandler={true}
                  style={{ width: "100%", height: "100%" }}
                />

                {/* Индикатор режима на графике */}
                {!trackNewData && currentIndex < maxIndex && (
                  <div className="absolute top-2 right-2">
                    <div className="px-2 py-1 bg-slate-800/80 text-white text-xs rounded flex items-center gap-1">
                      <EyeOff size={10} />
                      История
                    </div>
                  </div>
                )}
              </div>

              {/* Нижняя панель с информацией */}
              <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {unit && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium">
                      {unit}
                    </span>
                  )}

                  {currentWindowAnomalies.length > 0 && (
                    <span className="text-rose-600 text-xs font-medium">
                      ⚠️ {currentWindowAnomalies.length} аномалий
                    </span>
                  )}
                </div>

                <span className="text-slate-400 text-[10px]">
                  {getTimeRange(currentIndex).start}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
