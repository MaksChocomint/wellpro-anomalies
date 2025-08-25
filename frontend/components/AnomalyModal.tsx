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
      <div className="flex flex-col items-center justify-center p-8 bg-white rounded-xl shadow-2xl border-t-8 border-red-600 max-w-md mx-auto my-20 transform scale-100 transition-transform duration-300">
        <FaExclamationTriangle className="text-red-600 text-7xl mb-5 animate-pulse" />
        <h2 className="text-4xl font-bold text-red-800 mb-3">АНОМАЛИЯ!</h2>

        <p className="text-xl text-gray-800 text-center mb-4 leading-relaxed">
          Обнаружено критическое отклонение в следующих параметрах:
        </p>

        <ul className="list-disc list-inside text-lg text-red-700 font-semibold mb-2">
          {displayedAnomalies.map((info, index) => (
            <li key={index}>
              {formatParamName(info.param)} (Время:{" "}
              {formatDate(excelSerialToJsDate(info.timestamp as number))})
            </li>
          ))}
        </ul>
        {/* Элементы управления пагинацией */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between w-full mt-4 mb-8">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 0}
              className="p-2 rounded-full text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FaArrowLeft size={20} />
            </button>

            <span className="text-gray-600">
              Страница {currentPage + 1} из {totalPages}
            </span>

            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages - 1}
              className="p-2 rounded-full text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FaArrowRight size={20} />
            </button>
          </div>
        )}

        {/* Группа кнопок внизу модального окна */}
        <div className="flex flex-col sm:flex-row gap-4 mt-4 w-full justify-center">
          <button
            onClick={() => setIsModalOpen(false)}
            className="flex-1 flex items-center justify-center bg-red-700 hover:bg-red-800 text-white font-bold py-3 px-8 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
          >
            <FaTimesCircle className="mr-3 text-xl" /> Закрыть и проверить
          </button>
          {/* Новая кнопка "Больше не показывать" */}
          <button
            onClick={onDoNotShowAgain}
            className="flex-1 flex items-center justify-center bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-8 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
          >
            <FaEyeSlash className="mr-3 text-xl" /> Больше не показывать
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default AnomalyModal;
