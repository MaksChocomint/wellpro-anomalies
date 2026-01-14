import { AnomalyDetectionMethod, Thresholds } from "@/types/types";

export function buildParametersMessage(
  method: AnomalyDetectionMethod,
  thresholds: Thresholds
): any {
  const message: any = { method: method.toLowerCase() };

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
  } else if (method === "AMMAD") {
    message.window_size = thresholds.AMMAD_WINDOW_SIZE;
    message.score_threshold = thresholds.AMMAD;
    message.AMMAD = thresholds.AMMAD;
  }

  return message;
}

export function getThresholdKeysForMethod(
  method: AnomalyDetectionMethod
): string[] {
  switch (method) {
    case "FFT":
      return ["FFT", "FFT_WINDOW_SIZE"];
    case "Z_score":
      return ["Z_score", "Z_SCORE_WINDOW_SIZE"];
    case "LOF":
      return ["LOF", "LOF_WINDOW_SIZE"];
    case "AMMAD":
      return ["AMMAD", "AMMAD_WINDOW_SIZE"];
    default:
      return [];
  }
}

export function getThresholdLabel(key: string): string {
  const labels: Record<string, string> = {
    Z_score: "Порог Z-score:",
    LOF: "Порог LOF:",
    FFT: "Порог FFT:",
    AMMAD: "Порог уверенности AMMAD:",
    Z_SCORE_WINDOW_SIZE: "Размер окна:",
    LOF_WINDOW_SIZE: "Размер окна:",
    FFT_WINDOW_SIZE: "Размер окна:",
    AMMAD_WINDOW_SIZE: "Размер окна анализа:",
  };
  return labels[key] || key;
}
