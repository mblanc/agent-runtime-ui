/**
 * A2UI (Agent-to-UI / Generative UI Streaming) Type Contracts
 * Protocol MIME type: application/json+a2ui
 */

export type A2UIComponentType =
  | "Card"
  | "Column"
  | "Row"
  | "Heading"
  | "Text"
  | "Badge"
  | "Button"
  | "Divider"
  | "StatMetric"
  | "Form"
  | "TextInput"
  | "TextField"
  | "SelectDropdown"
  | "RadioGroup"
  | "MultipleChoice"
  | "Slider"
  | "Table"
  | "ProgressBar"
  | "MiniBarChart"
  | (string & {});

export interface A2UIAction {
  event: string; // e.g. "submit_approval", "select_option", "form_submit"
  payload?: Record<string, unknown>;
  componentId?: string;
}

export interface A2UIComponentNode {
  type: A2UIComponentType;
  id?: string;
  props?: Record<string, unknown>;
  children?: A2UIComponentNode[] | string;
  actions?: A2UIAction[];
}

export interface A2UIPartData {
  version?: "0.8" | "0.9" | string;
  root: A2UIComponentNode | A2UIComponentNode[];
}

export interface AgentA2UIActionPayload {
  componentId?: string;
  event: string;
  payload?: Record<string, unknown>;
}
