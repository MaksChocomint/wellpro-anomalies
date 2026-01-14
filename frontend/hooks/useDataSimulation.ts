import { useCallback, useRef } from "react";
import { DynamicSensorData } from "@/types/types";

interface UseDataSimulationProps {
  setLiveData: (
    data:
      | DynamicSensorData[]
      | ((prev: DynamicSensorData[]) => DynamicSensorData[])
  ) => void;
  setAnomalyInfo: (data: any[] | ((prev: any[]) => any[])) => void;
  setIsSimulationActive: (active: boolean) => void;
  MAX_DATA_POINTS: number;
}

export function useDataSimulation({
  setLiveData,
  setAnomalyInfo,
  setIsSimulationActive,
  MAX_DATA_POINTS,
}: UseDataSimulationProps) {
  const fullDataRef = useRef<DynamicSensorData[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const dataIndexRef = useRef<number>(0);

  const stopSimulation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setIsSimulationActive(false);
      console.log("[Симуляция] Симуляция остановлена.");
    }
  }, [setIsSimulationActive]);

  const startDataSimulation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setLiveData([]);
    setAnomalyInfo([]);
    dataIndexRef.current = 0;
    console.log("[Симуляция] Начинаем загрузку данных. Интервал: 1000 мс.");

    setIsSimulationActive(true);

    intervalRef.current = setInterval(() => {
      if (dataIndexRef.current < fullDataRef.current.length) {
        setLiveData((prevData) => {
          const newData = [
            ...prevData,
            fullDataRef.current[dataIndexRef.current],
          ];
          return newData.slice(-MAX_DATA_POINTS);
        });
        dataIndexRef.current++;
      } else {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          setIsSimulationActive(false);
          console.log(
            "[Симуляция] Данные из файла закончились. Симуляция остановлена."
          );
        }
      }
    }, 1000);
  }, [setLiveData, setAnomalyInfo, setIsSimulationActive, MAX_DATA_POINTS]);

  return {
    fullDataRef,
    intervalRef,
    dataIndexRef,
    stopSimulation,
    startDataSimulation,
  };
}
