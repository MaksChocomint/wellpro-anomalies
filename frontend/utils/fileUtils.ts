import axios from "axios";
import { DynamicSensorData, AnomalyDetectionMethod } from "@/types/types";

interface FileAnalysisParams {
  method: AnomalyDetectionMethod;
  window_size: number;
  score_threshold: number;
}

export interface FileAnalysisProgress {
  job_id: string;
  status: string;
  message: string;
  uploaded_bytes: number;
  total_rows: number;
  processed_rows: number;
  percentage: number;
  total_anomalies: number;
  error: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
}

interface AnalyzeFileResponse {
  job_id?: string;
  data?: DynamicSensorData[];
}

export async function analyzeFile(
  file: File,
  params: FileAnalysisParams,
  jobId?: string,
): Promise<{ jobId: string; data: DynamicSensorData[] }> {
  const formData = new FormData();
  formData.append("file", file);

  // Для AMMAD метода используем стандартные параметры
  const methodParam = params.method.toLowerCase();
  const windowSize =
    params.window_size ||
    (methodParam === "ammad"
      ? 48
      : methodParam === "fft"
        ? 64
        : methodParam === "z_score"
          ? 50
          : 50);

  const scoreThreshold =
    params.score_threshold ||
    (methodParam === "ammad"
      ? 0.8
      : methodParam === "fft"
        ? 0.5
      : methodParam === "z_score"
        ? 3
        : 25);

  const queryParams = new URLSearchParams({
    method: methodParam,
    window_size: String(windowSize),
    score_threshold: String(scoreThreshold),
  });

  if (jobId) {
    queryParams.set("job_id", jobId);
  }

  const url = `http://127.0.0.1:8000/api/v1/analyze/file?${queryParams.toString()}`;

  try {
    const response = await axios.post(url, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 3000000,
    });

    const payload = response.data as AnalyzeFileResponse;
    const resolvedJobId = String(payload.job_id || jobId || "");

    if (payload && payload.data) {
      return {
        jobId: resolvedJobId,
        data: payload.data as DynamicSensorData[],
      };
    } else {
      throw new Error("Неверный формат ответа от сервера");
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Ошибка сервера: ${error.response?.status} ${
          error.response?.data?.error || error.message
        }`,
      );
    }
    throw error;
  }
}

export async function getFileAnalysisProgress(
  jobId: string,
): Promise<FileAnalysisProgress> {
  const url = `http://127.0.0.1:8000/api/v1/analyze/file-progress?job_id=${encodeURIComponent(jobId)}`;
  const response = await axios.get(url, { timeout: 10000 });
  return response.data as FileAnalysisProgress;
}

export function extractFlightStartTimeFromFile(
  fileContent: string,
): Date | null {
  const lines = fileContent.split(/\r?\n/);
  if (lines.length === 0) return null;

  const flightStartLine = lines[0];

  // Ищем дату в формате: "Начало рейса - 8 июня 2016г. 20:49"
  const timeMatch = flightStartLine.match(
    /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})г\.\s+(\d{1,2}):(\d{1,2})/,
  );

  if (!timeMatch) {
    return null;
  }

  const [, day, monthStr, year, hour, minute] = timeMatch;
  const monthMap: Record<string, number> = {
    января: 0,
    февраля: 1,
    марта: 2,
    апреля: 3,
    мая: 4,
    июня: 5,
    июля: 6,
    августа: 7,
    сентября: 8,
    октября: 9,
    ноября: 10,
    декабря: 11,
  };

  const monthIndex = monthMap[monthStr];
  if (monthIndex === undefined) {
    return null;
  }

  return new Date(
    parseInt(year),
    monthIndex,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
  );
}
