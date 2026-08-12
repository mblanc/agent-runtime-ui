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
import type { AgentMemory, AgentMemoryListResponse } from "@/types/agent";
import { useOptionalActiveAgent } from "@/lib/agent-context";

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

  const fetchMemories = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const queryParams = new URLSearchParams();
      if (activeAgent?.id) {
        queryParams.set("agentId", activeAgent.id);
      }
      if (activeAgent?.location) {
        queryParams.set("location", activeAgent.location);
      }
      const url = queryParams.toString()
        ? `/api/memory?${queryParams.toString()}`
        : "/api/memory";

      const res = await fetch(url, {
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
  }, [activeAgent?.id, activeAgent?.location]);

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
          body: JSON.stringify({
            fact,
            topic,
            agentId: activeAgent?.id,
            location: activeAgent?.location,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Failed to create memory (${res.status}): ${errText}`);
        }

        const created: AgentMemory = await res.json();
        setMemories((prev) => prev.map((m) => (m.id === tempId ? created : m)));
        return created;
      } catch (err) {
        // Rollback optimistic addition
        setMemories((prev) => prev.filter((m) => m.id !== tempId));
        throw err;
      }
    },
    [activeAgent?.id, activeAgent?.location]
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
          body: JSON.stringify({
            fact,
            topic,
            agentId: activeAgent?.id,
            location: activeAgent?.location,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Failed to update memory (${res.status}): ${errText}`);
        }

        const updated: AgentMemory = await res.json();
        setMemories((prev) => prev.map((m) => (m.id === memoryId ? updated : m)));
        return updated;
      } catch (err) {
        // Rollback
        setMemories(previousMemories);
        throw err;
      }
    },
    [memories, activeAgent?.id, activeAgent?.location]
  );

  const deleteMemory = useCallback(
    async (memoryId: string): Promise<void> => {
      const previousMemories = [...memories];
      setMemories((prev) => prev.filter((m) => m.id !== memoryId));

      try {
        const queryParams = new URLSearchParams();
        if (activeAgent?.id) queryParams.set("agentId", activeAgent.id);
        if (activeAgent?.location) queryParams.set("location", activeAgent.location);
        const url = queryParams.toString()
          ? `/api/memory/${encodeURIComponent(memoryId)}?${queryParams.toString()}`
          : `/api/memory/${encodeURIComponent(memoryId)}`;

        const res = await fetch(url, {
          method: "DELETE",
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Failed to delete memory (${res.status}): ${errText}`);
        }
      } catch (err) {
        setMemories(previousMemories);
        throw err;
      }
    },
    [memories, activeAgent?.id, activeAgent?.location]
  );

  const generateMemories = useCallback(
    async (sessionId: string): Promise<AgentMemory[]> => {
      try {
        const res = await fetch("/api/memory/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            agentId: activeAgent?.id,
            location: activeAgent?.location,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Failed to generate memories (${res.status}): ${errText}`);
        }

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
    [activeAgent?.id, activeAgent?.location]
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

  return (
    <MemoryContext.Provider
      value={{
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
      }}
    >
      {children}
    </MemoryContext.Provider>
  );
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
