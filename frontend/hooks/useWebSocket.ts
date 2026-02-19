import { useCallback, useRef } from "react";
import { DynamicSensorData, AnomalyInfo } from "@/types/types";
import { excelSerialToJsDate } from "@/utils/utils";
import { processIncomingDataPoint } from "@/utils/dataProcessor";

interface UseWebSocketProps {
  setLiveData: (
    data:
      | DynamicSensorData[]
      | ((prev: DynamicSensorData[]) => DynamicSensorData[]),
  ) => void;
  setAnomalyInfo: (
    data: AnomalyInfo[] | ((prev: AnomalyInfo[]) => AnomalyInfo[]),
  ) => void;
  setIsBackendConnected: (connected: boolean) => void;
  setIsModalOpen: (open: boolean) => void;
  setAvailableParameters: (params: string[]) => void;
  setGraphVisibility: (
    v:
      | Record<string, boolean>
      | ((p: Record<string, boolean>) => Record<string, boolean>),
  ) => void;
  setFlightStart: (date: Date | null) => void;
  sendParametersToServer: () => void;
  MAX_DATA_POINTS: number;
}

export function useWebSocket({
  setLiveData,
  setAnomalyInfo,
  setIsBackendConnected,
  setIsModalOpen,
  setAvailableParameters,
  setGraphVisibility,
  setFlightStart,
  sendParametersToServer,
  MAX_DATA_POINTS,
}: UseWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current) wsRef.current.close();

    setLiveData([]);
    setAnomalyInfo([]);
    setIsBackendConnected(false);

    const ws = new WebSocket("ws://127.0.0.1:8000/api/v1/ws");
    wsRef.current = ws;

    ws.onopen = () => {
      setIsBackendConnected(true);
      setTimeout(sendParametersToServer, 500);
    };

    ws.onmessage = (event) => {
      try {
        const incoming = JSON.parse(event.data);
        const rawData = incoming.data;
        if (!rawData) return;

        // Применяем ТОТ ЖЕ самый паттерн обработки
        const { newDataPoint, newAnomalies } =
          processIncomingDataPoint(rawData);

        setLiveData((prevData) => {
          if (prevData.length === 0) {
            const params = Object.keys(newDataPoint).filter(
              (k) => k !== "время",
            );
            setAvailableParameters(params);
            setGraphVisibility(
              params.reduce((acc, p) => ({ ...acc, [p]: true }), {}),
            );
            setFlightStart(
              excelSerialToJsDate(newDataPoint["время"] as number),
            );
          }

          if (newAnomalies.length > 0) {
            setIsModalOpen(true);
            setAnomalyInfo((prev) => [...prev, ...newAnomalies].slice(-50));
          }

          return [...prevData, newDataPoint].slice(-MAX_DATA_POINTS);
        });
      } catch (e) {
        console.error("[WebSocket] Parse error:", e);
      }
    };

    ws.onclose = () => setIsBackendConnected(false);
  }, [
    setLiveData,
    setAnomalyInfo,
    setIsBackendConnected,
    setIsModalOpen,
    setAvailableParameters,
    setGraphVisibility,
    setFlightStart,
    sendParametersToServer,
    MAX_DATA_POINTS,
  ]);

  return { wsRef, connectWebSocket };
}
