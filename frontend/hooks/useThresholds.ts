import { useCallback, useRef } from "react";
import { AnomalyDetectionMethod } from "@/types/types";

interface Thresholds {
  Z_score: number;
  LOF: number;
  FFT: number;
  FFT_WINDOW_SIZE: number;
  Z_SCORE_WINDOW_SIZE: number;
  LOF_WINDOW_SIZE: number;
}

interface UseThresholdsProps {
  isBackendConnected: boolean;
  onParametersChange?: () => void;
}

const DEFAULT_THRESHOLDS: Thresholds = {
  Z_score: 3,
  LOF: 25,
  FFT: 0.5,
  FFT_WINDOW_SIZE: 64,
  Z_SCORE_WINDOW_SIZE: 50,
  LOF_WINDOW_SIZE: 50,
};

export function useThresholds({
  isBackendConnected,
  onParametersChange,
}: UseThresholdsProps) {
  const thresholdsRef = useRef<Thresholds>(DEFAULT_THRESHOLDS);

  const handleThresholdChange = useCallback(
    (key: string, value: number | string) => {
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

  const getThresholdValue = (key: string): number => {
    return thresholdsRef.current[key as keyof Thresholds] ?? 0;
  };

  const buildMessageForMethod = (method: AnomalyDetectionMethod): any => {
    const message: any = { method };

    if (method === "FFT") {
      message.window_size = thresholdsRef.current.FFT_WINDOW_SIZE;
      message.score_threshold = thresholdsRef.current.FFT;
      message.FFT = thresholdsRef.current.FFT;
    } else if (method === "Z_score") {
      message.window_size = thresholdsRef.current.Z_SCORE_WINDOW_SIZE;
      message.score_threshold = thresholdsRef.current.Z_score;
      message.Z_score = thresholdsRef.current.Z_score;
    } else if (method === "LOF") {
      message.window_size = thresholdsRef.current.LOF_WINDOW_SIZE;
      message.score_threshold = thresholdsRef.current.LOF;
      message.LOF = thresholdsRef.current.LOF;
    }

    return message;
  };

  return {
    thresholdsRef,
    handleThresholdChange,
    getThresholdValue,
    buildMessageForMethod,
  };
}
