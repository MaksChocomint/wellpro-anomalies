import { useCallback, useRef, MutableRefObject } from "react";
import {
  DynamicSensorData,
  AnomalyDetectionMethod,
  AnomalyInfo,
} from "@/types/types";
import { excelSerialToJsDate, formatParamName } from "@/utils/utils";

interface UseWebSocketProps {
  setLiveData: (
    data:
      | DynamicSensorData[]
      | ((prev: DynamicSensorData[]) => DynamicSensorData[])
  ) => void;
  setAnomalyInfo: (
    data: AnomalyInfo[] | ((prev: AnomalyInfo[]) => AnomalyInfo[])
  ) => void;
  setIsBackendConnected: (connected: boolean) => void;
  setConsecutiveAnomaliesCount: (count: number) => void;
  setIsModalOpen: (open: boolean) => void;
  setAvailableParameters: (params: string[]) => void;
  setGraphVisibility: (
    visibility:
      | Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => void;
  setFlightStart: (date: Date | null) => void;
  sendParametersToServer: () => void;
  MAX_DATA_POINTS: number;
}

export function useWebSocket({
  setLiveData,
  setAnomalyInfo,
  setIsBackendConnected,
  setConsecutiveAnomaliesCount,
  setIsModalOpen,
  setAvailableParameters,
  setGraphVisibility,
  setFlightStart,
  sendParametersToServer,
  MAX_DATA_POINTS,
}: UseWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current) {
      console.log("[WebSocket] Closing existing connection.");
      wsRef.current.close();
    }

    setLiveData([]);
    setAnomalyInfo([]);
    setIsBackendConnected(false);
    setConsecutiveAnomaliesCount(0);
    setIsModalOpen(false);

    const ws = new WebSocket("ws://127.0.0.1:8000/api/v1/ws");
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WebSocket] Connection established.");
      setIsBackendConnected(true);

      setTimeout(() => {
        sendParametersToServer();
      }, 500);
    };

    ws.onmessage = (event) => {
      try {
        const incomingMessage = JSON.parse(event.data);
        const data = incomingMessage.data;

        if (!data) {
          console.warn(
            "[WebSocket] Received message with no 'data' key. Skipping."
          );
          return;
        }

        console.log("[WebSocket] Data received:", data);

        setLiveData((prevData) => {
          const newDataPoint: DynamicSensorData = {};
          let isFirstData = prevData.length === 0;
          const newAnomaliesThisPoint: AnomalyInfo[] = [];

          for (const key in data) {
            if (key === "время") {
              newDataPoint[key] = data[key];
              continue;
            }

            const value = data[key];

            if (Array.isArray(value) && value.length === 2) {
              const [paramValue, isAnomaly] = value;
              newDataPoint[key] = [paramValue, isAnomaly];

              if (isAnomaly) {
                setIsModalOpen(true);
                newAnomaliesThisPoint.push({
                  id: `${Date.now()}-${key}`,
                  timestamp: data["время"] as number,
                  param: key,
                  message: `Аномалия обнаружена в ${formatParamName(
                    key
                  )}: ${paramValue.toFixed(2)}`,
                });
              }
            } else {
              const paramValue = parseFloat(value);
              if (!isNaN(paramValue)) {
                newDataPoint[key] = [paramValue, false];
              } else {
                console.warn(
                  `[WebSocket] Skipping invalid data for key '${key}':`,
                  value
                );
                continue;
              }
            }
          }

          if (newAnomaliesThisPoint.length > 0) {
            setAnomalyInfo((prevInfo) => [
              ...prevInfo,
              ...newAnomaliesThisPoint,
            ]);
          }

          if (isFirstData) {
            const params = Object.keys(newDataPoint).filter(
              (k) => k !== "время" && Array.isArray(newDataPoint[k])
            );
            setAvailableParameters(params);
            setGraphVisibility(
              params.reduce((acc, param) => ({ ...acc, [param]: true }), {})
            );
            setFlightStart(
              excelSerialToJsDate(newDataPoint["время"] as number)
            );
          }

          const updatedData = [...prevData, newDataPoint];
          return updatedData.slice(-MAX_DATA_POINTS);
        });
      } catch (error) {
        console.error("[WebSocket] Error parsing message:", error);
      }
    };

    ws.onclose = (event) => {
      console.log("[WebSocket] Connection closed.", event.code, event.reason);
      setIsBackendConnected(false);
    };

    ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
      setIsBackendConnected(false);
    };
  }, [
    setLiveData,
    setAnomalyInfo,
    setIsBackendConnected,
    setConsecutiveAnomaliesCount,
    setIsModalOpen,
    setAvailableParameters,
    setGraphVisibility,
    setFlightStart,
    sendParametersToServer,
    MAX_DATA_POINTS,
  ]);

  return { wsRef, connectWebSocket };
}
