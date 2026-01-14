import axios from "axios";
import { DynamicSensorData, AnomalyDetectionMethod } from "@/types/types";

interface FileAnalysisParams {
  method: AnomalyDetectionMethod;
  window_size: number;
  score_threshold: number;
}

export async function analyzeFile(
  file: File,
  params: FileAnalysisParams
): Promise<DynamicSensorData[]> {
  const formData = new FormData();
  formData.append("file", file);

  const url = `http://127.0.0.1:8000/api/v1/analyze/file?method=${params.method}&window_size=${params.window_size}&score_threshold=${params.score_threshold}`;

  const response = await axios.post(url, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data.data;
}

export function extractFlightStartTimeFromFile(
  fileContent: string
): Date | null {
  const lines = fileContent.split(/\r?\n/);
  const flightStartLine = lines[0];
  const timeMatch = flightStartLine.match(
    /(\d{1,2}) (.*) (\d{4})г. (\d{1,2}):(\d{1,2})/
  );

  if (!timeMatch) {
    return null;
  }

  const [, day, monthStr, year, hour, minute] = timeMatch;
  const monthIndex = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ].indexOf(monthStr);

  if (monthIndex === -1) {
    return null;
  }

  return new Date(
    parseInt(year),
    monthIndex,
    parseInt(day),
    parseInt(hour),
    parseInt(minute)
  );
}
