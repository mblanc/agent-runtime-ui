"use client";

import React, { memo, useCallback } from "react";
import { useAui } from "@assistant-ui/react";
import type { A2UIAction, A2UIComponentNode, A2UIPartData } from "@/types/agent";
import { A2UIProvider } from "./a2ui-context";
import { A2UIRenderer } from "./a2ui-renderer";

export interface A2UIMessagePartProps {
  data: A2UIPartData | A2UIComponentNode | A2UIComponentNode[];
  onAction?: (action: A2UIAction, componentId?: string) => Promise<void> | void;
}

function A2UIMessagePartImpl({ data, onAction }: A2UIMessagePartProps) {
  const aui = useAui();

  const handleAction = useCallback(
    async (action: A2UIAction, componentId?: string) => {
      if (onAction) {
        await onAction(action, componentId);
        return;
      }

      if (aui?.thread?.append) {
        aui.thread.append({
          role: "user",
          content: [
            {
              type: "text",
              text: `[A2UI_ACTION:${JSON.stringify(action)}]`,
            },
          ],
          metadata: {
            custom: {
              a2uiAction: action,
            },
          },
        });
      }
    },
    [aui, onAction]
  );

  return (
    <A2UIProvider onAction={handleAction}>
      <div className="my-3 w-full">
        <A2UIRenderer data={data} />
      </div>
    </A2UIProvider>
  );
}

export const A2UIMessagePart = memo(A2UIMessagePartImpl);
