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
  MAX_ANOMALIES: number;
}

export interface SocketSelection {
  clusterNumber?: number | null;
  wellName?: string | null;
  rigId?: number | null;
}

function getAnomalyKey(anomaly: AnomalyInfo): string {
  return `${anomaly.param}|${String(anomaly.timestamp)}`;
}

function appendUniqueAnomalies(
  current: AnomalyInfo[],
  incoming: AnomalyInfo[],
  maxItems: number,
): AnomalyInfo[] {
  if (incoming.length === 0) return current;

  const existingKeys = new Set(current.map(getAnomalyKey));
  const uniqueIncoming = incoming.filter((anomaly) => {
    const key = getAnomalyKey(anomaly);
    if (existingKeys.has(key)) return false;

    existingKeys.add(key);
    return true;
  });

  if (uniqueIncoming.length === 0) return current;

  return [...current, ...uniqueIncoming].slice(-maxItems);
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
  MAX_ANOMALIES,
}: UseWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const isStreamInitializedRef = useRef<boolean>(false);

  const connectWebSocket = useCallback(
    (selection?: SocketSelection) => {
      if (wsRef.current) wsRef.current.close();

      isStreamInitializedRef.current = false;
      setLiveData([]);
      setAnomalyInfo([]);
      setIsBackendConnected(false);

      const params = new URLSearchParams();
      if (selection?.clusterNumber !== undefined && selection?.clusterNumber !== null) {
        params.set("cluster_number", String(selection.clusterNumber));
      }
      if (selection?.wellName !== undefined && selection?.wellName !== null) {
        params.set("well_name", String(selection.wellName));
      }
      if (selection?.rigId !== undefined && selection?.rigId !== null) {
        params.set("rig_id", String(selection.rigId));
      }

      const query = params.toString();
      const wsUrl = `ws://127.0.0.1:8000/api/v1/ws${query ? `?${query}` : ""}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setTimeout(() => {
          if (wsRef.current === ws) {
            setIsBackendConnected(true);
          }
        }, 1000);
        setTimeout(sendParametersToServer, 500);
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;

        try {
          const incoming = JSON.parse(event.data);
          const rawData = incoming.data;
          if (!rawData) return;

          const { newDataPoint, newAnomalies } = processIncomingDataPoint(rawData);

          if (!isStreamInitializedRef.current) {
            const params = Object.keys(newDataPoint).filter((k) => k !== "время");
            setAvailableParameters(params);
            setGraphVisibility(params.reduce((acc, p) => ({ ...acc, [p]: true }), {}));
            setFlightStart(excelSerialToJsDate(newDataPoint["время"] as number));
            isStreamInitializedRef.current = true;
          }

          if (newAnomalies.length > 0) {
            setIsModalOpen(true);
            setAnomalyInfo((prev) =>
              appendUniqueAnomalies(prev, newAnomalies, MAX_ANOMALIES),
            );
          }

          setLiveData((prevData) => {
            return [...prevData, newDataPoint].slice(-MAX_DATA_POINTS);
          });
        } catch (e) {
          console.error("[WebSocket] Parse error:", e);
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          setIsBackendConnected(false);
        }
      };
    },
    [
      setLiveData,
      setAnomalyInfo,
      setIsBackendConnected,
      setIsModalOpen,
      setAvailableParameters,
      setGraphVisibility,
      setFlightStart,
      sendParametersToServer,
      MAX_DATA_POINTS,
      MAX_ANOMALIES,
    ],
  );

  return { wsRef, connectWebSocket };
}
