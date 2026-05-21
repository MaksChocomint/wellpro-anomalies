import { DynamicSensorData } from "@/types/types";

export const formatDate = (date: Date | null) => {
  if (!date) return "N/A";
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Europe/Moscow",
  });
};

export const excelSerialToJsDate = (serial: number | string): Date => {
  const num =
    typeof serial === "string" ? parseFloat(serial.replace(",", ".")) : serial;
  const daysBefore1970 = 25569;
  const msInDay = 86400000;
  const unixMilliseconds = (num - daysBefore1970) * msInDay;
  const date = new Date(unixMilliseconds);
  date.setDate(date.getDate() + 1);

  return date;
};

export const formatParamName = (name: string): string => {
  // Regex для поиска чисел в конце строки
  const numberMatch = name.match(/(\d+)$/);

  let formattedName = name;
  let numberPart = "";

  if (numberMatch) {
    // Если число найдено, отделяем его
    numberPart = numberMatch[0];
    formattedName = name.slice(0, -numberPart.length);
  }

  // Разбиваем оставшуюся часть строки по символу "_"
  const parts = formattedName.split("_");

  // Форматируем слова: первое с заглавной, остальные с маленькой буквы
  const formattedWords = parts
    .map((part, index) => {
      if (index === 0) {
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }
      return part.toLowerCase();
    })
    .join(" ");

  // Если была найдена цифра, добавляем ее через пробел
  if (numberPart) {
    return formattedWords + " " + numberPart;
  }

  return formattedWords;
};

// 💡 Новая функция для выборки меток времени
export const getSparseTimeTicks = (
  data: DynamicSensorData[],
  count: number
): [number[], string[]] => {
  if (data.length === 0) return [[], []];

  const tickValues = [];
  const tickTexts = [];
  const step = Math.max(1, Math.floor(data.length / count));

  for (let i = 0; i < data.length; i += step) {
    const d = data[i];
    const excelSerial = d["время"] as number;
    const jsDate = excelSerialToJsDate(excelSerial);
    tickValues.push(excelSerial);
    tickTexts.push(jsDate.toLocaleTimeString("ru-RU"));
  } // Убедитесь, что последняя точка всегда включена

  if (
    tickValues.length === 0 ||
    tickValues[tickValues.length - 1] !== data[data.length - 1]["время"]
  ) {
    const lastDataPoint = data[data.length - 1];
    tickValues.push(lastDataPoint["время"] as number);
    tickTexts.push(
      excelSerialToJsDate(lastDataPoint["время"] as number).toLocaleTimeString(
        "ru-RU"
      )
    );
  } // Ограничиваем количество меток до 'count'

  if (tickValues.length > count) {
    const newTickValues = [];
    const newTickTexts = [];
    const newStep = Math.max(1, Math.floor(tickValues.length / count));
    for (let i = 0; i < tickValues.length; i += newStep) {
      newTickValues.push(tickValues[i]);
      newTickTexts.push(tickTexts[i]);
    } // Убедимся, что последняя метка всегда есть
    if (
      newTickValues[newTickValues.length - 1] !==
      tickValues[tickValues.length - 1]
    ) {
      newTickValues.push(tickValues[tickValues.length - 1]);
      newTickTexts.push(tickTexts[tickTexts.length - 1]);
    }
    return [newTickValues, newTickTexts];
  }

  return [tickValues, tickTexts];
};
