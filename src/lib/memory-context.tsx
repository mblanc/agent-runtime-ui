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
import type { AgentMemory, AgentMemoryListResponse, AgentTarget } from "@/types/agent";
import { useOptionalActiveAgent } from "@/lib/agent-context";
import { throwIfNotOk, withAgentTarget } from "@/lib/api-client";

export interface TopicCount {
  name: string;
  count: number;
}

export interface MemoryContextValue {
  memories: AgentMemory[];
  filteredMemories: AgentMemory[];
  topics: TopicCount[];
  isLoading: boolean;
  error: string | null;
  activeTopic: string;
  searchQuery: string;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  setTopic: (topic: string) => void;
  setSearchQuery: (query: string) => void;
  refreshMemories: () => Promise<void>;
  createMemory: (fact: string, topic?: string) => Promise<AgentMemory>;
  updateMemory: (memoryId: string, fact: string, topic?: string) => Promise<AgentMemory>;
  deleteMemory: (memoryId: string) => Promise<void>;
  generateMemories: (sessionId: string) => Promise<AgentMemory[]>;
}

const MemoryContext = createContext<MemoryContextValue | undefined>(undefined);

export function MemoryProvider({
  children,
  initialMemories,
}: {
  children: ReactNode;
  initialMemories?: AgentMemory[];
}) {
  const optionalAgent = useOptionalActiveAgent();
  const activeAgent = optionalAgent?.activeAgent;

  const [memories, setMemories] = useState<AgentMemory[]>(initialMemories || []);
  const [isLoading, setIsLoading] = useState<boolean>(!initialMemories);
  const [error, setError] = useState<string | null>(null);
  const [activeTopic, setActiveTopic] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // The agent every request in this provider is addressed to. Memoised so the
  // callbacks below can depend on one value instead of restating both halves.
  const target: AgentTarget = useMemo(
    () => ({ agentId: activeAgent?.id, location: activeAgent?.location }),
    [activeAgent?.id, activeAgent?.location]
  );

  const fetchMemories = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch(withAgentTarget("/api/memory", target), {
        cache: "no-store",
      });

      if (!res.ok) {
        if (res.status === 401) {
          setMemories([]);
          return;
        }
        throw new Error(`Failed to fetch memories (${res.status})`);
      }

      const data: AgentMemoryListResponse = await res.json();
      setMemories(data.memories || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error fetching memories";
      console.error("[MemoryProvider] Failed to load memories:", msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [target]);

  useEffect(() => {
    if (!initialMemories) {
      fetchMemories();
    }
  }, [fetchMemories, initialMemories]);

  const createMemory = useCallback(
    async (fact: string, topic?: string): Promise<AgentMemory> => {
      const tempId = `temp-${Date.now()}`;
      const now = new Date().toISOString();
      const optimisticMemory: AgentMemory = {
        id: tempId,
        userId: "current-user",
        fact,
        topic: topic || "general",
        confidenceScore: 0.95,
        createTime: now,
        updateTime: now,
      };

      setMemories((prev) => [optimisticMemory, ...prev]);

      try {
        const res = await fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fact, topic, ...target }),
        });

        await throwIfNotOk(res, "Failed to create memory");

        const created: AgentMemory = await res.json();
        setMemories((prev) => prev.map((m) => (m.id === tempId ? created : m)));
        return created;
      } catch (err) {
        // Rollback optimistic addition
        setMemories((prev) => prev.filter((m) => m.id !== tempId));
        throw err;
      }
    },
    [target]
  );

  const updateMemory = useCallback(
    async (memoryId: string, fact: string, topic?: string): Promise<AgentMemory> => {
      const previousMemories = [...memories];
      const now = new Date().toISOString();

      setMemories((prev) =>
        prev.map((m) =>
          m.id === memoryId
            ? {
                ...m,
                fact: fact || m.fact,
                topic: topic !== undefined ? topic : m.topic,
                updateTime: now,
              }
            : m
        )
      );

      try {
        const res = await fetch(`/api/memory/${encodeURIComponent(memoryId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fact, topic, ...target }),
        });

        await throwIfNotOk(res, "Failed to update memory");

        const updated: AgentMemory = await res.json();
        setMemories((prev) => prev.map((m) => (m.id === memoryId ? updated : m)));
        return updated;
      } catch (err) {
        // Rollback
        setMemories(previousMemories);
        throw err;
      }
    },
    [memories, target]
  );

  const deleteMemory = useCallback(
    async (memoryId: string): Promise<void> => {
      const previousMemories = [...memories];
      setMemories((prev) => prev.filter((m) => m.id !== memoryId));

      try {
        const url = withAgentTarget(
          `/api/memory/${encodeURIComponent(memoryId)}`,
          target
        );

        const res = await fetch(url, {
          method: "DELETE",
        });

        await throwIfNotOk(res, "Failed to delete memory");
      } catch (err) {
        setMemories(previousMemories);
        throw err;
      }
    },
    [memories, target]
  );

  const generateMemories = useCallback(
    async (sessionId: string): Promise<AgentMemory[]> => {
      try {
        const res = await fetch("/api/memory/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, ...target }),
        });

        await throwIfNotOk(res, "Failed to generate memories");

        const data = await res.json();
        const extracted: AgentMemory[] = data.memories || [];
        if (extracted.length > 0) {
          setMemories((prev) => [...extracted, ...prev]);
        }
        return extracted;
      } catch (err) {
        console.error("[MemoryProvider] Error generating memories:", err);
        throw err;
      }
    },
    [target]
  );

  const topics: TopicCount[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const mem of memories) {
      const t = mem.topic || "general";
      map.set(t, (map.get(t) || 0) + 1);
    }
    const list: TopicCount[] = [{ name: "all", count: memories.length }];
    for (const [name, count] of map.entries()) {
      list.push({ name, count });
    }
    return list;
  }, [memories]);

  const filteredMemories = useMemo(() => {
    return memories.filter((m) => {
      const matchesTopic =
        activeTopic === "all" ||
        (m.topic || "general").toLowerCase() === activeTopic.toLowerCase();
      if (!matchesTopic) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesFact = m.fact.toLowerCase().includes(query);
        const matchesTopicName = (m.topic || "").toLowerCase().includes(query);
        return matchesFact || matchesTopicName;
      }

      return true;
    });
  }, [memories, activeTopic, searchQuery]);

  const value = useMemo<MemoryContextValue>(
    () => ({
      memories,
      filteredMemories,
      topics,
      isLoading,
      error,
      activeTopic,
      searchQuery,
      isDrawerOpen,
      setIsDrawerOpen,
      setTopic: setActiveTopic,
      setSearchQuery,
      refreshMemories: fetchMemories,
      createMemory,
      updateMemory,
      deleteMemory,
      generateMemories,
    }),
    [
      memories,
      filteredMemories,
      topics,
      isLoading,
      error,
      activeTopic,
      searchQuery,
      isDrawerOpen,
      setIsDrawerOpen,
      setActiveTopic,
      setSearchQuery,
      fetchMemories,
      createMemory,
      updateMemory,
      deleteMemory,
      generateMemories,
    ]
  );

  return <MemoryContext.Provider value={value}>{children}</MemoryContext.Provider>;
}

export function useMemory(): MemoryContextValue {
  const context = useContext(MemoryContext);
  if (!context) {
    throw new Error("useMemory must be used within a MemoryProvider");
  }
  return context;
}

export function useOptionalMemory(): MemoryContextValue | undefined {
  return useContext(MemoryContext);
}
