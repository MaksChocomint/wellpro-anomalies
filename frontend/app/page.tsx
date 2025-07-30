"use client"; // Указывает Next.js, что это клиентский компонент

import { useState, useEffect, useRef, useCallback } from "react";
import Plot from "react-plotly.js"; // Импорт компонента Plotly для React

// Интерфейс для данных датчика
// Определяет структуру объекта данных, которые мы ожидаем от датчиков
interface SensorData {
  timestamp: number; // Временная метка данных (Unix timestamp)
  pressure: number; // Давление в psi
  temperature: number; // Температура в °C
  rpm: number; // Обороты в минуту
  torque: number; // Крутящий момент в ft-lb
  flowRate: number; // Расход ПЖ на входе в gpm
  depth: number; // Глубина в метрах

  // Дополнительные параметры, основанные на вашем скриншоте
  weightOnHook: number; // Вес на крюке (например, в кг)
  pumpStrokes1: number; // Ходы насоса-1 (например, в spm - strokes per minute)
  pumpStrokes2: number; // Ходы насоса-2 (например, в spm)
  level1: number; // Уровень-1 (например, в метрах или %)
  level2: number; // Уровень-2
  level3: number; // Уровень-3
  level4: number; // Уровень-4
  level5: number; // Уровень-5
  level6: number; // Уровень-6
  blockPosition: number; // Положение тальблока (например, в метрах)
  mudVolumeInTanks: number; // Объем ПЖ в емкостях (например, в литрах)
  weightOnBit: number; // Нагрузка на долото (например, в кг)
  flowRateOutlet: number; // Расход ПЖ на выходе (например, в gpm)
  drillStringVelocity: number; // Скорость спуска/подъема колонны (например, в м/с)
  mechanicalSpeed: number; // Скорость механическая (например, в м/ч)
  drillingSpeed: number; // Скорость бурения (например, в м/ч)
  methaneAbs: number; // Метан абсолютный (%)
  propaneAbs: number; // Пропан абсолютный (%)
  butaneAbs: number; // Бутан абсолютный (%)
  pentaneAbs: number; // Пентан абсолютный (%)
  totalChromeGases: number; // Сумма хроматографических газов (%)
  methaneRel: number; // Метан относительный (%)
  ethaneRel: number; // Этан относительный (%)
  propaneRel: number; // Пропан относительный (%)
  butaneRel: number; // Бутан относительный (%)
  pentaneRel: number; // Пентан относительный (%)
  integratedGasTotal: number; // Встроенный газ, суммарный (%)
  maximumGas: number; // Максимальный газ (%)
  totalStringWeight: number; // Общий вес колонны (например, в кг)
  stands: number; // Количество свечей (штук)
  mudVolumeInActiveTanks: number; // Объем ПЖ в активных емкостях (л)
  totalMudVolume: number; // Общий объем раствора (л)
  depthAboveBottom: number; // Глубина над забоем (м)
  volumeInTopUp: number; // Объем в доливе (л)
  reamingSpeed: number; // Скорость проработки (м/ч)
  blockSpeed: number; // Скорость тальблока (м/с)
}

// Константы для WebSocket URL и максимального количества точек данных на графике
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
const MAX_DATA_POINTS = 300; // Максимальное количество точек на графике

