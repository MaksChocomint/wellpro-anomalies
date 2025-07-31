"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Plot from "react-plotly.js";
import Modal from "react-modal"; // Импорт react-modal
import { FaExclamationTriangle, FaTimesCircle } from "react-icons/fa"; // Импорт иконок

interface SensorData {
  timestamp: number;
  pressure: number;
  temperature: number;
  rpm: number;
  torque: number;
  flowRate: number;
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
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
const MAX_DATA_POINTS = 300;
const FFT_WINDOW_SIZE = 128; // Размер окна для FFT (должен быть степенью 2)
const ANOMALY_FREQUENCY_THRESHOLD = 0.5; // Порог для амплитуды в частотной области
const CONSECUTIVE_ANOMALY_THRESHOLD = 5; // Количество последовательных аномалий для игнорирования модального окна

// Вспомогательная функция для выполнения быстрого преобразования Фурье (FFT)
// Очень упрощенная реализация для демонстрации.
// В реальном приложении лучше использовать готовую, более производительную библиотеку.
function fft(data: number[]): number[] {
  const N = data.length;
  if (N <= 1) return data;

  const even = fft(data.filter((_, i) => i % 2 === 0));
  const odd = fft(data.filter((_, i) => i % 2 !== 0));

  const result = new Array(N).fill(0).map(() => 0); // Initialize with numbers
  for (let k = 0; k < N / 2; k++) {
    const t = Math.exp((-2 * Math.PI * k) / N) * odd[k];
    result[k] = even[k] + t;
    result[k + N / 2] = even[k] - t;
  }
  return result;
}

export default function Home() {
  const [liveData, setLiveData] = useState<SensorData[]>([]);
  const [anomalyDetected, setAnomalyDetected] = useState<boolean>(false);
  const [anomalyTimestamps, setAnomalyTimestamps] = useState<number[]>([]); // Для хранения нескольких аномалий
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false); // Состояние для модального окна
  const [consecutiveAnomaliesCount, setConsecutiveAnomaliesCount] =
    useState<number>(0); // Счетчик последовательных аномалий

