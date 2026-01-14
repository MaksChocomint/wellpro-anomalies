import { useCallback, useRef } from "react";
import { AnomalyDetectionMethod, Thresholds } from "@/types/types";

interface UseThresholdsProps {
  isBackendConnected: boolean;
  onParametersChange?: () => void;
}

const DEFAULT_THRESHOLDS: Thresholds = {
  Z_score: 3,
  LOF: 25,
  FFT: 0.5,
  AMMAD: 0.7,
  FFT_WINDOW_SIZE: 64,
  Z_SCORE_WINDOW_SIZE: 50,
  LOF_WINDOW_SIZE: 50,
  AMMAD_WINDOW_SIZE: 64,
};

export function useThresholds({
  isBackendConnected,
  onParametersChange,
}: UseThresholdsProps) {
  const thresholdsRef = useRef<Thresholds>(DEFAULT_THRESHOLDS);

  const handleThresholdChange = useCallback(
    (key: keyof Thresholds, value: number | string) => {
      const numericValue =
        typeof value === "string" ? parseFloat(value) : value;
      if (!isNaN(numericValue) && numericValue >= 0) {
        thresholdsRef.current = {
          ...thresholdsRef.current,
          [key]: numericValue,
        };

        if (isBackendConnected && onParametersChange) {
          setTimeout(() => {
            onParametersChange();
          }, 100);
        }
      }
    },
    [isBackendConnected, onParametersChange]
  );

  const getThresholdValue = (key: keyof Thresholds): number => {
    return thresholdsRef.current[key] ?? 0;
  };

  const buildMessageForMethod = (method: AnomalyDetectionMethod): any => {
    const message: any = { method: method.toLowerCase() };

    switch (method) {
      case "FFT":
        message.window_size = thresholdsRef.current.FFT_WINDOW_SIZE;
        message.score_threshold = thresholdsRef.current.FFT;
        message.FFT = thresholdsRef.current.FFT;
        break;
      case "Z_score":
        message.window_size = thresholdsRef.current.Z_SCORE_WINDOW_SIZE;
        message.score_threshold = thresholdsRef.current.Z_score;
        message.Z_score = thresholdsRef.current.Z_score;
        break;
      case "LOF":
        message.window_size = thresholdsRef.current.LOF_WINDOW_SIZE;
        message.score_threshold = thresholdsRef.current.LOF;
        message.LOF = thresholdsRef.current.LOF;
        break;
      case "AMMAD":
        message.window_size = thresholdsRef.current.AMMAD_WINDOW_SIZE;
        message.score_threshold = thresholdsRef.current.AMMAD;
        message.AMMAD = thresholdsRef.current.AMMAD;
        break;
    }

    return message;
  };

  const getAllThresholds = (): Thresholds => {
    return { ...thresholdsRef.current };
  };

  const resetToDefaults = () => {
    thresholdsRef.current = { ...DEFAULT_THRESHOLDS };
  };

  return {
    thresholdsRef,
    handleThresholdChange,
    getThresholdValue,
    buildMessageForMethod,
    getAllThresholds,
    resetToDefaults,
    DEFAULT_THRESHOLDS,
  };
}
