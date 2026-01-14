// components/AnomalyModal.tsx
import React, { useState } from "react";
import Modal from "react-modal";
import {
  FaExclamationTriangle,
  FaTimesCircle,
  FaArrowLeft,
  FaArrowRight,
  FaEyeSlash, // Добавляем иконку для новой кнопки
} from "react-icons/fa";
import { AnomalyInfo } from "@/types/types";
import {
  excelSerialToJsDate,
  formatDate,
  formatParamName,
} from "@/utils/utils";

interface AnomalyModalProps {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  anomalyInfo: AnomalyInfo[];
  onDoNotShowAgain: () => void; // Добавляем новый пропс
}

const AnomalyModal: React.FC<AnomalyModalProps> = ({
  isModalOpen,
  setIsModalOpen,
  anomalyInfo,
  onDoNotShowAgain,
}) => {
  // Добавляем состояние для отслеживания текущей страницы
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 5;

  // Вычисляем общее количество страниц
  const totalPages = Math.ceil(anomalyInfo.length / itemsPerPage);

  // Получаем элементы для текущей страницы
  const startIndex = currentPage * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedAnomalies = anomalyInfo.slice(startIndex, endIndex);

  const handleNextPage = () => {
    setCurrentPage((prev) => prev + 1);
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => prev - 1);
  };

  return (
    <Modal
      isOpen={isModalOpen}
      onRequestClose={() => setIsModalOpen(false)}
      contentLabel="Anomaly Detected"
      className="Modal"
      ariaHideApp={false}
      overlayClassName="Overlay"
    >
      <div className="flex flex-col items-center justify-center p-8 bg-gradient-to-b from-red-50 to-white rounded-2xl shadow-2xl border border-red-200 max-w-md mx-auto my-20 transform scale-100 transition-transform duration-300">
        <div className="mb-6 animate-bounce">
          <FaExclamationTriangle className="text-7xl text-red-600" />
        </div>
        <h2 className="text-4xl font-bold text-red-900 mb-4">АНОМАЛИЯ!</h2>

        <p className="text-lg text-red-800 text-center mb-6 leading-relaxed font-medium">
          Обнаружено критическое отклонение в следующих параметрах:
        </p>

        <div className="w-full bg-red-100 rounded-lg p-4 mb-6 border border-red-200">
          <ul className="list-none text-base text-red-900 font-semibold space-y-2">
            {displayedAnomalies.map((info, index) => (
              <li key={index} className="flex items-start">
                <span className="text-red-600 mr-3 flex-shrink-0">
                  <FaExclamationTriangle size={14} className="mt-1" />
                </span>
                <span>
                  {formatParamName(info.param)} <br />
                  <span className="text-sm font-normal text-red-700">
                    Время:{" "}
                    {formatDate(excelSerialToJsDate(info.timestamp as number))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        {/* Элементы управления пагинацией */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between w-full mt-4 mb-8 px-4 py-3 bg-slate-100 rounded-lg">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 0}
              className="p-2 rounded-full text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <FaArrowLeft size={20} />
            </button>

            <span className="text-slate-700 font-semibold">
              {currentPage + 1} / {totalPages}
            </span>

            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages - 1}
              className="p-2 rounded-full text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <FaArrowRight size={20} />
            </button>
          </div>
        )}

        {/* Группа кнопок внизу модального окна */}
        <div className="flex flex-col sm:flex-row gap-4 mt-6 w-full justify-center">
          <button
            onClick={() => setIsModalOpen(false)}
            className="flex-1 flex items-center justify-center bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 px-8 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
          >
            <FaTimesCircle className="mr-3 text-xl" /> Закрыть
          </button>
          {/* Новая кнопка "Больше не показывать" */}
          <button
            onClick={onDoNotShowAgain}
            className="flex-1 flex items-center justify-center bg-gradient-to-r from-slate-500 to-slate-600 hover:from-slate-600 hover:to-slate-700 text-white font-bold py-3 px-8 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
          >
            <FaEyeSlash className="mr-3 text-xl" /> Скрыть
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default AnomalyModal;
