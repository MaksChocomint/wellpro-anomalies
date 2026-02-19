import axios from "axios";
import { DynamicSensorData, AnomalyDetectionMethod } from "@/types/types";

interface FileAnalysisParams {
  method: AnomalyDetectionMethod;
  window_size: number;
  score_threshold: number;
}

export async function analyzeFile(
  file: File,
  params: FileAnalysisParams,
): Promise<DynamicSensorData[]> {
  const formData = new FormData();
  formData.append("file", file);

  // Для AMMAD метода используем стандартные параметры
  const methodParam = params.method.toLowerCase();
  const windowSize =
    params.window_size ||
    (methodParam === "ammad"
      ? 32
      : methodParam === "fft"
        ? 64
        : methodParam === "z_score"
          ? 50
          : 50);

  const scoreThreshold =
    params.score_threshold ||
    (methodParam === "ammad"
      ? 0.7
      : methodParam === "fft"
        ? 0.5
        : methodParam === "z_score"
          ? 3
          : 25);

  const url = `http://127.0.0.1:8000/api/v1/analyze/file?method=${methodParam}&window_size=${windowSize}&score_threshold=${scoreThreshold}`;

  try {
    const response = await axios.post(url, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 3000000,
    });

    if (response.data && response.data.data) {
      return response.data.data as DynamicSensorData[];
    } else {
      throw new Error("Неверный формат ответа от сервера");
    }
  } catch (error) {
    console.error("Ошибка анализа файла:", error);
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
