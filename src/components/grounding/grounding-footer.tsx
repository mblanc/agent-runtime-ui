"use client";

import { useState } from "react";
import type { GroundingMetadata, RetrievedContextChunk } from "@/types/agent";
import { isGrounded } from "@/lib/grounding/citation-parser";
import { GroundingSourcesAccordion } from "./grounding-sources-accordion";
import { GoogleSearchWidget } from "./google-search-widget";
import { EnterpriseRagDrawer } from "./enterprise-rag-drawer";
import { useGrounding } from "./grounding-context";
import { cn } from "@/lib/utils";

interface GroundingFooterProps {
  metadata?: GroundingMetadata;
  className?: string;
}

export function GroundingFooter({ metadata, className }: GroundingFooterProps) {
  const grounding = useGrounding();
  const [localSelectedRagChunk, setLocalSelectedRagChunk] =
    useState<RetrievedContextChunk | null>(null);
  const [localIsRagDrawerOpen, setLocalIsRagDrawerOpen] = useState(false);

  if (!metadata || !isGrounded(metadata)) {
    return null;
  }

  const isDrawerOpen = grounding ? grounding.isOpen : localIsRagDrawerOpen;
  const selectedChunk = grounding ? grounding.selectedChunk : localSelectedRagChunk;
  const handleCloseDrawer = grounding
    ? grounding.closeDrawer
    : () => setLocalIsRagDrawerOpen(false);
  const handleInspectRagDoc = grounding
    ? grounding.inspectRagDoc
    : (chunk: RetrievedContextChunk) => {
        setLocalSelectedRagChunk(chunk);
        setLocalIsRagDrawerOpen(true);
      };

  return (
    <div className={cn("mt-3 flex flex-col space-y-1 w-full", className)}>
      <GroundingSourcesAccordion
        metadata={metadata}
        onInspectRagDoc={handleInspectRagDoc}
      />

      <GoogleSearchWidget searchEntryPoint={metadata.searchEntryPoint} />

      {isDrawerOpen && (
        <EnterpriseRagDrawer
          isOpen={isDrawerOpen}
          onClose={handleCloseDrawer}
          chunk={selectedChunk}
        />
      )}
    </div>
  );
}