export default function Home() {
  // Состояние для хранения живых данных датчиков
  const [liveData, setLiveData] = useState<SensorData[]>([]);
  // Состояние для индикации обнаружения аномалии
  const [anomalyDetected, setAnomalyDetected] = useState<boolean>(false);
  // Состояние для хранения временной метки последней обнаруженной аномалии
  const [lastAnomalyTimestamp, setLastAnomalyTimestamp] = useState<
    number | null
  >(null);
  // Состояние для индикации подключения к бэкенду WebSocket
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(false);

  // useRef для ссылки на объект WebSocket, чтобы избежать пересоздания при рендерах
  const wsRef = useRef<WebSocket | null>(null);
  // useRef для ссылки на интервал симуляции данных
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Состояние для управления видимостью каждого графика
  // По умолчанию некоторые графики включены, остальные выключены
  const [graphVisibility, setGraphVisibility] = useState({
    pressure: true,
    temperature: true,
    rpm: true,
    torque: true,
    flowRate: true,
    depth: true,
    weightOnHook: true,
    pumpStrokes1: false,
    pumpStrokes2: false,
    level1: false,
    level2: false,
    level3: false,
    level4: false,
    level5: false,
    level6: false,
    blockPosition: false,
    mudVolumeInTanks: false,
    weightOnBit: false,
    flowRateOutlet: false,
    drillStringVelocity: false,
    mechanicalSpeed: false,
    drillingSpeed: false,
    methaneAbs: false,
    propaneAbs: false,
    butaneAbs: false,
    pentaneAbs: false,
    totalChromeGases: false,
    methaneRel: false,
    ethaneRel: false,
    propaneRel: false,
    butaneRel: false,
    pentaneRel: false,
    integratedGasTotal: false,
    maximumGas: false,
    totalStringWeight: false,
    stands: false,
    mudVolumeInActiveTanks: false,
    totalMudVolume: false,
    depthAboveBottom: false,
    volumeInTopUp: false,
    reamingSpeed: false,
    blockSpeed: false,
  });

  // Параметры для обнаружения аномалий (Z-score метод для давления)
  const ANOMALY_THRESHOLD = 3; // Порог Z-score: если Z-score превышает это значение, считается аномалией
  const WINDOW_SIZE = 50; // Размер окна для расчета скользящего среднего и стандартного отклонения

  // --- Функция для обнаружения аномалий (Z-score) ---
  // Обернута в useCallback для мемоизации и предотвращения лишних ре-рендеров
  // Эта функция должна быть определена ДО simulateLocalData
  const detectAnomaly = useCallback(
    (data: SensorData[]) => {
      // Если данных недостаточно для формирования окна, аномалию не определяем
      if (data.length < WINDOW_SIZE) return false;

      // Извлекаем значения давления из последнего окна данных
      const pressures = data.slice(-WINDOW_SIZE).map((d) => d.pressure);
      // Вычисляем сумму и среднее значение давления
      const sum = pressures.reduce((a, b) => a + b, 0);
      const mean = sum / pressures.length;
      // Вычисляем сумму квадратов отклонений для стандартного отклонения
      const sqDiffs = pressures.map((p) => (p - mean) * (p - mean));
      // Вычисляем дисперсию и стандартное отклонение
      const variance = sqDiffs.reduce((a, b) => a + b, 0) / pressures.length;
      const stdDev = Math.sqrt(variance);

      // Если стандартное отклонение равно нулю (нет вариаций в данных), аномалий нет
      if (stdDev === 0) return false;

      // Получаем последнее значение давления и вычисляем Z-score
      const latestPressure = data[data.length - 1].pressure;
      const zScore = Math.abs((latestPressure - mean) / stdDev); // Абсолютное значение Z-score

      // Возвращаем true, если Z-score превышает пороговое значение
      return zScore > ANOMALY_THRESHOLD;
    },
    [ANOMALY_THRESHOLD, WINDOW_SIZE]
  ); // Зависимости useCallback: константы аномалий

  // --- Функция симуляции данных (для автономного режима) ---
  // Обернута в useCallback для мемоизации
  const simulateLocalData = useCallback(() => {
    setLiveData((prevData) => {
      // Получаем последнее значение данных или начальные значения, если данных нет
      const lastData =
        prevData.length > 0
          ? prevData[prevData.length - 1]
          : {
              timestamp: Date.now() - 500, // Начальная временная метка
              pressure: 500,
              temperature: 150,
              rpm: 120,
              torque: 3000,
              flowRate: 50,
              depth: 0,
              // Начальные значения для новых параметров
              weightOnHook: 10000,
              pumpStrokes1: 10,
              pumpStrokes2: 12,
              level1: 50,
              level2: 60,
              level3: 70,
              level4: 80,
              level5: 90,
              level6: 100,
              blockPosition: 10,
              mudVolumeInTanks: 5000,
              weightOnBit: 5000,
              flowRateOutlet: 45,
              drillStringVelocity: 1,
              mechanicalSpeed: 10,
              drillingSpeed: 5,
              methaneAbs: 0.1,
              propaneAbs: 0.01,
              butaneAbs: 0.005,
              pentaneAbs: 0.002,
              totalChromeGases: 0.117,
              methaneRel: 50,
              ethaneRel: 20,
              propaneRel: 10,
              butaneRel: 5,
              pentaneRel: 2,
              integratedGasTotal: 0.87,
              maximumGas: 1.5,
              totalStringWeight: 20000,
              stands: 10,
              mudVolumeInActiveTanks: 4000,
              totalMudVolume: 9000,
              depthAboveBottom: 20,
              volumeInTopUp: 100,
              reamingSpeed: 0.5,
              blockSpeed: 0.2,
            };

      // Генерируем новые данные, добавляя небольшие случайные изменения к предыдущим значениям
      const newData: SensorData = {
        timestamp: Date.now(),
        pressure: lastData.pressure + (Math.random() - 0.5) * 10,
        temperature: lastData.temperature + (Math.random() - 0.5) * 2,
        rpm: lastData.rpm + (Math.random() - 0.5) * 5,
        torque: lastData.torque + (Math.random() - 0.5) * 50,
        flowRate: lastData.flowRate + (Math.random() - 0.5) * 1,
        depth: lastData.depth + 0.1, // Глубина увеличивается
        // Генерация данных для новых параметров (примерные диапазоны)
        weightOnHook: lastData.weightOnHook + (Math.random() - 0.5) * 50,
        pumpStrokes1: lastData.pumpStrokes1 + (Math.random() - 0.5) * 0.5,
        pumpStrokes2: lastData.pumpStrokes2 + (Math.random() - 0.5) * 0.5,
        level1: lastData.level1 + (Math.random() - 0.5) * 0.1,
        level2: lastData.level2 + (Math.random() - 0.5) * 0.1,
        level3: lastData.level3 + (Math.random() - 0.5) * 0.1,
        level4: lastData.level4 + (Math.random() - 0.5) * 0.1,
        level5: lastData.level5 + (Math.random() - 0.5) * 0.1,
        level6: lastData.level6 + (Math.random() - 0.5) * 0.1,
        blockPosition: lastData.blockPosition + (Math.random() - 0.5) * 0.05,
        mudVolumeInTanks:
          lastData.mudVolumeInTanks + (Math.random() - 0.5) * 50,
        weightOnBit: lastData.weightOnBit + (Math.random() - 0.5) * 20,
        flowRateOutlet: lastData.flowRateOutlet + (Math.random() - 0.5) * 1,
        drillStringVelocity:
          lastData.drillStringVelocity + (Math.random() - 0.5) * 0.01,
        mechanicalSpeed: lastData.mechanicalSpeed + (Math.random() - 0.5) * 0.1,
        drillingSpeed: lastData.drillingSpeed + (Math.random() - 0.5) * 0.05,
        methaneAbs: lastData.methaneAbs + (Math.random() - 0.5) * 0.01,
        propaneAbs: lastData.propaneAbs + (Math.random() - 0.5) * 0.001,
        butaneAbs: lastData.butaneAbs + (Math.random() - 0.5) * 0.0005,
        pentaneAbs: lastData.pentaneAbs + (Math.random() - 0.5) * 0.0002,
        totalChromeGases:
          lastData.totalChromeGases + (Math.random() - 0.5) * 0.01,
        methaneRel: lastData.methaneRel + (Math.random() - 0.5) * 0.1,
        ethaneRel: lastData.ethaneRel + (Math.random() - 0.5) * 0.05,
        propaneRel: lastData.propaneRel + (Math.random() - 0.5) * 0.02,
        butaneRel: lastData.butaneRel + (Math.random() - 0.5) * 0.01,
        pentaneRel: lastData.pentaneRel + (Math.random() - 0.5) * 0.005,
        integratedGasTotal:
          lastData.integratedGasTotal + (Math.random() - 0.5) * 0.05,
        maximumGas: lastData.maximumGas + (Math.random() - 0.5) * 0.1,
        totalStringWeight:
          lastData.totalStringWeight + (Math.random() - 0.5) * 100,
        stands: lastData.stands + (Math.random() - 0.5) * 0.01,
        mudVolumeInActiveTanks:
          lastData.mudVolumeInActiveTanks + (Math.random() - 0.5) * 20,
        totalMudVolume: lastData.totalMudVolume + (Math.random() - 0.5) * 50,
        depthAboveBottom:
          lastData.depthAboveBottom + (Math.random() - 0.5) * 0.02,
        volumeInTopUp: lastData.volumeInTopUp + (Math.random() - 0.5) * 1,
        reamingSpeed: lastData.reamingSpeed + (Math.random() - 0.5) * 0.01,
        blockSpeed: lastData.blockSpeed + (Math.random() - 0.5) * 0.005,
      };

      // Ограничиваем значения некоторых параметров, чтобы они не выходили за разумные пределы
      newData.pressure = Math.max(100, Math.min(1000, newData.pressure));
      newData.temperature = Math.max(50, Math.min(200, newData.temperature));
      newData.rpm = Math.max(10, Math.min(200, newData.rpm));
      newData.weightOnHook = Math.max(0, Math.min(50000, newData.weightOnHook));
      newData.depth = Math.max(0, newData.depth); // Глубина только растет или остается
      newData.drillingSpeed = Math.max(0, newData.drillingSpeed); // Скорость бурения не может быть отрицательной

      // Обновляем массив данных, сохраняя только последние MAX_DATA_POINTS точек
      const updatedData = [...prevData, newData].slice(-MAX_DATA_POINTS);

      // Проверяем аномалии на основе обновленных данных
      const anomaly = detectAnomaly(updatedData);
      setAnomalyDetected(anomaly); // Обновляем состояние аномалии
      if (anomaly) {
        setLastAnomalyTimestamp(newData.timestamp); // Записываем временную метку аномалии
      } else if (lastAnomalyTimestamp !== null) {
        setLastAnomalyTimestamp(null); // Сбрасываем, если аномалии нет
      }

      return updatedData;
    });
  }, [detectAnomaly, lastAnomalyTimestamp]); // Зависимости useCallback: detectAnomaly и lastAnomalyTimestamp

  // --- Эффект для WebSocket-соединения и запуска/остановки симуляции ---
  useEffect(() => {
    // Функция для запуска локальной симуляции данных
    const startLocalSimulation = () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current); // Очищаем предыдущий интервал, если есть
      }
      // Запускаем симуляцию каждые 500 мс
      simulationIntervalRef.current = setInterval(simulateLocalData, 500);
      setIsBackendConnected(false); // Указываем, что бэкенд не подключен
      console.log("Starting local data simulation.");
    };

    // Функция для остановки локальной симуляции данных
    const stopLocalSimulation = () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      console.log("Stopping local data simulation.");
    };

    // Начинаем с локальной симуляции по умолчанию при первом монтировании компонента
    startLocalSimulation();

    // Функция для попытки подключения к WebSocket серверу
    const connectWebSocket = () => {
      // Если WebSocket уже подключен или пытается подключиться, выходим
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      // Создаем новый объект WebSocket
      wsRef.current = new WebSocket(WS_URL);

      // Обработчик события успешного подключения WebSocket
      wsRef.current.onopen = () => {
        console.log("Connected to WebSocket server");
        stopLocalSimulation(); // Останавливаем локальную симуляцию при успешном подключении к бэкенду
        setIsBackendConnected(true); // Устанавливаем статус подключения к бэкенду
        setLiveData([]); // Очищаем текущие данные, чтобы начать с данных от бэкенда
        setAnomalyDetected(false); // Сбрасываем статус аномалии
        setLastAnomalyTimestamp(null); // Сбрасываем временную метку аномалии
      };

      // Обработчик события получения сообщения от WebSocket
      wsRef.current.onmessage = (event) => {
        try {
          // Парсим полученные данные как SensorData
          const newData: SensorData = JSON.parse(event.data);
          setLiveData((prevData) => {
            // Добавляем новые данные и обрезаем массив до MAX_DATA_POINTS
            const updatedData = [...prevData, newData].slice(-MAX_DATA_POINTS);
            // Проверяем аномалии на основе обновленных данных
            const anomaly = detectAnomaly(updatedData);
            setAnomalyDetected(anomaly);
            if (anomaly) {
              setLastAnomalyTimestamp(newData.timestamp);
            } else if (lastAnomalyTimestamp !== null) {
              setLastAnomalyTimestamp(null);
            }
            return updatedData;
          });
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      // Обработчик события закрытия WebSocket-соединения
      wsRef.current.onclose = () => {
        console.log(
          "Disconnected from WebSocket server. Attempting to reconnect..."
        );
        setIsBackendConnected(false); // Устанавливаем статус отключения от бэкенда
        startLocalSimulation(); // Перезапускаем локальную симуляцию
        setTimeout(connectWebSocket, 3000); // Попытка переподключения через 3 секунды
      };

      // Обработчик ошибок WebSocket
      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        if (wsRef.current) {
          wsRef.current.close(); // Закрываем соединение, чтобы вызвать onclose
        }
      };
    };

    // Запускаем первую попытку подключения к WebSocket при монтировании компонента
    connectWebSocket();

    // Функция очистки при размонтировании компонента
    return () => {
      stopLocalSimulation(); // Очищаем интервал симуляции
      if (wsRef.current) {
        wsRef.current.close(); // Закрываем WebSocket-соединение
      }
    };
  }, [simulateLocalData, detectAnomaly, lastAnomalyTimestamp]); // Зависимости useEffect

  // Подготовка временных меток для оси X графиков
  const timeStamps = liveData.map((d) =>
    new Date(d.timestamp).toLocaleTimeString()
  );

  // Вспомогательная функция для получения массива значений конкретного параметра
  const getPlotData = (paramName: keyof SensorData) =>
    liveData.map((d) => d[paramName]);

  // Динамические аннотации и фигуры для графиков (для обозначения аномалий)
  const anomalyAnnotation = lastAnomalyTimestamp
    ? [
        {
          x: new Date(lastAnomalyTimestamp).toLocaleTimeString(), // Позиция аномалии по времени
          xref: "x", // Ссылка на ось X
          y: 0,
          yref: "paper", // Относительно высоты графика (0-1)
          text: "АНОМАЛИЯ!", // Текст аннотации
          showarrow: true, // Показать стрелку
          arrowhead: 7, // Стиль стрелки
          ax: 0, // Смещение стрелки по X
          ay: -40, // Смещение стрелки по Y
          font: {
            color: "red",
            size: 14,
            weight: "bold",
          },
        },
      ]
    : []; // Если аномалии нет, массив пустой

  const anomalyShape = lastAnomalyTimestamp
    ? [
        {
          type: "line", // Тип фигуры - линия
          x0: new Date(lastAnomalyTimestamp).toLocaleTimeString(), // Начало линии по X
          y0: 0, // Начало линии по Y (снизу графика)
          x1: new Date(lastAnomalyTimestamp).toLocaleTimeString(), // Конец линии по X
          y1: 1, // Конец линии по Y (сверху графика)
          xref: "x", // Ссылка на ось X
          yref: "paper", // Относительно высоты графика (0-1)
          line: {
            color: "red",
            width: 2,
            dash: "dashdot", // Стиль линии (пунктир с точкой)
          },
        },
      ]
    : []; // Если аномалии нет, массив пустой

  // Обработчик изменения чекбокса видимости графика
  const handleVisibilityChange = (param: keyof typeof graphVisibility) => {
    setGraphVisibility((prev) => ({
      ...prev, // Копируем предыдущее состояние
      [param]: !prev[param], // Переключаем видимость для выбранного параметра
    }));
  };

  // Метаданные для каждого графика: ключ, заголовок, имя для легенды, цвет линии
  // Это позволяет легко добавлять новые графики и управлять ими
  const plotConfigs = [
    {
      key: "pressure",
      title: "Давление (psi)",
      name: "Давление",
      color: "blue",
    },
    {
      key: "temperature",
      title: "Температура (°C)",
      name: "Температура",
      color: "orange",
    },
    { key: "rpm", title: "RPM", name: "RPM", color: "green" },
    {
      key: "torque",
      title: "Крутящий Момент (ft-lb)",
      name: "Крутящий Момент",
      color: "purple",
    },
    {
      key: "flowRate",
      title: "Расход ПЖ на входе (gpm)",
      name: "Расход (вход)",
      color: "teal",
    },
    { key: "depth", title: "Глубина (м)", name: "Глубина", color: "brown" },
    {
      key: "weightOnHook",
      title: "Вес на крюке (кг)",
      name: "Вес на крюке",
      color: "darkred",
    },
    {
      key: "pumpStrokes1",
      title: "Ходы насоса-1 (ход/мин)",
      name: "Ходы насоса-1",
      color: "darkgreen",
    },
    {
      key: "pumpStrokes2",
      title: "Ходы насоса-2 (ход/мин)",
      name: "Ходы насоса-2",
      color: "darkblue",
    },
    { key: "level1", title: "Уровень-1 (%)", name: "Уровень-1", color: "gray" },
    {
      key: "level2",
      title: "Уровень-2 (%)",
      name: "Уровень-2",
      color: "lightgray",
    },
    {
      key: "level3",
      title: "Уровень-3 (%)",
      name: "Уровень-3",
      color: "black",
    },
    {
      key: "level4",
      title: "Уровень-4 (%)",
      name: "Уровень-4",
      color: "lightblue",
    },
    { key: "level5", title: "Уровень-5 (%)", name: "Уровень-5", color: "pink" },
    { key: "level6", title: "Уровень-6 (%)", name: "Уровень-6", color: "cyan" },
    {
      key: "blockPosition",
      title: "Положение тальблока (м)",
      name: "Положение тальблока",
      color: "olivedrab",
    },
    {
      key: "mudVolumeInTanks",
      title: "Объем ПЖ в емкостях (л)",
      name: "Объем ПЖ в емкостях",
      color: "saddlebrown",
    },
    {
      key: "weightOnBit",
      title: "Нагрузка на долото (кг)",
      name: "Нагрузка на долото",
      color: "indianred",
    },
    {
      key: "flowRateOutlet",
      title: "Расход ПЖ на выходе (gpm)",
      name: "Расход (выход)",
      color: "darkcyan",
    },
    {
      key: "drillStringVelocity",
      title: "Скорость сло (м/с)",
      name: "Скорость сло",
      color: "forestgreen",
    },
    {
      key: "mechanicalSpeed",
      title: "Скорость механическая (м/ч)",
      name: "Мех.скорость",
      color: "goldenrod",
    },
    {
      key: "drillingSpeed",
      title: "Скорость бурения (м/ч)",
      name: "Скорость бурения",
      color: "crimson",
    },
    {
      key: "methaneAbs",
      title: "Метан абс. (%)",
      name: "Метан абс.",
      color: "lime",
    },
    {
      key: "propaneAbs",
      title: "Пропан абс. (%)",
      name: "Пропан абс.",
      color: "darkorange",
    },
    {
      key: "butaneAbs",
      title: "Бутан абс. (%)",
      name: "Бутан абс.",
      color: "fuchsia",
    },
    {
      key: "pentaneAbs",
      title: "Пентан абс. (%)",
      name: "Пентан абс.",
      color: "gold",
    },
    {
      key: "totalChromeGases",
      title: "Сумма газов хром. (%)",
      name: "Сумма газов",
      color: "navy",
    },
    {
      key: "methaneRel",
      title: "Метан отн. (%)",
      name: "Метан отн.",
      color: "lightgreen",
    },
    {
      key: "ethaneRel",
      title: "Этан отн. (%)",
      name: "Этан отн.",
      color: "chocolate",
    },
    {
      key: "propaneRel",
      title: "Пропан отн. (%)",
      name: "Пропан отн.",
      color: "violet",
    },
    {
      key: "butaneRel",
      title: "Бутан отн. (%)",
      name: "Бутан отн.",
      color: "peru",
    },
    {
      key: "pentaneRel",
      title: "Пентан отн. (%)",
      name: "Пентан отн.",
      color: "khaki",
    },
    {
      key: "integratedGasTotal",
      title: "Встроенный газ, сум. (%)",
      name: "Встроенный газ",
      color: "indigo",
    },
    {
      key: "maximumGas",
      title: "Максимальный газ (%)",
      name: "Максимальный газ",
      color: "firebrick",
    },
    {
      key: "totalStringWeight",
      title: "Общий вес колонны (кг)",
      name: "Общий вес колонны",
      color: "sienna",
    },
    {
      key: "stands",
      title: "Свечей (шт)",
      name: "Свечей",
      color: "mediumturquoise",
    },
    {
      key: "mudVolumeInActiveTanks",
      title: "Объем ПЖ в активн.ёмкостях (л)",
      name: "Объем актив.ёмкостей",
      color: "darkslateblue",
    },
    {
      key: "totalMudVolume",
      title: "Общий V раствора (л)",
      name: "Общий V раствора",
      color: "darkolivegreen",
    },
    {
      key: "depthAboveBottom",
      title: "Глубина над забоем (м)",
      name: "Глубина над забоем",
      color: "steelblue",
    },
    {
      key: "volumeInTopUp",
      title: "Объем в доливе (л)",
      name: "Объем в доливе",
      color: "darkgoldenrod",
    },
    {
      key: "reamingSpeed",
      title: "Скорость проработки (м/ч)",
      name: "Скорость проработки",
      color: "darkmagenta",
    },
    {
      key: "blockSpeed",
      title: "Скорость тальблока (м/с)",
      name: "Скорость тальблока",
      color: "cadetblue",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
        WellPro: Мониторинг Буровых Данных
      </h1>

      {/* Блок статуса аномалии */}
      <div
        className={`p-4 mb-6 rounded-lg shadow-md text-center
                            ${
                              anomalyDetected
                                ? "bg-red-500 text-white" // Красный фон при аномалии
                                : "bg-green-500 text-white" // Зеленый фон при норме
                            }`}
      >
        <h2 className="text-2xl font-semibold">
          Статус:{" "}
          {anomalyDetected ? "АНОМАЛИЯ ОБНАРУЖЕНА!" : "Нормальная работа"}
        </h2>
        {anomalyDetected && (
          <p className="mt-2 text-lg">
            Обнаружено аномальное значение! Требуется внимание.
          </p>
        )}
      </div>

      {/* Блок статуса подключения к бэкенду/симуляции */}
      <div
        className={`p-3 mb-6 rounded-lg text-center font-medium
                            ${
                              isBackendConnected
                                ? "bg-blue-100 text-blue-800" // Синий фон, если подключен к бэкенду
                                : "bg-yellow-100 text-yellow-800" // Желтый фон, если локальная симуляция
                            }`}
      >
        Режим данных: **
        {isBackendConnected
          ? "Подключено к бэкенду (Real-time)"
          : "Локальная симуляция"}
        **
      </div>

      {/* Секция выбора параметров для отображения (чекбоксы) */}
      <div className="bg-white p-4 rounded-lg shadow-md mb-6">
        <h3 className="text-xl font-semibold mb-3 text-gray-700">
          Выбрать параметры для отображения:
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {/* Отображаем чекбокс для каждого параметра из plotConfigs */}
          {plotConfigs.map((config) => (
            <label
              key={config.key}
              className="inline-flex items-center cursor-pointer"
            >
              <input
                type="checkbox"
                className="form-checkbox h-5 w-5 text-blue-600"
                checked={
                  graphVisibility[config.key as keyof typeof graphVisibility]
                } // Состояние видимости
                onChange={() =>
                  handleVisibilityChange(
                    config.key as keyof typeof graphVisibility
                  )
                } // Обработчик изменения
              />
              <span className="ml-2 text-gray-700">
                {config.title} {/* Отображаем заголовок параметра */}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Контейнер для динамического рендеринга графиков */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Проходимся по всем конфигурациям графиков */}
        {plotConfigs.map(
          (config) =>
            // Отображаем график только если его видимость включена
            graphVisibility[config.key as keyof typeof graphVisibility] && (
              <div
                key={config.key}
                className="bg-white p-4 rounded-lg shadow-md"
              >
                <h3 className="text-xl font-semibold mb-2 text-gray-700">
                  {config.title} {/* Заголовок графика */}
                </h3>
                <Plot
                  data={[
                    {
                      x: timeStamps, // Временные метки для оси X
                      y: getPlotData(config.key as keyof SensorData), // Данные для оси Y
                      type: "scatter", // Тип графика: точечный
                      mode: "lines", // Отображение: линии
                      name: config.name as any, // Имя для легенды (приводим к any, так как Plotly ожидает string)
                      line: { color: config.color }, // Цвет линии
                    },
                  ]}
                  layout={{
                    autosize: true, // Автоматический размер графика
                    margin: { l: 40, r: 20, t: 30, b: 40 }, // Отступы
                    xaxis: { title: "Время" }, // Заголовок оси X
                    yaxis: { title: config.title }, // Заголовок оси Y
                    height: 300, // Высота графика
                    annotations:
                      config.key === "pressure" ? anomalyAnnotation : [], // Аннотации (только для давления)
                    shapes: config.key === "pressure" ? anomalyShape : [], // Фигуры (только для давления)
                  }}
                  useResizeHandler={true} // Включаем обработчик изменения размера
                  style={{ width: "100%", height: "100%" }} // Стиль для растягивания на всю ширину/высоту
                />
              </div>
            )
        )}
      </div>
    </div>
  );
}
