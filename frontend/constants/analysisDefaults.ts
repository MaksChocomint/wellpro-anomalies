import { Thresholds } from "@/types/types";

export const DEFAULT_Z_SCORE_THRESHOLD = 3.0;
export const DEFAULT_LOF_THRESHOLD = 25.0;
export const DEFAULT_FFT_THRESHOLD = 0.25;
export const DEFAULT_AMMAD_THRESHOLD = 0.75;

export const DEFAULT_Z_SCORE_WINDOW_SIZE = 30;
export const DEFAULT_LOF_WINDOW_SIZE = 60;
export const DEFAULT_FFT_WINDOW_SIZE = 64;
export const DEFAULT_AMMAD_WINDOW_SIZE = 32;

export const DEFAULT_THRESHOLDS: Thresholds = {
  Z_score: DEFAULT_Z_SCORE_THRESHOLD,
  LOF: DEFAULT_LOF_THRESHOLD,
  FFT: DEFAULT_FFT_THRESHOLD,
  AMMAD: DEFAULT_AMMAD_THRESHOLD,
  FFT_WINDOW_SIZE: DEFAULT_FFT_WINDOW_SIZE,
  Z_SCORE_WINDOW_SIZE: DEFAULT_Z_SCORE_WINDOW_SIZE,
  LOF_WINDOW_SIZE: DEFAULT_LOF_WINDOW_SIZE,
  AMMAD_WINDOW_SIZE: DEFAULT_AMMAD_WINDOW_SIZE,
};

export function getDefaultThresholdByKey(key: string): number {
  switch (key) {
    case "Z_score":
      return DEFAULT_Z_SCORE_THRESHOLD;
    case "LOF":
      return DEFAULT_LOF_THRESHOLD;
    case "FFT":
      return DEFAULT_FFT_THRESHOLD;
    case "AMMAD":
      return DEFAULT_AMMAD_THRESHOLD;
    case "FFT_WINDOW_SIZE":
      return DEFAULT_FFT_WINDOW_SIZE;
    case "Z_SCORE_WINDOW_SIZE":
      return DEFAULT_Z_SCORE_WINDOW_SIZE;
    case "LOF_WINDOW_SIZE":
      return DEFAULT_LOF_WINDOW_SIZE;
    case "AMMAD_WINDOW_SIZE":
      return DEFAULT_AMMAD_WINDOW_SIZE;
    default:
      return 0;
  }
}

