"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AgentArtifact,
  AgentArtifactListResponse,
  AgentTarget,
  ArtifactStreamPayload,
  ArtifactVersion,
} from "@/types/agent";
import { useOptionalActiveAgent } from "@/lib/agent-context";
import { withAgentTarget } from "@/lib/api-client";
import { isLocalSessionId } from "@/lib/agent-runtime/event-utils";

export type ArtifactTab = "preview" | "code" | "data";

export interface ArtifactContextValue {
  artifacts: AgentArtifact[];
  activeArtifact: AgentArtifact | null;
  activeVersion: ArtifactVersion | null;
  selectedVersion: number | null;
  isOpen: boolean;
  activeTab: ArtifactTab;
  splitRatio: number;
  isFullscreen: boolean;
  isLoading: boolean;
  error: string | null;
  activeSessionId?: string;
  setActiveSessionId: (id: string | undefined) => void;
  openArtifact: (filenameOrId: string, version?: number) => void;
  closeCanvas: () => void;
  toggleCanvas: () => void;
  selectVersion: (version: number) => void;
  setActiveTab: (tab: ArtifactTab) => void;
  setSplitRatio: (ratio: number) => void;
  toggleFullscreen: () => void;
  refreshArtifacts: () => Promise<void>;
  ingestStreamArtifact: (payload: ArtifactStreamPayload) => void;
}

const SPLIT_RATIO_STORAGE_KEY = "agent_runtime_artifact_split_ratio";
const DEFAULT_SPLIT_RATIO = 0.5;

const ArtifactContext = createContext<ArtifactContextValue | undefined>(undefined);

