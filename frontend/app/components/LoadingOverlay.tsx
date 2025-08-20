import React from "react";

interface LoadingOverlayProps {
  isLoading: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isLoading,
}) => {
  if (!isLoading) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-gray-600/75 flex items-center justify-center z-50 transition-opacity duration-300">
      <div className="bg-white p-8 rounded-xl shadow-2xl text-center max-w-sm w-full">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mx-auto mb-4"></div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          Идет анализ данных...
        </h2>
        <p className="text-gray-600">
          Пожалуйста, подождите, пока мы обработаем файл.
        </p>
      </div>
    </div>
  );
};
