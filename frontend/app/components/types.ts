// types.ts

// Определение всех возможных параметров датчиков.
export type SensorData = {
  timestamp: number;
  pressure: number;
  temperature: number;
  rpm: number;
  torque: number;
  flowRate: number; // Расход ПЖ на входе
  depth: number;
  weightOnHook: number;
  pumpStrokes1: number;
  pumpStrokes2: number;
  level1: number;
  level2: number;
  level3: number;
  level4: number;
  level5: number;
  level6: number;
  blockPosition: number;
  mudVolumeInTanks: number;
  weightOnBit: number;
  flowRateOutlet: number;
  drillStringVelocity: number;
  mechanicalSpeed: number;
  drillingSpeed: number;
  methaneAbs: number;
  propaneAbs: number;
  butaneAbs: number;
  pentaneAbs: number;
  totalChromeGases: number;
  methaneRel: number;
  ethaneRel: number;
  propaneRel: number;
  butaneRel: number;
  pentaneRel: number;
  integratedGasTotal: number;
  maximumGas: number;
  totalStringWeight: number;
  stands: number;
  mudVolumeInActiveTanks: number;
  totalMudVolume: number;
  depthAboveBottom: number;
  volumeInTopUp: number;
  reamingSpeed: number;
  blockSpeed: number;
  // Новые параметры из изображения
  bottomHoleDepth: number; // ГЛ. забой
  instrumentDepth: number; // ГЛ. инстр.
  glDelay: number; // Задерж. ГЛ
  level7: number; // Уровень-7
  level8: number; // Уровень-8
  parameter2: number; // Параметр - 2
  volume1: number; // Объём - 1
  volume2: number; // Объём - 2
  volume3: number; // Объём - 3
  volume4: number; // Объём - 4
  volume5: number; // Объём - 5
  volume6: number; // Объём - 6
  volume7: number; // Объём - 7
  v21prov: number; // V-2-1 пров.
  v22prov: number; // V-2-2 пров.
  v31prov: number; // V-3-1 пров.
  parameter6: number; // Параметр - 6
};

// Ключи для всех параметров датчиков
export type SensorParamKey = keyof SensorData;

