"use client";

import React, { useState, useContext } from "react";
import type { A2UIAction, A2UIComponentNode } from "@/types/agent";
import { cn } from "@/lib/utils";
import { useA2UI } from "../a2ui-context";
import { A2UIFormContext } from "./a2ui-inputs";
import { Loader2, Check } from "lucide-react";

export interface A2UIButtonProps {
  node: A2UIComponentNode;
  onClick?: () => void;
}

export function A2UIButton({ node, onClick }: A2UIButtonProps) {
  const formCtx = useContext(A2UIFormContext);
  const {
    dispatchAction,
    isSubmitting,
    isSubmitted,
    disabled: contextDisabled,
  } = useA2UI();
  const [localClicked, setLocalClicked] = useState(false);

  const label =
    typeof node.props?.label === "string"
      ? node.props.label
      : typeof node.children === "string"
        ? node.children
        : "Submit";
  const variant = String(node.props?.variant || "primary");
  const componentId = node.id || node.actions?.[0]?.componentId;
  const action: A2UIAction | undefined = node.actions?.[0];

  const isSubmitInForm = Boolean(
    formCtx && (node.props?.type === "submit" || action?.event?.includes("submit"))
  );
  const submitting =
    isSubmitting(componentId) || (isSubmitInForm && isSubmitting("a2ui_form"));
  const submitted =
    isSubmitted(componentId) ||
    (isSubmitInForm && isSubmitted("a2ui_form")) ||
    localClicked;
  const isDisabled =
    contextDisabled ||
    formCtx?.disabled ||
    Boolean(node.props?.disabled) ||
    submitting ||
    submitted;

  const handleClick = async () => {
    if (isDisabled) return;

    if (onClick) {
      onClick();
      return;
    }

    // When inside a form and configured as a submit button, let the HTML form
    // submit event trigger A2UIForm.handleSubmit to aggregate input values.
    if (isSubmitInForm) {
      return;
    }

    if (action) {
      setLocalClicked(true);
      await dispatchAction(action, componentId);
    }
  };

  const variantClasses: Record<string, string> = {
    primary:
      "bg-[#0b57d0] text-white hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:text-[#062e6f] dark:hover:bg-[#8ab4f8]",
    secondary:
      "bg-[#f0f4f9] text-[#1f1f1f] hover:bg-[#e3e3e3] dark:bg-[#282a2c] dark:text-[#e3e3e3] dark:hover:bg-[#3c4043]",
    outline: "border border-border bg-transparent text-foreground hover:bg-muted/50",
    destructive:
      "bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-800",
  };

  return (
    <button
      id={node.id}
      type={node.props?.type === "submit" ? "submit" : "button"}
      disabled={isDisabled}
      onClick={handleClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-all",
        "active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
        variantClasses[variant] || variantClasses.primary
      )}
    >
      {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {submitted && !submitting && (
        <Check className="h-3.5 w-3.5 text-emerald-400 dark:text-emerald-600" />
      )}
      <span>{submitted && !submitting ? `${label} (Submitted)` : label}</span>
    </button>
  );
}
