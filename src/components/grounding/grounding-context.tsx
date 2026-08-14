"use client";

import { createContext, useContext, useState, ReactNode, useMemo } from "react";
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

  const inspectRagDoc = (chunk: RetrievedContextChunk) => {
    setSelectedChunk(chunk);
    setIsOpen(true);
  };

  const closeDrawer = () => {
    setIsOpen(false);
  };

  const value = useMemo(
    () => ({
      inspectRagDoc,
      selectedChunk,
      isOpen,
      closeDrawer,
    }),
    [selectedChunk, isOpen]
  );

  return <GroundingContext.Provider value={value}>{children}</GroundingContext.Provider>;
}

export function useGrounding(): GroundingContextValue | null {
  return useContext(GroundingContext);
}
