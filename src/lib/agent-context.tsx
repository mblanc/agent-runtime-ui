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
import type { DeployedAgent, ListAgentsResponse } from "@/types/agent";

const STORAGE_KEY = "agent_runtime_active_agent_id";

function getStoredAgentId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistAgentId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Ignore storage write failures
  }
}

export interface AgentContextValue {
  activeAgent: DeployedAgent | null;
  availableAgents: DeployedAgent[];
  isLoading: boolean;
  error: string | null;
  setActiveAgent: (agentOrId: DeployedAgent | string) => void;
  refreshAgents: () => Promise<void>;
}

const AgentContext = createContext<AgentContextValue | undefined>(undefined);

export function AgentProvider({
  children,
  initialAgents,
  initialActiveAgentId,
}: {
  children: ReactNode;
  initialAgents?: DeployedAgent[];
  initialActiveAgentId?: string;
}) {
  const [availableAgents, setAvailableAgents] = useState<DeployedAgent[]>(
    initialAgents || []
  );
  const [activeAgent, setActiveAgentState] = useState<DeployedAgent | null>(() => {
    if (initialAgents && initialAgents.length > 0) {
      if (initialActiveAgentId) {
        const found = initialAgents.find((a) => a.id === initialActiveAgentId);
        if (found) return found;
      }
      const defaultAgent = initialAgents.find((a) => a.isDefault);
      return defaultAgent || initialAgents[0];
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(!initialAgents);
  const [error, setError] = useState<string | null>(null);

  const selectAndPersistAgent = useCallback((agentOrId: DeployedAgent | string) => {
    setAvailableAgents((currentAgents) => {
      const targetId = typeof agentOrId === "string" ? agentOrId : agentOrId.id;
      const targetAgent =
        typeof agentOrId === "string"
          ? currentAgents.find((a) => a.id === targetId)
          : agentOrId;

      if (targetAgent) {
        setActiveAgentState(targetAgent);
        persistAgentId(targetAgent.id);
      }
      return currentAgents;
    });
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch("/api/agents", {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch agents (${res.status})`);
      }

      const data: ListAgentsResponse = await res.json();
      const agents = data.agents || [];
      setAvailableAgents(agents);

      if (agents.length > 0) {
        const storedId = getStoredAgentId();
        const agentFromStorage = storedId ? agents.find((a) => a.id === storedId) : null;
        const agentFromBackend = data.activeAgentId
          ? agents.find((a) => a.id === data.activeAgentId)
          : null;
        const defaultAgent = agents.find((a) => a.isDefault) || agents[0];

        const chosen = agentFromStorage || agentFromBackend || defaultAgent;
        setActiveAgentState(chosen);
        if (chosen) {
          persistAgentId(chosen.id);
        }
      } else {
        setActiveAgentState(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error fetching agents";
      console.error("[AgentProvider] Failed to load deployed reasoning engines:", msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialAgents) {
      fetchAgents();
    }
  }, [fetchAgents, initialAgents]);

  const value = useMemo<AgentContextValue>(
    () => ({
      activeAgent,
      availableAgents,
      isLoading,
      error,
      setActiveAgent: selectAndPersistAgent,
      refreshAgents: fetchAgents,
    }),
    [activeAgent, availableAgents, isLoading, error, selectAndPersistAgent, fetchAgents]
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useActiveAgent(): AgentContextValue {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error("useActiveAgent must be used within an AgentProvider");
  }
  return context;
}

export function useOptionalActiveAgent(): AgentContextValue | undefined {
  return useContext(AgentContext);
}
