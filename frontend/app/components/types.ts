// components/types.ts

// Anomaly Detection Methods
export type AnomalyDetectionMethod = "FFT" | "Z_score" | "LOF";

// Type for storing anomaly information
export type AnomalyInfo = {
  param: string;
  timestamp: number | string;
};
