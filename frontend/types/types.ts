export type DynamicSensorData = Record<
  string,
  number | string | [number, boolean]
>;

// components/types.ts

// Anomaly Detection Methods
export type AnomalyDetectionMethod = "FFT" | "Z_score" | "LOF" | "AMMAD";

export interface Thresholds {
  Z_score: number;
  LOF: number;
  FFT: number;
  AMMAD: number;
  FFT_WINDOW_SIZE: number;
  Z_SCORE_WINDOW_SIZE: number;
  LOF_WINDOW_SIZE: number;
  AMMAD_WINDOW_SIZE: number;
}
// Type for storing anomaly information
export type AnomalyInfo = {
  param: string;
  timestamp: number | string;
};
