import { useCallback, useRef } from "react";
import { DynamicSensorData, AnomalyInfo } from "@/types/types";
import { processIncomingDataPoint } from "@/utils/dataProcessor";

interface UseDataSimulationProps {
  setLiveData: (
    data:
      | DynamicSensorData[]
      | ((prev: DynamicSensorData[]) => DynamicSensorData[]),
  ) => void;
  setAnomalyInfo: (
    data: AnomalyInfo[] | ((prev: AnomalyInfo[]) => AnomalyInfo[]),
  ) => void;
  setIsSimulationActive: (active: boolean) => void;
  setIsModalOpen: (open: boolean) => void;
  MAX_DATA_POINTS: number;
  MAX_ANOMALIES: number;
}

export function useDataSimulation({
  setLiveData,
  setAnomalyInfo,
  setIsSimulationActive,
  setIsModalOpen,
  MAX_DATA_POINTS,
  MAX_ANOMALIES,
}: UseDataSimulationProps) {
  const fullDataRef = useRef<any[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const dataIndexRef = useRef<number>(0);

  const stopSimulation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setIsSimulationActive(false);
    }
  }, [setIsSimulationActive]);

  const startDataSimulation = useCallback(() => {
    if (intervalRef.current) return;

    if (dataIndexRef.current === 0) {
      setLiveData([]);
      setAnomalyInfo([]);
    }

    setIsSimulationActive(true);

    intervalRef.current = setInterval(() => {
      const rawData = fullDataRef.current;
      const index = dataIndexRef.current;

      if (index < rawData.length) {
        // Use the same normalization pattern for local and realtime payloads.
        const { newDataPoint, newAnomalies } = processIncomingDataPoint(
          rawData[index],
        );

        setLiveData((prev) => [...prev, newDataPoint].slice(-MAX_DATA_POINTS));

        if (newAnomalies.length > 0) {
          setIsModalOpen(true);
          setAnomalyInfo((prev) => [...prev, ...newAnomalies].slice(-MAX_ANOMALIES));
        }

        dataIndexRef.current++;
      } else {
        stopSimulation();
        dataIndexRef.current = 0;
      }
    }, 500);
  }, [
    setLiveData,
    setAnomalyInfo,
    setIsSimulationActive,
    setIsModalOpen,
    MAX_DATA_POINTS,
    MAX_ANOMALIES,
    stopSimulation,
  ]);

  return { fullDataRef, dataIndexRef, stopSimulation, startDataSimulation };
}
