import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import {
  DynamicSensorData,
  AnomalyInfo,
  AnomalyDetectionMethod,
  Thresholds,
} from "@/types/types";
import { excelSerialToJsDate, formatParamName } from "@/utils/utils";
import {
  getThresholdKeysForMethod,
  getThresholdLabel,
} from "@/utils/thresholdUtils";
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
  reportMethod: AnomalyDetectionMethod;
  reportThresholds: Thresholds;
  focusRequest?: AnomalyInfo | null;
  onFocusHandled?: () => void;
}

const RUSSIAN_TIME_KEY = "\u0432\u0440\u0435\u043c\u044f";
const DEFAULT_VISIBLE_POINTS = 75;
const MIN_VISIBLE_POINTS = 20;
const MAX_VISIBLE_POINTS_LIMIT = 2000;
const VISIBLE_POINTS_STEP = 5;
const VISIBLE_POINT_PRESETS = [50, 75, 100, 250, 500, 1000];
const REPORT_TIME_ZONE = "Europe/Moscow";

const toNumericTimestamp = (value: unknown): number => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;

  const parsed = Number(String(raw ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getPointTimestamp = (row: Record<string, unknown>): number => {
  return toNumericTimestamp(
    row[RUSSIAN_TIME_KEY] ?? row.time ?? row.Time ?? row.timestamp,
  );
};

const getRangeBackground = (value: number, min: number, max: number): string => {
  if (max <= min) return "#e2e8f0";
  const progress = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return `linear-gradient(90deg, #2563eb 0%, #3b82f6 ${progress}%, #e2e8f0 ${progress}%, #e2e8f0 100%)`;
};

const getTimestampKey = (value: unknown): string => {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsedValue = Number(String(rawValue ?? "").replace(",", "."));

  if (Number.isFinite(parsedValue)) {
    return parsedValue.toFixed(10);
  }

  return String(rawValue ?? "");
};

const getSensorValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value[0];

  if (typeof value === "object" && value !== null && "value" in value) {
    return (value as { value?: unknown }).value;
  }

  return value;
};

const getSensorAnomalyFlag = (value: unknown): boolean => {
  if (Array.isArray(value)) return Boolean(value[1]);

  if (typeof value === "object" && value !== null && "is_anomaly" in value) {
    return Boolean((value as { is_anomaly?: unknown }).is_anomaly);
  }

  return false;
};

const formatExportDateTime = (date: unknown, fallbackTimestamp: unknown): string => {
  const jsDate =
    date instanceof Date && !Number.isNaN(date.getTime())
      ? date
      : excelSerialToJsDate(toNumericTimestamp(fallbackTimestamp));

  if (Number.isNaN(jsDate.getTime())) return "";

  return jsDate.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: REPORT_TIME_ZONE,
  });
};

const formatCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";

  const text = String(value);
  if (
    text.includes(";") ||
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const buildCsvRow = (values: unknown[]): string =>
  values.map(formatCsvCell).join(";");

const formatMethodParameterLabel = (key: keyof Thresholds): string =>
  getThresholdLabel(key).replace(/:$/, "");

const formatMethodParameterValue = (value: number): string => {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
};

export function GraphGrid({
  liveData,
  availableParameters,
  graphVisibility,
  anomalyInfo,
  reportMethod,
  reportThresholds,
  focusRequest = null,
  onFocusHandled,
}: GraphGridProps) {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<string | null>(null);
  const [trackNewData, setTrackNewData] = useState<boolean>(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [visiblePoints, setVisiblePoints] = useState<number>(
    DEFAULT_VISIBLE_POINTS,
  );
  const [plotRevision, setPlotRevision] = useState<number>(0);
  const [focusedParam, setFocusedParam] = useState<string | null>(null);

  const lastLiveDataLength = useRef<number>(liveData.length);
  const isProgrammaticRelayout = useRef<boolean>(false);
  const settingsContainerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const processedData = useMemo<any[]>(() => {
    return liveData.map((point) => {
      const timestamp = getPointTimestamp(point as Record<string, unknown>);
      return {
        ...point,
        dateTime: excelSerialToJsDate(timestamp),
        dateTimeString: excelSerialToJsDate(timestamp).toLocaleTimeString(
          "ru-RU",
          {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
            timeZone: REPORT_TIME_ZONE,
          },
        ),
      };
    });
  }, [liveData]);

  const maxIndex = Math.max(0, processedData.length - visiblePoints);

  const findPointIndexByAnomaly = useCallback(
    (anomaly: AnomalyInfo): number => {
      const targetTs = toNumericTimestamp(anomaly.timestamp);
      if (!Number.isFinite(targetTs) || processedData.length === 0) {
        return -1;
      }

      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < processedData.length; index += 1) {
        const row = processedData[index] as Record<string, unknown>;
        if (!(anomaly.param in row)) continue;

        const rowTs = getPointTimestamp(row);
        const distance = Math.abs(rowTs - targetTs);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
          if (distance <= 1e-10) break;
        }
      }

      return bestIndex;
    },
    [processedData],
  );

  useEffect(() => {
    if (!focusRequest) return;

    const pointIndex = findPointIndexByAnomaly(focusRequest);
    if (pointIndex < 0) {
      onFocusHandled?.();
      return;
    }

    setTrackNewData(false);
    setFocusedParam(focusRequest.param);

    const halfWindow = Math.floor(visiblePoints / 2);
    const centeredIndex = Math.min(
      maxIndex,
      Math.max(0, pointIndex - halfWindow),
    );
    setCurrentIndex(centeredIndex);
    setShowJumpToLatest(centeredIndex < maxIndex);

    requestAnimationFrame(() => {
      cardRefs.current[focusRequest.param]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });

    onFocusHandled?.();
  }, [
    findPointIndexByAnomaly,
    focusRequest,
    maxIndex,
    onFocusHandled,
    visiblePoints,
  ]);

  useEffect(() => {
    if (!focusedParam) return;
    const timer = setTimeout(() => setFocusedParam(null), 4000);
    return () => clearTimeout(timer);
  }, [focusedParam]);

  useEffect(() => {
    if (liveData.length > lastLiveDataLength.current) {
      if (trackNewData) {
        const newMaxIndex = Math.max(0, processedData.length - visiblePoints);
        if (currentIndex < newMaxIndex) {
          setCurrentIndex(newMaxIndex);
          setShowJumpToLatest(false);
        }
      } else {
        const isAtLatest = currentIndex >= processedData.length - visiblePoints;
        if (!isAtLatest) {
          setShowJumpToLatest(true);
        }
      }
    }

    lastLiveDataLength.current = liveData.length;
  }, [
    liveData.length,
    processedData.length,
    trackNewData,
    currentIndex,
    visiblePoints,
  ]);

  useEffect(() => {
    if (!showSettings) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (
        settingsContainerRef.current &&
        !settingsContainerRef.current.contains(event.target as Node)
      ) {
        setShowSettings(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowSettings(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showSettings]);

  const getWindowData = useCallback(
    (data: any[], startIdx: number) => {
      const endIdx = Math.min(startIdx + visiblePoints, data.length);
      return data.slice(startIdx, endIdx);
    },
    [visiblePoints],
  );

  const forceLatestTrackingView = useCallback(() => {
    if (!trackNewData) return;

    if (currentIndex !== maxIndex) {
      setCurrentIndex(maxIndex);
    }

    setShowJumpToLatest(false);
    setPlotRevision((prev) => prev + 1);
  }, [trackNewData, currentIndex, maxIndex]);

  const handlePlotRelayout = useCallback(
    (eventData: Record<string, unknown>) => {
      if (!trackNewData || isProgrammaticRelayout.current || !eventData) return;

      const hasViewportChange = Object.keys(eventData).some(
        (key) =>
          key.startsWith("xaxis.range") ||
          key.startsWith("yaxis.range") ||
          key.startsWith("xaxis.autorange") ||
          key.startsWith("yaxis.autorange"),
      );

      if (!hasViewportChange) return;

      isProgrammaticRelayout.current = true;
      forceLatestTrackingView();
      requestAnimationFrame(() => {
        isProgrammaticRelayout.current = false;
      });
    },
    [trackNewData, forceLatestTrackingView],
  );

  const getTimeRange = useCallback(
    (startIdx: number) => {
      if (processedData.length === 0) return { start: "", end: "" };

      const startData = processedData[startIdx];
      const endIdx = Math.min(startIdx + visiblePoints - 1, processedData.length - 1);
      const endData = processedData[endIdx];

      return {
        start: startData?.dateTimeString || "",
        end: endData?.dateTimeString || "",
      };
    },
    [processedData, visiblePoints],
  );

  useEffect(() => {
    if (trackNewData) {
      if (currentIndex !== maxIndex) {
        setCurrentIndex(maxIndex);
      }
      setShowJumpToLatest(false);
      return;
    }

    if (currentIndex > maxIndex) {
      setCurrentIndex(maxIndex);
    }
  }, [trackNewData, currentIndex, maxIndex]);

  const handleJumpToLatest = () => {
    setCurrentIndex(maxIndex);
    setShowJumpToLatest(false);

    if (trackNewData) {
      setPlotRevision((prev) => prev + 1);
    }
  };

  const handleNext = () => {
    if (trackNewData) return;

    if (currentIndex < maxIndex) {
      setCurrentIndex((prev) => Math.min(prev + visiblePoints, maxIndex));
      setShowJumpToLatest(false);
    }
  };

  const handlePrev = () => {
    if (trackNewData) return;

    if (currentIndex > 0) {
      setCurrentIndex((prev) => Math.max(prev - visiblePoints, 0));
    }
  };

  const toggleTracking = () => {
    const nextState = !trackNewData;
    setTrackNewData(nextState);

    if (nextState) {
      setCurrentIndex(maxIndex);
      setShowJumpToLatest(false);
      setPlotRevision((prev) => prev + 1);
    }
  };

  const handleVisiblePointsChange = (nextValue: number) => {
    const normalizedValue = Number.isFinite(nextValue)
      ? Math.round(nextValue / VISIBLE_POINTS_STEP) * VISIBLE_POINTS_STEP
      : DEFAULT_VISIBLE_POINTS;
    const safeValue = Math.min(
      MAX_VISIBLE_POINTS_LIMIT,
      Math.max(MIN_VISIBLE_POINTS, normalizedValue),
    );

    setVisiblePoints(safeValue);
    setPlotRevision((prev) => prev + 1);
  };

  const handleVisiblePointsStepChange = (direction: 1 | -1) => {
    handleVisiblePointsChange(visiblePoints + direction * VISIBLE_POINTS_STEP);
  };

  const handleFullscreen = (paramKey: string) => {
    setIsFullscreen((prev) => (prev === paramKey ? null : paramKey));
  };

  const getCurrentWindowAnomalies = useCallback(
    (paramKey: string) => {
      if (processedData.length === 0) return [] as AnomalyInfo[];

      const startTs = getPointTimestamp(
        processedData[currentIndex] as Record<string, unknown>,
      );
      const endTs = getPointTimestamp(
        processedData[
          Math.min(currentIndex + visiblePoints - 1, processedData.length - 1)
        ] as Record<string, unknown>,
      );

      return anomalyInfo.filter((info) => {
        if (info.param !== paramKey) return false;

        const anomalyTs = toNumericTimestamp(info.timestamp);
        return anomalyTs >= startTs && anomalyTs <= endTs;
      });
    },
    [anomalyInfo, processedData, currentIndex, visiblePoints],
  );

  const getAnomalyXValues = useCallback(
    (paramKey: string, anomalies: AnomalyInfo[]) => {
      return anomalies.map((info) => {
        const targetTs = toNumericTimestamp(info.timestamp);
        const dataPoint = processedData.find(
          (point) =>
            getPointTimestamp(point as Record<string, unknown>) === targetTs,
        );

        const value = dataPoint?.[paramKey];
        return Array.isArray(value) ? value[0] : value;
      });
    },
    [processedData],
  );

  const handleExportData = (paramKey: string) => {
    if (processedData.length === 0) return;

    const unit = UNIT_MAP[paramKey] || "";
    const parameterName = formatParamName(paramKey);
    const anomalyDetailsByTimestamp = new Map(
      anomalyInfo
        .filter((info) => info.param === paramKey)
        .map((info) => [getTimestampKey(info.timestamp), info]),
    );

    const dataRows = processedData.map((point, index) => {
      const value = point[paramKey];
      const numericValue = getSensorValue(value);
      const pointTs = getPointTimestamp(point as Record<string, unknown>);
      const anomalyDetails = anomalyDetailsByTimestamp.get(
        getTimestampKey(pointTs),
      );
      const isAnomaly = Boolean(anomalyDetails) || getSensorAnomalyFlag(value);

      return {
        index: index + 1,
        time: formatExportDateTime(point.dateTime, pointTs),
        value:
          numericValue !== null && numericValue !== undefined ? numericValue : "",
        isAnomaly,
        anomalyLabel: isAnomaly ? "Да" : "Нет",
        unit,
        message:
          anomalyDetails?.message ||
          (isAnomaly ? `Аномалия обнаружена в ${parameterName}` : ""),
      };
    });

    const anomalyRows = dataRows.filter((row) => row.isAnomaly);
    const firstTime = dataRows[0]?.time || "";
    const lastTime = dataRows[dataRows.length - 1]?.time || "";
    const mainHeaders = [
      "№",
      "Время",
      "Значение",
      "Аномалия",
      "Единица",
    ];
    const anomalyHeaders = [
      "№ аномалии",
      "Время",
      "Значение аномалии",
      "Сообщение",
    ];
    const csvRows: string[] = [
      buildCsvRow(["Параметр", parameterName]),
      buildCsvRow(["Метод анализа", reportMethod]),
      buildCsvRow(["Параметры метода"]),
      ...getThresholdKeysForMethod(reportMethod).map((key) =>
        buildCsvRow([
          formatMethodParameterLabel(key),
          formatMethodParameterValue(reportThresholds[key]),
        ]),
      ),
      buildCsvRow(["Диапазон данных", `${firstTime} - ${lastTime}`]),
      buildCsvRow(["Всего точек", dataRows.length]),
      buildCsvRow(["Всего аномалий", anomalyRows.length]),
      "",
      buildCsvRow([
        "Все точки графика",
        "",
        "",
        "",
        "",
        "",
        "Выделенные аномалии",
      ]),
      buildCsvRow([...mainHeaders, "", ...anomalyHeaders]),
    ];

    const maxRows = Math.max(dataRows.length, anomalyRows.length);

    for (let index = 0; index < maxRows; index++) {
      const dataRow = dataRows[index];
      const anomalyRow = anomalyRows[index];

      csvRows.push(
        buildCsvRow([
          ...(dataRow
            ? [
                dataRow.index,
                dataRow.time,
                dataRow.value,
                dataRow.anomalyLabel,
                dataRow.unit,
              ]
            : ["", "", "", "", ""]),
          "",
          ...(anomalyRow
            ? [
                anomalyRow.index,
                anomalyRow.time,
                anomalyRow.value,
                anomalyRow.message,
              ]
            : ["", "", "", ""]),
        ]),
      );
    }

    const csvString = `\uFEFF${csvRows.join("\r\n")}`;
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const safeParamName = paramKey.replace(/[^\wА-Яа-я-]/g, "_");
    const safeTimeRange =
      `${firstTime}_${lastTime}`
        .replace(/[^\dA-Za-zА-Яа-я_-]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 80) || "all";

    link.setAttribute("href", url);
    link.setAttribute("download", `график_${safeParamName}_${safeTimeRange}.csv`);
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  if (isFullscreen) {
    const paramKey = isFullscreen;
    const windowData = getWindowData(processedData, currentIndex);
    const timeRange = getTimeRange(currentIndex);
    const xValues = windowData.map((point) => {
      const value = point[paramKey];
      return Array.isArray(value) ? value[0] : value;
    });
    const yValues = windowData.map((point) => point.dateTime);
    const unit = UNIT_MAP[paramKey] || "";
    const currentWindowAnomalies = getCurrentWindowAnomalies(paramKey);

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
                disabled={trackNewData || currentIndex === 0}
                className={`px-3 py-1 rounded ${
                  trackNewData || currentIndex === 0
                    ? "bg-slate-100 text-slate-400"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                <ChevronLeft size={18} />
              </button>

              <button
                onClick={handleNext}
                disabled={trackNewData || currentIndex >= maxIndex}
                className={`px-3 py-1 rounded ${
                  trackNewData || currentIndex >= maxIndex
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
              title="Экспорт всех точек в CSV"
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
                      availableParameters.indexOf(paramKey) % GRAPH_COLORS.length
                    ],
                  width: 2,
                },
                hovertemplate: `<b>%{x:.2f}</b> ${unit}<br>%{y|%H:%M:%S}<extra></extra>`,
              },
              {
                x: getAnomalyXValues(paramKey, currentWindowAnomalies),
                y: currentWindowAnomalies.map((info) =>
                  excelSerialToJsDate(toNumericTimestamp(info.timestamp)),
                ),
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
                title: { text: "Время", font: { size: 14 } },
                tickfont: { size: 12 },
              },
              xaxis: {
                gridcolor: "#f1f5f9",
                zeroline: false,
                tickfont: { size: 12 },
                title: {
                  text: unit ? `Значение (${unit})` : "Значение",
                  font: { size: 14 },
                },
              },
              hovermode: "closest",
              plot_bgcolor: "#ffffff",
              paper_bgcolor: "#ffffff",
              dragmode: trackNewData ? false : "pan",
              uirevision: trackNewData
                ? `tracking-${currentIndex}-${visiblePoints}-${plotRevision}`
                : "fixed",
            }}
            config={{
              displayModeBar: true,
              responsive: true,
              scrollZoom: !trackNewData,
              doubleClick: trackNewData ? false : "reset+autosize",
              modeBarButtonsToRemove: trackNewData
                ? [
                    "zoom2d",
                    "pan2d",
                    "select2d",
                    "lasso2d",
                    "zoomIn2d",
                    "zoomOut2d",
                    "autoScale2d",
                    "resetScale2d",
                  ]
                : [],
            }}
            revision={plotRevision}
            onRelayout={(eventData) =>
              handlePlotRelayout(eventData as Record<string, unknown>)
            }
            useResizeHandler={true}
            style={{ width: "100%", height: "100%" }}
          />
        </div>

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
                ? "График автоматически остается на последних данных"
                : "Вы можете свободно просматривать историю"}
            </div>
          </div>

          {showJumpToLatest && !trackNewData && (
            <button
              onClick={handleJumpToLatest}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
            >
              <ArrowDown size={16} />
              Перейти к последним данным
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handlePrev}
              disabled={trackNewData || currentIndex === 0}
              className={`p-2 rounded-lg ${
                trackNewData || currentIndex === 0
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
                  {getTimeRange(currentIndex).start} - {" "}
                  {getTimeRange(currentIndex).end}
                </span>
              </div>
              <div className="w-48 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      Math.min(
                        100,
                        (visiblePoints / Math.max(processedData.length, 1)) * 100,
                      )
                    }%`,
                    marginLeft: `${
                      (currentIndex / Math.max(processedData.length, 1)) * 100
                    }%`,
                  }}
                />
              </div>
            </div>

            <button
              onClick={handleNext}
              disabled={trackNewData || currentIndex >= maxIndex}
              className={`p-2 rounded-lg ${
                trackNewData || currentIndex >= maxIndex
                  ? "text-slate-300"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative" ref={settingsContainerRef}>
              <button
                onClick={() => setShowSettings((prev) => !prev)}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  showSettings
                    ? "bg-blue-100 text-blue-700"
                    : "hover:bg-slate-100 text-slate-600 hover:text-slate-800"
                }`}
                title="Настройки"
              >
                <Settings size={20} />
              </button>

              <div
                className={`absolute right-0 top-full mt-2 w-72 rounded-xl shadow-lg border border-slate-200 bg-white p-4 z-10 origin-top-right transition-all duration-200 ${
                  showSettings
                    ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                    : "opacity-0 -translate-y-1 scale-95 pointer-events-none"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-700">
                    Режим просмотра
                  </span>
                  <button
                    onClick={toggleTracking}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                      trackNewData ? "bg-green-500" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
                        trackNewData ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                  {trackNewData ? <Eye size={16} /> : <EyeOff size={16} />}
                  {trackNewData ? "Трекинг новых данных" : "Свободный просмотр"}
                </div>
                <p className="text-xs text-slate-500">
                  {trackNewData
                    ? "График всегда привязан к последним данным"
                    : "Трекинг выключен: можно свободно двигать и масштабировать"}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">
                      Точек в окне
                    </span>
                    <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                      {visiblePoints}
                    </span>
                  </div>

                  <input
                    type="range"
                    min={MIN_VISIBLE_POINTS}
                    max={MAX_VISIBLE_POINTS_LIMIT}
                    step={VISIBLE_POINTS_STEP}
                    value={visiblePoints}
                    onChange={(event) =>
                      handleVisiblePointsChange(Number(event.target.value))
                    }
                    className="w-full h-2 rounded-full appearance-none cursor-pointer transition-all duration-200"
                    style={{
                      background: getRangeBackground(
                        visiblePoints,
                        MIN_VISIBLE_POINTS,
                        MAX_VISIBLE_POINTS_LIMIT,
                      ),
                    }}
                  />

                  <div className="grid grid-cols-3 gap-2">
                    {VISIBLE_POINT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleVisiblePointsChange(preset)}
                        className={`rounded-lg px-2 py-1 text-xs font-medium transition-all duration-200 ${
                          visiblePoints === preset
                            ? "bg-blue-100 text-blue-700 border border-blue-200"
                            : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleVisiblePointsStepChange(-1)}
                      className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                      disabled={visiblePoints <= MIN_VISIBLE_POINTS}
                    >
                      -
                    </button>

                    <input
                      type="number"
                      min={MIN_VISIBLE_POINTS}
                      max={MAX_VISIBLE_POINTS_LIMIT}
                      step={VISIBLE_POINTS_STEP}
                      value={visiblePoints}
                      onChange={(event) =>
                        handleVisiblePointsChange(Number(event.target.value))
                      }
                      className="h-8 flex-1 rounded-lg border border-slate-300 px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                    />

                    <button
                      type="button"
                      onClick={() => handleVisiblePointsStepChange(1)}
                      className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                      disabled={visiblePoints >= MAX_VISIBLE_POINTS_LIMIT}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {showJumpToLatest && !trackNewData && (
              <button
                onClick={handleJumpToLatest}
                className="px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2 text-sm"
              >
                <ArrowDown size={14} />
                Новые данные
              </button>
            )}

            <div className="text-sm text-slate-500">{visiblePoints} точек</div>
          </div>
        </div>

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
              {trackNewData ? "Трекинг включен" : "Свободный режим"}
            </div>
            <span className="text-xs text-slate-500">
              {processedData.length} точек всего
            </span>
          </div>
          <span className="text-xs text-slate-400">
            {currentIndex === maxIndex ? "Показаны последние данные" : "Просмотр истории"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {availableParameters.map((paramKey, index) => {
          if (!graphVisibility[paramKey]) return null;

          const windowData = getWindowData(processedData, currentIndex);
          const xValues = windowData.map((point) => {
            const value = point[paramKey];
            return Array.isArray(value) ? value[0] : value;
          });
          const yValues = windowData.map((point) => point.dateTime);
          const unit = UNIT_MAP[paramKey] || "";
          const currentWindowAnomalies = getCurrentWindowAnomalies(paramKey);

          return (
            <div
              key={paramKey}
              ref={(node) => {
                cardRefs.current[paramKey] = node;
              }}
              className={`bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition-all duration-300 flex flex-col group ${
                focusedParam === paramKey
                  ? "border-amber-400 ring-2 ring-amber-200"
                  : "border-slate-200"
              }`}
            >
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <span className="text-sm font-bold text-slate-700 truncate mr-2">
                  {formatParamName(paramKey).toUpperCase()}
                </span>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleExportData(paramKey)}
                    className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-700"
                    title="Экспорт всех точек в CSV"
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
                      x: getAnomalyXValues(paramKey, currentWindowAnomalies),
                      y: currentWindowAnomalies.map((info) =>
                        excelSerialToJsDate(toNumericTimestamp(info.timestamp)),
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
                    dragmode: trackNewData ? false : "pan",
                    uirevision: trackNewData
                      ? `tracking-${currentIndex}-${visiblePoints}-${plotRevision}`
                      : "fixed",
                  }}
                  config={{
                    displayModeBar: false,
                    responsive: true,
                    scrollZoom: !trackNewData,
                    doubleClick: trackNewData ? false : "reset+autosize",
                  }}
                  revision={plotRevision}
                  onRelayout={(eventData) =>
                    handlePlotRelayout(eventData as Record<string, unknown>)
                  }
                  useResizeHandler={true}
                  style={{ width: "100%", height: "100%" }}
                />

                {!trackNewData && currentIndex < maxIndex && (
                  <div className="absolute top-2 right-2">
                    <div className="px-2 py-1 bg-slate-800/80 text-white text-xs rounded flex items-center gap-1">
                      <EyeOff size={10} />
                      История
                    </div>
                  </div>
                )}
              </div>

              <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {unit && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium">
                      {unit}
                    </span>
                  )}

                  {currentWindowAnomalies.length > 0 && (
                    <span className="text-rose-600 text-xs font-medium">
                      {currentWindowAnomalies.length} аномалий
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
