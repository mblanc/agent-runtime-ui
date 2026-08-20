"use client";

import React, { useState, useMemo, useCallback } from "react";
import type { A2UIAction, A2UIComponentNode } from "@/types/agent";
import { useA2UI } from "../a2ui-context";
import { A2UIFormContext } from "./a2ui-inputs";

export interface A2UIFormProps {
  node: A2UIComponentNode;
  children?: React.ReactNode;
}

export function A2UIForm({ node, children }: A2UIFormProps) {
  const {
    dispatchAction,
    isSubmitting,
    isSubmitted,
    disabled: contextDisabled,
  } = useA2UI();
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    return (node.props?.initialValues as Record<string, unknown>) || {};
  });

  const componentId = node.id || "form";
  const action: A2UIAction | undefined = node.actions?.[0];
  const submitting = isSubmitting(componentId);
  const submitted = isSubmitted(componentId);
  const disabled =
    contextDisabled || Boolean(node.props?.disabled) || submitting || submitted;

  const setValue = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const registerDefaultValue = useCallback((name: string, value: unknown) => {
    setValues((prev) => {
      if (prev[name] !== undefined) return prev;
      return { ...prev, [name]: value };
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || !action) return;

    const aggregatedPayload = {
      ...(action.payload || {}),
      ...values,
    };

    await dispatchAction(
      {
        event: action.event || "form_submit",
        payload: aggregatedPayload,
        componentId,
      },
      componentId
    );
  };

  const formCtxValue = useMemo(
    () => ({
      values,
      setValue,
      registerDefaultValue,
      disabled,
    }),
    [values, setValue, registerDefaultValue, disabled]
  );

  return (
    <A2UIFormContext.Provider value={formCtxValue}>
      <form id={node.id} onSubmit={handleSubmit} className="my-2.5 space-y-3">
        {children}
      </form>
    </A2UIFormContext.Provider>
  );
}
