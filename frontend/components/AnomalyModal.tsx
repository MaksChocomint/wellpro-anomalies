"use client";
import React, { useState, useEffect } from "react";
import Modal from "react-modal";
import {
  FaExclamationTriangle,
  FaTimes,
  FaArrowLeft,
  FaArrowRight,
  FaDatabase,
  FaCheck,
  FaClock,
  FaChartLine,
  FaRuler,
  FaWeightHanging,
  FaTachometerAlt,
  FaThermometerHalf,
  FaOilCan,
  FaWater,
  FaCompress,
  FaGripfire,
  FaMountain,
  FaEyeSlash,
} from "react-icons/fa";
import { AnomalyInfo } from "@/types/types";
import {
  excelSerialToJsDate,
  formatDate,
  formatParamName,
} from "@/utils/utils";
import { UNIT_MAP } from "@/constants/units";
import { api } from "@/utils/api";

interface AnomalyModalProps {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  anomalyInfo: AnomalyInfo[];
  rigId: number;
  method: string;
  threshold: number;
  windowSize: number; // Добавляем windowSize
  onDoNotShowAgain: () => void;
}

// Функция для получения иконки по параметру
const getParamIcon = (paramName: string) => {
  const name = paramName.toLowerCase();
  if (
    name.includes("вес") ||
    name.includes("weight") ||
    name.includes("нагрузка")
  )
    return <FaWeightHanging className="text-sm" />;
  if (
    name.includes("темп") ||
    name.includes("temp") ||
    name.includes("температура")
  )
    return <FaThermometerHalf className="text-sm" />;
  if (name.includes("давл") || name.includes("pressure"))
    return <FaCompress className="text-sm" />;
  if (name.includes("уров") || name.includes("level"))
    return <FaWater className="text-sm" />;
  if (name.includes("расход") || name.includes("flow"))
    return <FaOilCan className="text-sm" />;
  if (
    name.includes("скорость") ||
    name.includes("скорость") ||
    name.includes("rate")
  )
    return <FaTachometerAlt className="text-sm" />;
  if (name.includes("глубин") || name.includes("depth"))
    return <FaRuler className="text-sm" />;
  if (name.includes("оборот") || name.includes("rpm"))
    return <FaTachometerAlt className="text-sm" />;
  if (name.includes("газ") || name.includes("gas"))
    return <FaGripfire className="text-sm" />;
  if (name.includes("объем") || name.includes("volume"))
    return <FaMountain className="text-sm" />;
  return <FaChartLine className="text-sm" />;
};

// Функция для получения единицы измерения
const getUnit = (paramName: string): string => {
  const normalizedParam = paramName
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-zа-я_]/g, "");

  return UNIT_MAP[normalizedParam] || UNIT_MAP[paramName.toLowerCase()] || "";
};

const AnomalyModal: React.FC<AnomalyModalProps> = ({
  isModalOpen,
  setIsModalOpen,
  anomalyInfo,
  rigId,
  method,
  threshold,
  windowSize, // Добавляем windowSize
  onDoNotShowAgain,
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const itemsPerPage = 5;

  useEffect(() => {
    if (isModalOpen) {
      setCurrentPage(0);
    }
  }, [isModalOpen]);

  const totalPages = Math.ceil(anomalyInfo.length / itemsPerPage);
  const displayedAnomalies = anomalyInfo.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage,
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        rig_id: rigId,
        method: method.toLowerCase(),
        window_size: windowSize, // Используем переданный windowSize
        threshold: threshold,
        anomalies: anomalyInfo.map((a) => ({
          param: a.param,
          timestamp: a.timestamp,
          value: a.value,
        })),
      };
      await api.saveAnomalies(payload);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (e) {
      alert("Ошибка сохранения в БД");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setCurrentPage(0);
  };

  const handleDoNotShowAgain = () => {
    onDoNotShowAgain();
    handleClose();
  };

  return (
    <Modal
      ariaHideApp={false}
      isOpen={isModalOpen}
      onRequestClose={handleClose}
      style={{
        overlay: {
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
        content: {
          position: "relative",
          inset: "auto",
          border: "none",
          background: "transparent",
          padding: 0,
          width: "auto",
          maxWidth: "90vw",
          overflow: "visible",
        },
      }}
    >
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden border border-red-100 animate-fadeIn">
        <div className="h-2 bg-gradient-to-r from-red-500 via-red-400 to-red-500" />

        <div className="px-6 py-5 border-b border-red-100 bg-gradient-to-r from-red-50 to-white">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-100 rounded-xl">
              <FaExclamationTriangle className="text-3xl text-red-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-red-700">
                Обнаружена аномалия
              </h2>
              <p className="text-sm text-red-500 flex items-center gap-2 mt-0.5">
                <span className="inline-block w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                Метод: {method} • Порог: {threshold} • Окно: {windowSize}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-red-100 rounded-lg transition-colors"
            >
              <FaTimes className="text-xl text-red-400 hover:text-red-600" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 text-slate-600">
              <FaChartLine className="text-blue-500" />
              <span className="text-sm font-medium">Всего аномалий:</span>
            </div>
            <span className="text-2xl font-bold text-red-600">
              {anomalyInfo.length}
            </span>
          </div>

          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-4 max-h-96 overflow-y-auto">
            {displayedAnomalies.length > 0 ? (
              <ul className="space-y-3">
                {displayedAnomalies.map((info, index) => {
                  const unit = getUnit(info.param);
                  const icon = getParamIcon(info.param);

                  return (
                    <li
                      key={index}
                      className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-red-50 rounded-lg text-red-500">
                          {icon}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-slate-800">
                              {formatParamName(info.param)}
                            </p>
                            <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-md">
                              {unit || "ед."}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="flex items-center gap-1 text-xs text-slate-500">
                              <FaClock className="text-slate-400" />
                              {formatDate(
                                excelSerialToJsDate(info.timestamp as number),
                              )}
                            </span>
                            <span className="px-3 py-1 bg-red-50 text-red-600 rounded-md font-mono text-sm font-semibold">
                              {typeof info.value === "number"
                                ? info.value.toFixed(2)
                                : info.value}
                              {unit && (
                                <span className="text-xs ml-1 text-red-400">
                                  {unit}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-400">Нет аномалий для отображения</p>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-slate-100 p-2 rounded-lg mb-4">
              <button
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="p-2 hover:bg-white rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <FaArrowLeft className="text-slate-600" />
              </button>
              <span className="text-sm font-medium text-slate-600">
                Страница {currentPage + 1} из {totalPages}
              </span>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
                }
                disabled={currentPage === totalPages - 1}
                className="p-2 hover:bg-white rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <FaArrowRight className="text-slate-600" />
              </button>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleSave}
              disabled={isSaving || isSaved || anomalyInfo.length === 0}
              className={`w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-semibold transition-all ${
                isSaved
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isSaved ? (
                <>
                  <FaCheck className="text-lg" />
                  <span>Сохранено в базу данных</span>
                </>
              ) : (
                <>
                  <FaDatabase
                    className={`text-lg ${isSaving ? "animate-spin" : ""}`}
                  />
                  <span>
                    {isSaving ? "Сохранение..." : "Сохранить аномалии в БД"}
                  </span>
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleClose}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-100 hover:bg-slate-200 rounded-xl font-medium text-slate-700 transition-colors"
              >
                <FaTimes className="text-lg" />
                <span>Закрыть</span>
              </button>
              <button
                onClick={handleDoNotShowAgain}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 hover:bg-slate-900 rounded-xl font-medium text-white transition-colors"
              >
                <FaEyeSlash className="text-lg" />
                <span>Не показывать</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AnomalyModal;