// Конфигурация для каждого графика, включая название и цвет
export const plotConfigs: { key: SensorParamKey; title: string; name: string; color: string }[] = [
  { key: "pressure", title: "Давление ПЖ на входе", name: "Давление (кгс/см²)", color: "#1f77b4" },
  { key: "temperature", title: "Температура на выходе", name: "Температура (°C)", color: "#ff7f0e" },
  { key: "rpm", title: "Обороты ротора", name: "Обороты (об/мин)", color: "#2ca02c" },
  { key: "torque", title: "Крутящий момент ротора", name: "Крутящий момент (Н·м)", color: "#d62728" },
  { key: "flowRate", title: "Расход ПЖ на входе", name: "Расход (л/с)", color: "#9467bd" },
  { key: "depth", title: "Глубина долота", name: "Глубина (м)", color: "#8c564b" },
  { key: "weightOnHook", title: "Вес на крюке", name: "Вес (кг)", color: "#e377c2" },
  { key: "pumpStrokes1", title: "Ходы насос. - 1", name: "Ходы насоса (ход/мин)", color: "#7f7f7f" },
  { key: "pumpStrokes2", title: "Ходы насос. - 2", name: "Ходы насоса (ход/мин)", color: "#bcbd22" },
  { key: "level1", title: "Уровень-1", name: "Уровень 1 (%)", color: "#17becf" },
  { key: "level2", title: "Уровень-2", name: "Уровень 2 (%)", color: "#aec7e8" },
  { key: "level3", title: "Уровень-3", name: "Уровень 3 (%)", color: "#ffbb78" },
  { key: "level4", title: "Уровень-4", name: "Уровень 4 (%)", color: "#98df8a" },
  { key: "level5", title: "Уровень-5", name: "Уровень 5 (%)", color: "#ff9896" },
  { key: "level6", title: "Уровень-6", name: "Уровень 6 (%)", color: "#c5b0d5" },
  { key: "blockPosition", title: "Положение тальблока", name: "Положение (м)", color: "#c49c94" },
  { key: "mudVolumeInTanks", title: "Объем ПЖ в емкостях", name: "Объем (м³)", color: "#f7b6d2" },
  { key: "weightOnBit", title: "Нагрузка на долото", name: "Нагрузка (кг)", color: "#c7c7c7" },
  { key: "flowRateOutlet", title: "Расход ПЖ на выходе", name: "Расход (л/с)", color: "#dbdb8d" },
  { key: "drillStringVelocity", title: "Скорость СПО", name: "Скорость (м/с)", color: "#9edae5" },
  { key: "mechanicalSpeed", title: "Скорость механическая", name: "Скорость (м/с)", color: "#393b79" },
  { key: "drillingSpeed", title: "Скорость бурения", name: "Скорость (м/с)", color: "#5254a3" },
  { key: "methaneAbs", title: "Метан абс.", name: "Метан (об.%)", color: "#6b6ecf" },
  { key: "propaneAbs", title: "Пропан абс.", name: "Пропан (об.%)", color: "#9c9ede" },
  { key: "butaneAbs", title: "Бутан абс.", name: "Бутан (об.%)", color: "#637939" },
  { key: "pentaneAbs", title: "Пентан абс.", name: "Пентан (об.%)", color: "#8ca252" },
  { key: "totalChromeGases", title: "Сумм. газов хром.", name: "Сумма газов (об.%)", color: "#b5cf6b" },
  { key: "methaneRel", title: "Метан отн.", name: "Метан (отн.%)", color: "#cedb9c" },
  { key: "ethaneRel", title: "Этан отн.", name: "Этан (отн.%)", color: "#8c6d31" },
  { key: "propaneRel", title: "Пропан отн.", name: "Пропан (отн.%)", color: "#bd9e39" },
  { key: "butaneRel", title: "Бутан отн.", name: "Бутан (отн.%)", color: "#e7ba52" },
  { key: "pentaneRel", title: "Пентан отн.", name: "Пентан (отн.%)", color: "#e7cb94" },
  { key: "integratedGasTotal", title: "Встроенный газ, сум.", name: "Газ сум.", color: "#843c39" },
  { key: "maximumGas", title: "Максимальный газ", name: "Макс. газ", color: "#ad494a" },
  { key: "totalStringWeight", title: "Общий вес колонны", name: "Вес (кг)", color: "#d6616b" },
  { key: "stands", title: "Свечей", name: "Свечей", color: "#e7969c" },
  { key: "mudVolumeInActiveTanks", title: "Объем ПЖ в активн.ёмкостях", name: "Объем (м³)", color: "#7b4173" },
  { key: "totalMudVolume", title: "Общий V раствора", name: "Объем (м³)", color: "#a55194" },
  { key: "depthAboveBottom", title: "Глубина над забоем", name: "Глубина (м)", color: "#ce6dbd" },
  { key: "volumeInTopUp", title: "Объём в доливе", name: "Объем (м³)", color: "#d9d9d9" },
  { key: "reamingSpeed", title: "Скорость проработки", name: "Скорость (м/с)", color: "#5b4a45" },
  { key: "blockSpeed", title: "Скорость тальблока", name: "Скорость (м/с)", color: "#8b706c" },
  { key: "bottomHoleDepth", title: "ГЛ. забой", name: "Глубина (м)", color: "#54a24b" },
  { key: "instrumentDepth", title: "ГЛ. инстр.", name: "Глубина (м)", color: "#7ec372" },
  { key: "glDelay", title: "Задерж. ГЛ", name: "Задержка (с)", color: "#a1d99b" },
  { key: "level7", title: "Уровень-7", name: "Уровень 7 (%)", color: "#6a8d9a" },
  { key: "level8", title: "Уровень-8", name: "Уровень 8 (%)", color: "#8bb6c5" },
  { key: "parameter2", title: "Параметр - 2", name: "Параметр 2", color: "#f2c7a4" },
  { key: "volume1", title: "Объём - 1", name: "Объём 1 (м³)", color: "#ff9160" },
  { key: "volume2", title: "Объём - 2", name: "Объём 2 (м³)", color: "#e86259" },
  { key: "volume3", title: "Объём - 3", name: "Объём 3 (м³)", color: "#a83e60" },
  { key: "volume4", title: "Объём - 4", name: "Объём 4 (м³)", color: "#66284f" },
  { key: "volume5", title: "Объём - 5", name: "Объём 5 (м³)", color: "#361622" },
  { key: "volume6", title: "Объём - 6", name: "Объём 6 (м³)", color: "#222222" },
  { key: "volume7", title: "Объём - 7", name: "Объём 7 (м³)", color: "#444444" },
  { key: "v21prov", title: "V-2-1 пров.", name: "V-2-1", color: "#777777" },
  { key: "v22prov", title: "V-2-2 пров.", name: "V-2-2", color: "#999999" },
  { key: "v31prov", title: "V-3-1 пров.", name: "V-3-1", color: "#bbbbbb" },
  { key: "parameter6", title: "Параметр - 6", name: "Параметр 6", color: "#dddddd" },
];
