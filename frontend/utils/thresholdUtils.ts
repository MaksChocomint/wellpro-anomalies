import { AnomalyDetectionMethod } from "@/types/types";

interface Thresholds {
  Z_score: number;
  LOF: number;
  FFT: number;
  FFT_WINDOW_SIZE: number;
  Z_SCORE_WINDOW_SIZE: number;
  LOF_WINDOW_SIZE: number;
}

export function buildParametersMessage(
  method: AnomalyDetectionMethod,
  thresholds: Thresholds
): any {
  const message: any = { method };

  if (method === "FFT") {
    message.window_size = thresholds.FFT_WINDOW_SIZE;
    message.score_threshold = thresholds.FFT;
    message.FFT = thresholds.FFT;
  } else if (method === "Z_score") {
    message.window_size = thresholds.Z_SCORE_WINDOW_SIZE;
    message.score_threshold = thresholds.Z_score;
    message.Z_score = thresholds.Z_score;
  } else if (method === "LOF") {
    message.window_size = thresholds.LOF_WINDOW_SIZE;
    message.score_threshold = thresholds.LOF;
    message.LOF = thresholds.LOF;
  }

  return message;
}

export function getThresholdKeysForMethod(
  method: AnomalyDetectionMethod
): string[] {
  if (method === "FFT") {
    return ["FFT", "FFT_WINDOW_SIZE"];
  } else if (method === "Z_score") {
    return ["Z_score", "Z_SCORE_WINDOW_SIZE"];
  } else if (method === "LOF") {
    return ["LOF", "LOF_WINDOW_SIZE"];
  }
  return [];
}

export function getThresholdLabel(key: string): string {
  const labels: Record<string, string> = {
    Z_score: "Порог Z-score:",
    LOF: "Порог LOF:",
    FFT: "Порог FFT:",
    Z_SCORE_WINDOW_SIZE: "Размер окна:",
    LOF_WINDOW_SIZE: "Размер окна:",
    FFT_WINDOW_SIZE: "Размер окна:",
  };
  return labels[key] || key;
}