  const wsRef = useRef<WebSocket | null>(null);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [graphVisibility, setGraphVisibility] = useState<
    Record<keyof SensorData, boolean>
  >({
    pressure: true,
    temperature: true,
    rpm: true,
    torque: true,
    flowRate: true,
    depth: true,
    weightOnHook: false,
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

  // --- Функция для обнаружения аномалий (на основе FFT) ---
  const detectAnomaly = useCallback(
    (data: SensorData[]) => {
      // Для FFT необходимо достаточно данных
      if (data.length < FFT_WINDOW_SIZE) return false;

      // Берем последние FFT_WINDOW_SIZE точек давления
      const pressures = data.slice(-FFT_WINDOW_SIZE).map((d) => d.pressure);

      // Выполняем FFT. Результат - это комплексные числа.
      // Нас интересует магнитуда (амплитуда) каждой частотной компоненты.
      // Math.sqrt(real*real + imag*imag)
      const fftResult = fft(pressures.map((p) => p - pressures[0])); // Центрируем данные
      const magnitudes = fftResult.map((c) =>
        Math.sqrt(
          Math.pow(typeof c === "number" ? c : (c as any).re, 2) +
            Math.pow(typeof c === "number" ? 0 : (c as any).im, 2)
        )
      );

      // Пропускаем нулевую частоту (DC-компоненту), которая обычно высокая
      // Ищем значительные пики в частотном спектре
      const significantPeaks = magnitudes
        .slice(1, magnitudes.length / 2)
        .filter((magnitude) => magnitude > ANOMALY_FREQUENCY_THRESHOLD);

      // Если есть значительные пики, считаем это аномалией
      return significantPeaks.length > 0;
    },
    [ANOMALY_FREQUENCY_THRESHOLD, FFT_WINDOW_SIZE]
  );

  const simulateLocalData = useCallback(() => {
    setLiveData((prevData) => {
      const lastData =
        prevData.length > 0
          ? prevData[prevData.length - 1]
          : {
              timestamp: Date.now() - 500,
              pressure: 500,
              temperature: 150,
              rpm: 120,
              torque: 3000,
              flowRate: 50,
              depth: 0,
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

      const newData: SensorData = {
        timestamp: Date.now(),
        pressure: lastData.pressure + (Math.random() - 0.5) * 10,
        temperature: lastData.temperature + (Math.random() - 0.5) * 2,
        rpm: lastData.rpm + (Math.random() - 0.5) * 5,
        torque: lastData.torque + (Math.random() - 0.5) * 50,
        flowRate: lastData.flowRate + (Math.random() - 0.5) * 1,
        depth: lastData.depth + 0.1,
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

      newData.pressure = Math.max(100, Math.min(1000, newData.pressure));
      newData.temperature = Math.max(50, Math.min(200, newData.temperature));
      newData.rpm = Math.max(10, Math.min(200, newData.rpm));
      newData.weightOnHook = Math.max(0, Math.min(50000, newData.weightOnHook));
      newData.depth = Math.max(0, newData.depth);
      newData.drillingSpeed = Math.max(0, newData.drillingSpeed);

      const updatedData = [...prevData, newData].slice(-MAX_DATA_POINTS);

      const anomaly = detectAnomaly(updatedData);
      setAnomalyDetected(anomaly);

      if (anomaly) {
        setConsecutiveAnomaliesCount((prev) => prev + 1);
        // Добавляем метку только если это новая аномалия или если она не была отмечена недавно
        if (
          anomalyTimestamps.length === 0 ||
          newData.timestamp - anomalyTimestamps[anomalyTimestamps.length - 1] >
            5000 // Добавляем новую метку, если прошло более 5 секунд с предыдущей
        ) {
          setAnomalyTimestamps((prev) =>
            [...prev, newData.timestamp].slice(-MAX_DATA_POINTS / 2)
          ); // Ограничиваем количество меток
        }

        // Открываем модальное окно, только если аномалия обнаружена и не является частью длинной серии
        if (
          !isModalOpen &&
          consecutiveAnomaliesCount < CONSECUTIVE_ANOMALY_THRESHOLD
        ) {
          setIsModalOpen(true);
        }
      } else {
        setConsecutiveAnomaliesCount(0); // Сбрасываем счетчик, если аномалия исчезла
        // Закрываем модальное окно, если аномалия исчезла
        if (isModalOpen) {
          setIsModalOpen(false);
        }
      }

      return updatedData;
    });
  }, [
    detectAnomaly,
    anomalyTimestamps,
    isModalOpen,
    consecutiveAnomaliesCount,
  ]);

  useEffect(() => {
    const startLocalSimulation = () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
      simulationIntervalRef.current = setInterval(simulateLocalData, 500);
      setIsBackendConnected(false);
      console.log("Starting local data simulation.");
    };

    const stopLocalSimulation = () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      console.log("Stopping local data simulation.");
    };

    startLocalSimulation();

    const connectWebSocket = () => {
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      wsRef.current = new WebSocket(WS_URL);

      wsRef.current.onopen = () => {
        console.log("Connected to WebSocket server");
        stopLocalSimulation();
        setIsBackendConnected(true);
        setLiveData([]);
        setAnomalyDetected(false);
        setAnomalyTimestamps([]); // Сбрасываем метки при подключении к бэкенду
        setIsModalOpen(false); // Закрываем модальное окно при переподключении
        setConsecutiveAnomaliesCount(0); // Сбрасываем счетчик
      };

      wsRef.current.onmessage = (event) => {
        try {
          const newData: SensorData = JSON.parse(event.data);
          setLiveData((prevData) => {
            const updatedData = [...prevData, newData].slice(-MAX_DATA_POINTS);
            const anomaly = detectAnomaly(updatedData);
            setAnomalyDetected(anomaly);

            if (anomaly) {
              setConsecutiveAnomaliesCount((prev) => prev + 1);
              if (
                anomalyTimestamps.length === 0 ||
                newData.timestamp -
                  anomalyTimestamps[anomalyTimestamps.length - 1] >
                  5000
              ) {
                setAnomalyTimestamps((prev) =>
                  [...prev, newData.timestamp].slice(-MAX_DATA_POINTS / 2)
                );
              }

              if (
                !isModalOpen &&
                consecutiveAnomaliesCount < CONSECUTIVE_ANOMALY_THRESHOLD
              ) {
                setIsModalOpen(true);
              }
            } else {
              setConsecutiveAnomaliesCount(0);
              if (isModalOpen) {
                setIsModalOpen(false);
              }
            }
            return updatedData;
          });
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      wsRef.current.onclose = () => {
        console.log(
          "Disconnected from WebSocket server. Attempting to reconnect..."
        );
        setIsBackendConnected(false);
        startLocalSimulation();
        setTimeout(connectWebSocket, 3000);
      };

      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        if (wsRef.current) {
          wsRef.current.close();
        }
      };
    };

    connectWebSocket();

    return () => {
      stopLocalSimulation();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [
    simulateLocalData,
    detectAnomaly,
    anomalyTimestamps,
    isModalOpen,
    consecutiveAnomaliesCount,
  ]); // Добавил isModalOpen и consecutiveAnomaliesCount в зависимости

  const timeStamps = liveData.map((d) =>
    new Date(d.timestamp).toLocaleTimeString()
  );

  const getPlotData = (paramName: keyof SensorData) =>
    liveData.map((d) => d[paramName]);

  const handleVisibilityChange = (param: keyof typeof graphVisibility) => {
    setGraphVisibility((prev) => ({
      ...prev,
      [param]: !prev[param],
    }));
  };

  const handleShowAll = () => {
    setGraphVisibility(
      Object.keys(graphVisibility).reduce((acc, key) => {
        acc[key as keyof SensorData] = true;
        return acc;
      }, {} as Record<keyof SensorData, boolean>)
    );
  };

  const handleHideAll = () => {
    setGraphVisibility(
      Object.keys(graphVisibility).reduce((acc, key) => {
        acc[key as keyof SensorData] = false;
        return acc;
      }, {} as Record<keyof SensorData, boolean>)
    );
  };

  // Метаданные для каждого графика, отсортированные по группам
  const plotConfigs = [
    // Основные параметры
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
    {
      key: "flowRateOutlet",
      title: "Расход ПЖ на выходе (gpm)",
      name: "Расход (выход)",
      color: "darkcyan",
    },
    { key: "depth", title: "Глубина (м)", name: "Глубина", color: "brown" },

    // Параметры бурения
    {
      key: "weightOnHook",
      title: "Вес на крюке (кг)",
      name: "Вес на крюке",
      color: "darkred",
    },
    {
      key: "weightOnBit",
      title: "Нагрузка на долото (кг)",
      name: "Нагрузка на долото",
      color: "indianred",
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
      key: "reamingSpeed",
      title: "Скорость проработки (м/ч)",
      name: "Скорость проработки",
      color: "darkmagenta",
    },
    {
      key: "blockPosition",
      title: "Положение тальблока (м)",
      name: "Положение тальблока",
      color: "olivedrab",
    },
    {
      key: "blockSpeed",
      title: "Скорость тальблока (м/с)",
      name: "Скорость тальблока",
      color: "cadetblue",
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
      key: "depthAboveBottom",
      title: "Глубина над забоем (м)",
      name: "Глубина над забоем",
      color: "steelblue",
    },

    // Параметры насосов и уровней
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
      key: "mudVolumeInTanks",
      title: "Объем ПЖ в емкостях (л)",
      name: "Объем ПЖ в емкостях",
      color: "saddlebrown",
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
      key: "volumeInTopUp",
      title: "Объем в доливе (л)",
      name: "Объем в доливе",
      color: "darkgoldenrod",
    },

    // Газовые параметры
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
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-4xl font-extrabold text-center mb-8 text-gray-900">
        WellPro: Мониторинг Буровых Данных
      </h1>

      {/* Блок статуса аномалии */}
      <div
        className={`p-5 mb-8 rounded-xl shadow-lg text-center transition-all duration-300
                     ${
                       anomalyDetected
                         ? "bg-red-100 text-red-800 border-l-4 border-red-500"
                         : "bg-green-100 text-green-800 border-l-4 border-green-500"
                     }`}
      >
        <h2 className="text-2xl font-bold flex items-center justify-center">
          {anomalyDetected ? (
            <FaExclamationTriangle className="mr-3 text-3xl" />
          ) : null}
          Статус:{" "}
          {anomalyDetected ? "АНОМАЛИЯ ОБНАРУЖЕНА!" : "Нормальная работа"}
        </h2>
        {anomalyDetected && (
          <p className="mt-3 text-lg">
            Обнаружено аномальное значение! Требуется внимание.
          </p>
        )}
      </div>

      {/* Блок статуса подключения к бэкенду/симуляции */}
      <div
        className={`p-4 mb-8 rounded-xl text-center font-medium shadow-sm transition-all duration-300
                     ${
                       isBackendConnected
                         ? "bg-blue-50 text-blue-700 border border-blue-200"
                         : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                     }`}
      >
        Режим данных:{" "}
        <span className="font-bold">
          {isBackendConnected
            ? "Подключено к бэкенду (Real-time)"
            : "Локальная симуляция"}
        </span>
      </div>

      {/* Секция выбора параметров для отображения (чекбоксы) */}
      <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
        <h3 className="text-2xl font-semibold mb-5 text-gray-800">
          Выбрать параметры для отображения:
        </h3>
        <div className="flex gap-4 mb-6">
          <button
            onClick={handleShowAll}
            className="px-6 py-2 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition duration-200 ease-in-out"
          >
            Показать все графики
          </button>
          <button
            onClick={handleHideAll}
            className="px-6 py-2 bg-gray-400 text-white rounded-md shadow-md hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-opacity-75 transition duration-200 ease-in-out"
          >
            Скрыть все графики
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {plotConfigs.map((config) => (
            <label
              key={config.key}
              className="inline-flex items-center cursor-pointer text-gray-700 hover:text-gray-900 transition duration-150 ease-in-out"
            >
              <input
                type="checkbox"
                className="form-checkbox h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
                checked={
                  graphVisibility[config.key as keyof typeof graphVisibility]
                }
                onChange={() =>
                  handleVisibilityChange(
                    config.key as keyof typeof graphVisibility
                  )
                }
              />
              <span className="ml-2 font-medium">{config.title}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Контейнер для динамического рендеринга графиков */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {plotConfigs.map(
          (config) =>
            graphVisibility[config.key as keyof typeof graphVisibility] && (
              <div
                key={config.key}
                className="bg-white p-5 rounded-xl shadow-lg border border-gray-100"
              >
                <h3 className="text-xl font-semibold mb-3 text-gray-800">
                  {config.title}
                </h3>
                <Plot
                  data={[
                    {
                      x: timeStamps,
                      y: getPlotData(config.key as keyof SensorData),
                      type: "scatter",
                      mode: "lines",
                      name: config.name as any,
                      line: { color: config.color },
                    },
                    // Добавляем крестик аномалии как отдельный scatter-след для графика давления
                    ...(config.key === "pressure"
                      ? anomalyTimestamps.map((ts) => ({
                          x: [new Date(ts).toLocaleTimeString()],
                          y: [
                            liveData.find((d) => d.timestamp === ts)?.pressure,
                          ], // Координата Y для крестика
                          mode: "markers",
                          type: "scatter",
                          marker: {
                            symbol: "x", // Символ крестика
                            color: "red",
                            size: 10,
                            line: {
                              color: "red",
                              width: 2,
                            },
                          },
                          name: "Аномалия",
                          showlegend: false, // Не показывать в легенде
                        }))
                      : []),
                  ]}
                  layout={{
                    autosize: true,
                    margin: { l: 40, r: 20, t: 30, b: 40 },
                    xaxis: { title: "Время" },
                    yaxis: { title: config.title },
                    height: 300,
                    annotations:
                      config.key === "pressure" && anomalyDetected
                        ? [
                            {
                              x: timeStamps[timeStamps.length - 1], // Последняя точка
                              xref: "x",
                              y: 1, // Располагаем над графиком
                              yref: "paper",
                              text: "АНОМАЛИЯ!",
                              showarrow: true,
                              arrowhead: 7,
                              ax: 0,
                              ay: -40,
                              font: {
                                color: "red",
                                size: 14,
                                weight: "bold",
                              },
                            },
                          ]
                        : [],
                    shapes:
                      config.key === "pressure" && anomalyDetected
                        ? [
                            {
                              type: "line",
                              x0: timeStamps[timeStamps.length - 1],
                              y0: 0,
                              x1: timeStamps[timeStamps.length - 1],
                              y1: 1,
                              xref: "x",
                              yref: "paper",
                              line: {
                                color: "red",
                                width: 2,
                                dash: "dashdot",
                              },
                            },
                          ]
                        : [],
                    hovermode: "x unified", // Modern hover effect
                  }}
                  useResizeHandler={true}
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            )
        )}
      </div>

      {/* Модальное окно аномалии */}
      <Modal
        isOpen={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)} // Закрываем модальное окно и оно не откроется до новой аномалии
        contentLabel="Anomaly Detected"
        className="Modal"
        overlayClassName="Overlay"
      >
        <div className="flex flex-col items-center justify-center p-8 bg-white rounded-xl shadow-2xl border-t-8 border-red-600 max-w-md mx-auto my-20 transform scale-100 transition-transform duration-300">
          <FaExclamationTriangle className="text-red-600 text-7xl mb-5 animate-pulse" />
          <h2 className="text-4xl font-bold text-red-800 mb-3">АНОМАЛИЯ!</h2>
          <p className="text-xl text-gray-800 text-center mb-8 leading-relaxed">
            Обнаружено критическое отклонение в данных давления. Требуется
            немедленное вмешательство!
          </p>
          <button
            onClick={() => setIsModalOpen(false)}
            className="flex items-center bg-red-700 hover:bg-red-800 text-white font-bold py-3 px-8 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
          >
            <FaTimesCircle className="mr-3 text-xl" /> Закрыть и Проверить
          </button>
        </div>
      </Modal>

      {/* CSS для модального окна (можно вынести в отдельный .css файл) */}
      <style jsx global>{`
        .Modal {
          position: absolute;
          top: 50%;
          left: 50%;
          right: auto;
          bottom: auto;
          margin-right: -50%;
          transform: translate(-50%, -50%);
          background: white;
          padding: 20px;
          border-radius: 8px;
          outline: none;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          animation: modal-appear 0.3s ease-out forwards;
        }

        .Overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: overlay-fade-in 0.3s ease-out forwards;
        }

        .animate-pulse {
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        @keyframes modal-appear {
          from {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }

        @keyframes overlay-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
