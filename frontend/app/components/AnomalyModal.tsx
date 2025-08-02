import React from "react";
import Modal from "react-modal";
import { FaExclamationTriangle, FaTimesCircle } from "react-icons/fa";

interface AnomalyModalProps {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
}

const AnomalyModal: React.FC<AnomalyModalProps> = ({
  isModalOpen,
  setIsModalOpen,
}) => {
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
        <p className="text-xl text-gray-800 text-center mb-8 leading-relaxed">
          Обнаружено критическое отклонение в данных давления.
        </p>
        <button
          onClick={() => setIsModalOpen(false)}
          className="flex items-center bg-red-700 hover:bg-red-800 text-white font-bold py-3 px-8 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
        >
          <FaTimesCircle className="mr-3 text-xl" /> Закрыть и Проверить
        </button>
      </div>
    </Modal>
  );
};

export default AnomalyModal;
