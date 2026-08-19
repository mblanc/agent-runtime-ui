"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AgentTarget,
  SessionStateMap,
  SessionStateResponse,
  SessionStateValue,
} from "@/types/agent";
import { useOptionalActiveAgent } from "@/lib/agent-context";
import { throwIfNotOk, withAgentTarget } from "@/lib/api-client";
import { isLocalSessionId } from "@/lib/agent-runtime/event-utils";

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

/** Every request here addresses the same endpoint; only the session id moves. */
function stateUrl(sessionId: string, target: AgentTarget): string {
  return withAgentTarget(`/api/sessions/${encodeURIComponent(sessionId)}/state`, target);
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

  // The agent every request in this provider is addressed to. Memoised so the
  // callbacks below can depend on one value instead of restating both halves.
  const target: AgentTarget = useMemo(
    () => ({ agentId: activeAgent?.id, location: activeAgent?.location }),
    [activeAgent?.id, activeAgent?.location]
  );

  const fetchState = useCallback(
    async (sessionId?: string) => {
      const targetId = sessionId || activeSessionId;
      if (!targetId || isLocalSessionId(targetId)) {
        setState({});
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const url = stateUrl(targetId, target);

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
    [activeSessionId, target]
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
        const url = stateUrl(activeSessionId, target);

        const res = await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            state: { [key]: value },
            mode: "merge",
          }),
        });

        await throwIfNotOk(res, "Failed to update state variable");

        const data: SessionStateResponse = await res.json();
        setState(data.state || nextState);
        setUpdateTime(data.updateTime || new Date().toISOString());
      } catch (err) {
        setState(previousState);
        throw err;
      }
    },
    [activeSessionId, state, target]
  );

  const deleteVariable = useCallback(
    async (key: string): Promise<void> => {
      if (!activeSessionId) return;

      const previousState = { ...state };
      const nextState = { ...state };
      delete nextState[key];
      setState(nextState);

      try {
        const url = stateUrl(activeSessionId, target);

        const res = await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            state: nextState,
            mode: "replace",
          }),
        });

        await throwIfNotOk(res, "Failed to delete state variable");

        const data: SessionStateResponse = await res.json();
        setState(data.state || nextState);
        setUpdateTime(data.updateTime || new Date().toISOString());
      } catch (err) {
        setState(previousState);
        throw err;
      }
    },
    [activeSessionId, state, target]
  );

  const clearState = useCallback(() => {
    setState({});
    setError(null);
  }, []);

  const value = useMemo<SessionStateContextValue>(
    () => ({
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
    }),
    [
      state,
      isLoading,
      error,
      isDrawerOpen,
      setIsDrawerOpen,
      activeSessionId,
      setActiveSessionId,
      fetchState,
      updateVariable,
      deleteVariable,
      clearState,
      updateTime,
    ]
  );

  return (
    <SessionStateContext.Provider value={value}>{children}</SessionStateContext.Provider>
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
