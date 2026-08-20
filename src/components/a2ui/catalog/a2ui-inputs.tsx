"use client";

import React, { createContext, useContext } from "react";
import type { A2UIComponentNode } from "@/types/agent";
import { cn } from "@/lib/utils";
import { useA2UI } from "../a2ui-context";

export interface A2UIFormContextValue {
  values: Record<string, unknown>;
  setValue: (name: string, value: unknown) => void;
  registerDefaultValue?: (name: string, value: unknown) => void;
  disabled?: boolean;
}

export const A2UIFormContext = createContext<A2UIFormContextValue | null>(null);

export interface A2UIInputProps {
  node: A2UIComponentNode;
}

function useFormDefaultValue(
  formCtx: A2UIFormContextValue | null,
  name: string,
  defaultValue: unknown
) {
  React.useEffect(() => {
    if (
      formCtx?.registerDefaultValue &&
      defaultValue !== undefined &&
      defaultValue !== ""
    ) {
      formCtx.registerDefaultValue(name, defaultValue);
    }
  }, [formCtx, name, defaultValue]);
}

export function A2UITextInput({ node }: A2UIInputProps) {
  const formCtx = useContext(A2UIFormContext);
  const { disabled: a2uiDisabled } = useA2UI();

  const name = String(node.props?.name || node.id || "input");
  const label = typeof node.props?.label === "string" ? node.props.label : undefined;
  const placeholder =
    typeof node.props?.placeholder === "string" ? node.props.placeholder : "";
  const inputType =
    typeof node.props?.inputType === "string" ? node.props.inputType : "text";
  const defaultValue = node.props?.defaultValue ?? node.props?.value ?? "";
  const disabled = a2uiDisabled || formCtx?.disabled || Boolean(node.props?.disabled);

  useFormDefaultValue(formCtx, name, defaultValue);

  const value = formCtx?.values[name] !== undefined ? formCtx.values[name] : defaultValue;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (formCtx) {
      formCtx.setValue(name, e.target.value);
    }
  };

  return (
    <div id={node.id} className="my-2 space-y-1.5 text-xs">
      {label && <label className="block font-medium text-foreground">{label}</label>}
      <input
        type={inputType}
        name={name}
        value={String(value)}
        placeholder={placeholder}
        disabled={disabled}
        onChange={handleChange}
        className={cn(
          "w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors",
          "focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] dark:focus:border-[#8ab4f8] dark:focus:ring-[#8ab4f8]",
          "disabled:cursor-not-allowed disabled:opacity-60"
        )}
      />
    </div>
  );
}

export interface SelectOption {
  label: string;
  value: string;
}

export function A2UISelectDropdown({ node }: A2UIInputProps) {
  const formCtx = useContext(A2UIFormContext);
  const { disabled: a2uiDisabled } = useA2UI();

  const name = String(node.props?.name || node.id || "select");
  const label = typeof node.props?.label === "string" ? node.props.label : undefined;
  const options = Array.isArray(node.props?.options)
    ? (node.props.options as (SelectOption | string)[])
    : [];
  const firstOptionValue =
    options.length > 0
      ? typeof options[0] === "string"
        ? options[0]
        : options[0].value
      : "";
  const defaultValue = String(
    node.props?.defaultValue ?? node.props?.value ?? firstOptionValue
  );
  const disabled = a2uiDisabled || formCtx?.disabled || Boolean(node.props?.disabled);

  useFormDefaultValue(formCtx, name, defaultValue);

  const value =
    formCtx?.values[name] !== undefined ? String(formCtx.values[name]) : defaultValue;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (formCtx) {
      formCtx.setValue(name, e.target.value);
    }
  };

  return (
    <div id={node.id} className="my-2 space-y-1.5 text-xs">
      {label && <label className="block font-medium text-foreground">{label}</label>}
      <select
        name={name}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        className={cn(
          "w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition-colors",
          "focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] dark:focus:border-[#8ab4f8] dark:focus:ring-[#8ab4f8]",
          "disabled:cursor-not-allowed disabled:opacity-60"
        )}
      >
        {options.map((opt, idx) => {
          const optValue = typeof opt === "string" ? opt : opt.value;
          const optLabel = typeof opt === "string" ? opt : opt.label;
          return (
            <option key={idx} value={optValue}>
              {optLabel}
            </option>
          );
        })}
      </select>
    </div>
  );
}

