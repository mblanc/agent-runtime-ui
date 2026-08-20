"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { A2UIAction } from "@/types/agent";

export interface A2UIContextValue {
  onAction?: (action: A2UIAction, componentId?: string) => Promise<void> | void;
  disabled?: boolean;
  isSubmitting: (componentId?: string) => boolean;
  isSubmitted: (componentId?: string) => boolean;
  getSubmittedAction: (componentId?: string) => A2UIAction | undefined;
  dispatchAction: (action: A2UIAction, componentId?: string) => Promise<void>;
}

const A2UIContext = createContext<A2UIContextValue | null>(null);

export interface A2UIProviderProps {
  children: React.ReactNode;
  onAction?: (action: A2UIAction, componentId?: string) => Promise<void> | void;
  disabled?: boolean;
}

export function A2UIProvider({
  children,
  onAction,
  disabled = false,
}: A2UIProviderProps) {
  const [submittingIds, setSubmittingIds] = useState<Set<string>>(() => new Set());
  const [submittedActions, setSubmittedActions] = useState<Map<string, A2UIAction>>(
    () => new Map()
  );

  const isSubmitting = useCallback(
    (componentId?: string) => {
      if (!componentId) return false;
      return submittingIds.has(componentId);
    },
    [submittingIds]
  );

  const isSubmitted = useCallback(
    (componentId?: string) => {
      if (!componentId) return false;
      return submittedActions.has(componentId);
    },
    [submittedActions]
  );

  const getSubmittedAction = useCallback(
    (componentId?: string) => {
      if (!componentId) return undefined;
      return submittedActions.get(componentId);
    },
    [submittedActions]
  );

  const dispatchAction = useCallback(
    async (action: A2UIAction, componentId?: string) => {
      const id = componentId || action.componentId || `action_${Date.now()}`;
      if (disabled || submittingIds.has(id) || submittedActions.has(id)) {
        return;
      }

      setSubmittingIds((prev) => new Set(prev).add(id));
      try {
        if (onAction) {
          await onAction(action, id);
        }
        setSubmittedActions((prev) => new Map(prev).set(id, action));
      } finally {
        setSubmittingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [disabled, onAction, submittingIds, submittedActions]
  );

  const value = useMemo(
    () => ({
      onAction,
      disabled,
      isSubmitting,
      isSubmitted,
      getSubmittedAction,
      dispatchAction,
    }),
    [onAction, disabled, isSubmitting, isSubmitted, getSubmittedAction, dispatchAction]
  );

  return <A2UIContext.Provider value={value}>{children}</A2UIContext.Provider>;
}

export function useA2UI(): A2UIContextValue {
  const ctx = useContext(A2UIContext);
  if (!ctx) {
    // Return a safe inert context if rendered outside A2UIProvider
    return {
      disabled: false,
      isSubmitting: () => false,
      isSubmitted: () => false,
      getSubmittedAction: () => undefined,
      dispatchAction: async () => {},
    };
  }
  return ctx;
}