export function ArtifactProvider({
  children,
  initialSessionId,
  initialArtifacts,
}: {
  children: ReactNode;
  initialSessionId?: string;
  initialArtifacts?: AgentArtifact[];
}) {
  const optionalAgent = useOptionalActiveAgent();
  const activeAgent = optionalAgent?.activeAgent;

  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(
    initialSessionId
  );
  const [artifacts, setArtifacts] = useState<AgentArtifact[]>(initialArtifacts || []);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ArtifactTab>("preview");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [splitRatio, setSplitRatioState] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(SPLIT_RATIO_STORAGE_KEY);
      if (stored) {
        const parsed = parseFloat(stored);
        if (!isNaN(parsed) && parsed >= 0.2 && parsed <= 0.8) {
          return parsed;
        }
      }
    }
    return DEFAULT_SPLIT_RATIO;
  });

  const target: AgentTarget = useMemo(
    () => ({ agentId: activeAgent?.id, location: activeAgent?.location }),
    [activeAgent?.id, activeAgent?.location]
  );

  const setSplitRatio = useCallback((ratio: number) => {
    const clamped = Math.max(0.25, Math.min(0.75, ratio));
    setSplitRatioState(clamped);
    if (typeof window !== "undefined") {
      localStorage.setItem(SPLIT_RATIO_STORAGE_KEY, clamped.toString());
    }
  }, []);

  const fetchArtifacts = useCallback(
    async (sessionId?: string) => {
      const targetId = sessionId || activeSessionId;
      if (!targetId || isLocalSessionId(targetId)) {
        setArtifacts([]);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const url = withAgentTarget(
          `/api/sessions/${encodeURIComponent(targetId)}/artifacts`,
          target
        );

        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 404 || res.status === 401) {
            setArtifacts([]);
            return;
          }
          throw new Error(`Failed to fetch artifacts (${res.status})`);
        }

        const data: AgentArtifactListResponse = await res.json();
        setArtifacts(data.artifacts || []);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error loading artifacts";
        console.error("[ArtifactProvider] Failed to fetch artifacts:", msg);
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [activeSessionId, target]
  );

  const lastSessionIdRef = useRef<string | undefined>(initialSessionId);

  useEffect(() => {
    if (activeSessionId !== lastSessionIdRef.current) {
      lastSessionIdRef.current = activeSessionId;
      setActiveArtifactId(null);
      setSelectedVersion(null);
      if (!initialArtifacts && activeSessionId) {
        fetchArtifacts(activeSessionId);
      } else if (!activeSessionId && !initialArtifacts) {
        setArtifacts([]);
      }
    } else if (
      !initialArtifacts &&
      activeSessionId &&
      artifacts.length === 0 &&
      !isLoading
    ) {
      fetchArtifacts(activeSessionId);
    }
  }, [activeSessionId, fetchArtifacts, initialArtifacts, artifacts.length, isLoading]);

  const activeArtifact = useMemo(() => {
    if (!activeArtifactId) return null;
    return (
      artifacts.find(
        (a) => a.id === activeArtifactId || a.filename === activeArtifactId
      ) || null
    );
  }, [artifacts, activeArtifactId]);

  const activeVersion = useMemo(() => {
    if (!activeArtifact) return null;
    if (selectedVersion !== null) {
      const match = activeArtifact.versions.find((v) => v.version === selectedVersion);
      if (match) return match;
    }
    const current = activeArtifact.versions.find(
      (v) => v.version === activeArtifact.currentVersion
    );
    return current || activeArtifact.versions[activeArtifact.versions.length - 1] || null;
  }, [activeArtifact, selectedVersion]);

  const openArtifact = useCallback((filenameOrId: string, version?: number) => {
    setActiveArtifactId(filenameOrId);
    if (version !== undefined) {
      setSelectedVersion(version);
    } else {
      setSelectedVersion(null);
    }
    setIsOpen(true);
  }, []);

  const closeCanvas = useCallback(() => {
    setIsOpen(false);
    setIsFullscreen(false);
  }, []);

  const toggleCanvas = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev && !activeArtifactId && artifacts.length > 0) {
        setActiveArtifactId(artifacts[0].filename);
      }
      return !prev;
    });
  }, [activeArtifactId, artifacts]);

  const selectVersion = useCallback((version: number) => {
    setSelectedVersion(version);
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const refreshArtifacts = useCallback(async () => {
    await fetchArtifacts();
  }, [fetchArtifacts]);

  const ingestStreamArtifact = useCallback(
    (payload: ArtifactStreamPayload) => {
      const now = new Date().toISOString();
      const versionObj: ArtifactVersion = {
        version: payload.version,
        content: payload.content,
        createTime: now,
        sizeBytes: new TextEncoder().encode(payload.content).length,
        mimeType: payload.mimeType,
        gcsUri: payload.gcsUri,
      };

      setArtifacts((prev) => {
        const existingIdx = prev.findIndex((a) => a.filename === payload.filename);
        if (existingIdx >= 0) {
          const existing = prev[existingIdx];
          const versionIdx = existing.versions.findIndex(
            (v) => v.version === payload.version
          );
          const updatedVersions =
            versionIdx >= 0
              ? existing.versions.map((v, i) => (i === versionIdx ? versionObj : v))
              : [...existing.versions, versionObj];

          const updatedArtifact: AgentArtifact = {
            ...existing,
            title: payload.title || existing.title,
            mimeType: payload.mimeType,
            currentVersion: Math.max(existing.currentVersion, payload.version),
            versions: updatedVersions,
            updateTime: now,
          };

          const updatedList = [...prev];
          updatedList[existingIdx] = updatedArtifact;
          return updatedList;
        } else {
          const newArtifact: AgentArtifact = {
            id: payload.filename,
            sessionId: activeSessionId || "local",
            userId: "current-user",
            filename: payload.filename,
            title: payload.title || payload.filename,
            mimeType: payload.mimeType,
            currentVersion: payload.version,
            versions: [versionObj],
            createTime: now,
            updateTime: now,
            scope: "session",
          };
          return [...prev, newArtifact];
        }
      });

      // Auto-open canvas and focus on this artifact
      setActiveArtifactId(payload.filename);
      setSelectedVersion(payload.version);
      setIsOpen(true);
    },
    [activeSessionId]
  );

  // Keyboard shortcut listener (Cmd/Ctrl + \ to toggle, Escape to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleCanvas();
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        closeCanvas();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeCanvas, isOpen, toggleCanvas]);

  const value = useMemo<ArtifactContextValue>(
    () => ({
      artifacts,
      activeArtifact,
      activeVersion,
      selectedVersion,
      isOpen,
      activeTab,
      splitRatio,
      isFullscreen,
      isLoading,
      error,
      activeSessionId,
      setActiveSessionId,
      openArtifact,
      closeCanvas,
      toggleCanvas,
      selectVersion,
      setActiveTab,
      setSplitRatio,
      toggleFullscreen,
      refreshArtifacts,
      ingestStreamArtifact,
    }),
    [
      artifacts,
      activeArtifact,
      activeVersion,
      selectedVersion,
      isOpen,
      activeTab,
      splitRatio,
      isFullscreen,
      isLoading,
      error,
      activeSessionId,
      openArtifact,
      closeCanvas,
      toggleCanvas,
      selectVersion,
      setSplitRatio,
      toggleFullscreen,
      refreshArtifacts,
      ingestStreamArtifact,
    ]
  );

  return <ArtifactContext.Provider value={value}>{children}</ArtifactContext.Provider>;
}

export function useArtifacts(): ArtifactContextValue {
  const context = useContext(ArtifactContext);
  if (!context) {
    throw new Error("useArtifacts must be used within an ArtifactProvider");
  }
  return context;
}

export function useOptionalArtifacts(): ArtifactContextValue | undefined {
  return useContext(ArtifactContext);
}