export function A2UIRadioGroup({ node }: A2UIInputProps) {
  const formCtx = useContext(A2UIFormContext);
  const { disabled: a2uiDisabled } = useA2UI();

  const name = String(node.props?.name || node.id || "radio");
  const label = typeof node.props?.label === "string" ? node.props.label : undefined;
  const options = Array.isArray(node.props?.options)
    ? (node.props.options as (SelectOption | string)[])
    : [];
  const defaultValue = String(node.props?.defaultValue ?? node.props?.value ?? "");
  const disabled = a2uiDisabled || formCtx?.disabled || Boolean(node.props?.disabled);

  useFormDefaultValue(formCtx, name, defaultValue);

  const selectedValue = formCtx
    ? String(formCtx.values[name] ?? defaultValue)
    : defaultValue;

  const handleChange = (val: string) => {
    if (formCtx && !disabled) {
      formCtx.setValue(name, val);
    }
  };

  return (
    <div id={node.id} className="my-2 space-y-1.5 text-xs">
      {label && <label className="block font-medium text-foreground">{label}</label>}
      <div className="space-y-1.5">
        {options.map((opt, idx) => {
          const optValue = typeof opt === "string" ? opt : opt.value;
          const optLabel = typeof opt === "string" ? opt : opt.label;
          const isChecked = selectedValue === optValue;

          return (
            <label
              key={idx}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 transition-colors cursor-pointer",
                isChecked &&
                  "border-[#1a73e8] bg-[#1a73e8]/5 dark:border-[#8ab4f8] dark:bg-[#8ab4f8]/10",
                disabled && "cursor-not-allowed opacity-60"
              )}
            >
              <input
                type="radio"
                name={name}
                value={optValue}
                checked={isChecked}
                disabled={disabled}
                onChange={() => handleChange(optValue)}
                className="text-[#1a73e8] focus:ring-[#1a73e8]"
              />
              <span className="text-foreground">{optLabel}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function A2UISlider({ node }: A2UIInputProps) {
  const formCtx = useContext(A2UIFormContext);
  const { disabled: a2uiDisabled } = useA2UI();

  const name = String(node.props?.name || node.id || "slider");
  const label = typeof node.props?.label === "string" ? node.props.label : undefined;
  const min =
    typeof node.props?.minValue === "number"
      ? node.props.minValue
      : typeof node.props?.min === "number"
        ? node.props.min
        : 0;
  const max =
    typeof node.props?.maxValue === "number"
      ? node.props.maxValue
      : typeof node.props?.max === "number"
        ? node.props.max
        : 100;
  const step = typeof node.props?.step === "number" ? node.props.step : 1;
  const defaultValue =
    typeof node.props?.value === "number"
      ? node.props.value
      : typeof node.props?.defaultValue === "number"
        ? node.props.defaultValue
        : min;
  const disabled = a2uiDisabled || formCtx?.disabled || Boolean(node.props?.disabled);

  useFormDefaultValue(formCtx, name, defaultValue);

  const [localVal, setLocalVal] = React.useState<number>(Number(defaultValue));
  const currentVal =
    formCtx?.values[name] !== undefined ? Number(formCtx.values[name]) : localVal;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = Number(e.target.value);
    setLocalVal(num);
    if (formCtx) {
      formCtx.setValue(name, num);
    }
  };

  return (
    <div id={node.id} className="my-2 space-y-1.5 text-xs">
      <div className="flex justify-between items-center">
        {label && <label className="font-medium text-foreground">{label}</label>}
        <span className="font-mono text-[11px] text-muted-foreground">{currentVal}</span>
      </div>
      <input
        type="range"
        name={name}
        min={min}
        max={max}
        step={step}
        value={currentVal}
        disabled={disabled}
        onChange={handleChange}
        className="w-full accent-[#1a73e8] dark:accent-[#8ab4f8] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}
