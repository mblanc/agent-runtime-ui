"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  SessionStateMap,
  SessionStateResponse,
  SessionStateValue,
} from "@/types/agent";
import { useOptionalActiveAgent } from "@/lib/agent-context";

export interface SessionStateContextValue {
  state: SessionStateMap;
  isLoading: boolean;
  error: string | null;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  activeSessionId?: string;
  setActiveSessionId: (id: string | undefined) => void;
  refreshState: () => Promise<void>;
  updateVariable: (key: string, value: SessionStateValue) => Promise<void>;
  deleteVariable: (key: string) => Promise<void>;
  clearState: () => void;
  updateTime?: string;
}

const SessionStateContext = createContext<SessionStateContextValue | undefined>(
  undefined
);

export function SessionStateProvider({
  children,
  initialSessionId,
  initialState,
}: {
  children: ReactNode;
  initialSessionId?: string;
  initialState?: SessionStateMap;
}) {
  const optionalAgent = useOptionalActiveAgent();
  const activeAgent = optionalAgent?.activeAgent;

  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(
    initialSessionId
  );
  const [state, setState] = useState<SessionStateMap>(initialState || {});
  const [updateTime, setUpdateTime] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  const fetchState = useCallback(
    async (sessionId?: string) => {
      const targetId = sessionId || activeSessionId;
      if (
        !targetId ||
        targetId.startsWith("__LOCALID_") ||
        targetId.startsWith("local-")
      ) {
        setState({});
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (activeAgent?.id) params.set("agentId", activeAgent.id);
        if (activeAgent?.location) params.set("location", activeAgent.location);

        const url = params.toString()
          ? `/api/sessions/${encodeURIComponent(targetId)}/state?${params.toString()}`
          : `/api/sessions/${encodeURIComponent(targetId)}/state`;

        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 404) {
            setState({});
            return;
          }
          throw new Error(`Failed to fetch session state (${res.status})`);
        }

        const data: SessionStateResponse = await res.json();
        setState(data.state || {});
        setUpdateTime(data.updateTime);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error fetching session state";
        console.error("[SessionStateProvider] Error:", msg);
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [activeSessionId, activeAgent?.id, activeAgent?.location]
  );

  useEffect(() => {
    if (activeSessionId) {
      fetchState(activeSessionId);
    } else {
      setState({});
    }
  }, [activeSessionId, fetchState]);

  const updateVariable = useCallback(
    async (key: string, value: SessionStateValue): Promise<void> => {
      if (!activeSessionId) return;

      const previousState = { ...state };
      const nextState = { ...state, [key]: value };
      setState(nextState);

      try {
        const params = new URLSearchParams();
        if (activeAgent?.id) params.set("agentId", activeAgent.id);
        if (activeAgent?.location) params.set("location", activeAgent.location);

        const url = params.toString()
          ? `/api/sessions/${encodeURIComponent(activeSessionId)}/state?${params.toString()}`
          : `/api/sessions/${encodeURIComponent(activeSessionId)}/state`;

        const res = await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            state: { [key]: value },
            mode: "merge",
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Failed to update state variable (${res.status}): ${errText}`);
        }

        const data: SessionStateResponse = await res.json();
        setState(data.state || nextState);
        setUpdateTime(data.updateTime || new Date().toISOString());
      } catch (err) {
        setState(previousState);
        throw err;
      }
    },
    [activeSessionId, state, activeAgent?.id, activeAgent?.location]
  );

  const deleteVariable = useCallback(
    async (key: string): Promise<void> => {
      if (!activeSessionId) return;

      const previousState = { ...state };
      const nextState = { ...state };
      delete nextState[key];
      setState(nextState);

      try {
        const params = new URLSearchParams();
        if (activeAgent?.id) params.set("agentId", activeAgent.id);
        if (activeAgent?.location) params.set("location", activeAgent.location);

        const url = params.toString()
          ? `/api/sessions/${encodeURIComponent(activeSessionId)}/state?${params.toString()}`
          : `/api/sessions/${encodeURIComponent(activeSessionId)}/state`;

        const res = await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            state: nextState,
            mode: "replace",
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Failed to delete state variable (${res.status}): ${errText}`);
        }

        const data: SessionStateResponse = await res.json();
        setState(data.state || nextState);
        setUpdateTime(data.updateTime || new Date().toISOString());
      } catch (err) {
        setState(previousState);
        throw err;
      }
    },
    [activeSessionId, state, activeAgent?.id, activeAgent?.location]
  );

  const clearState = useCallback(() => {
    setState({});
    setError(null);
  }, []);

  return (
    <SessionStateContext.Provider
      value={{
        state,
        isLoading,
        error,
        isDrawerOpen,
        setIsDrawerOpen,
        activeSessionId,
        setActiveSessionId,
        refreshState: () => fetchState(),
        updateVariable,
        deleteVariable,
        clearState,
        updateTime,
      }}
    >
      {children}
    </SessionStateContext.Provider>
  );
}

export function useSessionState(): SessionStateContextValue {
  const context = useContext(SessionStateContext);
  if (!context) {
    throw new Error("useSessionState must be used within a SessionStateProvider");
  }
  return context;
}

export function useOptionalSessionState(): SessionStateContextValue | undefined {
  return useContext(SessionStateContext);
}
