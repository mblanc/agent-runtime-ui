import type {
  SessionStateDeltaItem,
  SessionStateMap,
  SessionStateValue,
} from "@/types/agent";

export type SessionStateType =
  "string" | "number" | "boolean" | "array" | "object" | "null";

/**
 * Infers the high-level JSON data type of a session state variable value.
 */
export function inferValueType(val: unknown): SessionStateType {
  if (val === null || val === undefined) return "null";
  if (Array.isArray(val)) return "array";
  if (typeof val === "boolean") return "boolean";
  if (typeof val === "number") return "number";
  if (typeof val === "string") return "string";
  if (typeof val === "object") return "object";
  return "string";
}

/**
 * Computes structural differences between two session state snapshots.
 */
export function computeStateDelta(
  oldState: SessionStateMap = {},
  newState: SessionStateMap = {}
): SessionStateDeltaItem[] {
  const allKeys = new Set([...Object.keys(oldState), ...Object.keys(newState)]);
  const deltas: SessionStateDeltaItem[] = [];

  for (const key of allKeys) {
    const inOld = Object.prototype.hasOwnProperty.call(oldState, key);
    const inNew = Object.prototype.hasOwnProperty.call(newState, key);

    if (!inOld && inNew) {
      deltas.push({
        key,
        newValue: newState[key],
        action: "added",
      });
    } else if (inOld && !inNew) {
      deltas.push({
        key,
        previousValue: oldState[key],
        newValue: null,
        action: "deleted",
      });
    } else if (inOld && inNew) {
      const oldVal = oldState[key];
      const newVal = newState[key];
      const hasChanged =
        typeof oldVal === "object" || typeof newVal === "object"
          ? JSON.stringify(oldVal) !== JSON.stringify(newVal)
          : oldVal !== newVal;

      if (hasChanged) {
        deltas.push({
          key,
          previousValue: oldVal,
          newValue: newVal,
          action: "updated",
        });
      }
    }
  }

  return deltas.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Safely parses string input into a structured SessionStateValue (JSON or primitive).
 */
export function parseStateInputValue(raw: string): SessionStateValue {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (
    !isNaN(Number(trimmed)) &&
    trimmed !== "" &&
    !/^0\d+/.test(trimmed) // Not octal / leading zeroes
  ) {
    return Number(trimmed);
  }
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed) as SessionStateValue;
    } catch {
      return trimmed;
    }
  }
  return raw;
}
