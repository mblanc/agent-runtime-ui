"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useMemo,
  useCallback,
} from "react";
import type { RetrievedContextChunk } from "@/types/agent";

interface GroundingContextValue {
  inspectRagDoc: (chunk: RetrievedContextChunk) => void;
  selectedChunk: RetrievedContextChunk | null;
  isOpen: boolean;
  closeDrawer: () => void;
}

const GroundingContext = createContext<GroundingContextValue | null>(null);

export function GroundingProvider({ children }: { children: ReactNode }) {
  const [selectedChunk, setSelectedChunk] = useState<RetrievedContextChunk | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const inspectRagDoc = useCallback((chunk: RetrievedContextChunk) => {
    setSelectedChunk(chunk);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      inspectRagDoc,
      selectedChunk,
      isOpen,
      closeDrawer,
    }),
    [inspectRagDoc, selectedChunk, isOpen, closeDrawer]
  );

  return <GroundingContext.Provider value={value}>{children}</GroundingContext.Provider>;
}

export function useGrounding(): GroundingContextValue | null {
  return useContext(GroundingContext);
}
