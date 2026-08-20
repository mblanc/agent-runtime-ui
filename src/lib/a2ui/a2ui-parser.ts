import type {
  A2UIAction,
  A2UIComponentNode,
  A2UIComponentType,
  A2UIPartData,
} from "@/types/agent";

/**
 * Recursively unwraps Google A2UI literal wrapper objects like
 * { literalString: "..." }, { literalNumber: 123 }, { literalBoolean: true }.
 */
export function unwrapLiterals(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val === "object") {
    if (Array.isArray(val)) {
      return val.map(unwrapLiterals);
    }
    const obj = val as Record<string, unknown>;
    if ("literalString" in obj && typeof obj.literalString === "string") {
      return obj.literalString;
    }
    if ("literalNumber" in obj && typeof obj.literalNumber === "number") {
      return obj.literalNumber;
    }
    if ("literalBoolean" in obj && typeof obj.literalBoolean === "boolean") {
      return obj.literalBoolean;
    }
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = unwrapLiterals(v);
    }
    return result;
  }
  return val;
}

/**
 * Validates and normalizes an A2UIAction object.
 */
function sanitizeAction(raw: unknown): A2UIAction | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const event =
    typeof obj.event === "string"
      ? obj.event
      : typeof obj.name === "string"
        ? obj.name
        : "";
  if (!event || !event.trim()) return null;

  return {
    event: event.trim(),
    ...(obj.componentId && typeof obj.componentId === "string"
      ? { componentId: obj.componentId }
      : {}),
    ...(obj.payload && typeof obj.payload === "object" && !Array.isArray(obj.payload)
      ? { payload: obj.payload as Record<string, unknown> }
      : obj.params && typeof obj.params === "object" && !Array.isArray(obj.params)
        ? { payload: obj.params as Record<string, unknown> }
        : {}),
  };
}

/**
 * Recursively validates and normalizes an A2UIComponentNode.
 */
export function sanitizeComponentNode(raw: unknown): A2UIComponentNode {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      type: "A2UIFallback",
      props: { raw: typeof raw === "string" ? raw : JSON.stringify(raw) },
    };
  }

  const obj = raw as Record<string, unknown>;
  const typeStr =
    typeof obj.type === "string" && obj.type.trim() ? obj.type.trim() : "A2UIFallback";
  const idStr = typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : undefined;
  const propsObj =
    obj.props && typeof obj.props === "object" && !Array.isArray(obj.props)
      ? (obj.props as Record<string, unknown>)
      : undefined;

  let sanitizedChildren: A2UIComponentNode[] | string | undefined;
  if (typeof obj.children === "string") {
    sanitizedChildren = obj.children;
  } else if (Array.isArray(obj.children)) {
    sanitizedChildren = obj.children.map(sanitizeComponentNode);
  } else if (obj.children && typeof obj.children === "object") {
    sanitizedChildren = [sanitizeComponentNode(obj.children)];
  }

  let sanitizedActions: A2UIAction[] | undefined;
  if (Array.isArray(obj.actions)) {
    const validActions = obj.actions
      .map(sanitizeAction)
      .filter((a): a is A2UIAction => a !== null);
    if (validActions.length > 0) {
      sanitizedActions = validActions;
    }
  }

  return {
    type: typeStr as A2UIComponentType,
    ...(idStr ? { id: idStr } : {}),
    ...(propsObj ? { props: propsObj } : {}),
    ...(sanitizedChildren !== undefined ? { children: sanitizedChildren } : {}),
    ...(sanitizedActions ? { actions: sanitizedActions } : {}),
  };
}

interface FlatComponentItem {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

/**
 * Resolves Google A2UI flat components list into a hierarchical component tree.
 */
function parseGoogleFlatA2UI(obj: Record<string, unknown>): A2UIComponentNode | null {
  if (!Array.isArray(obj.components) || obj.components.length === 0) {
    return null;
  }

  const componentMap = new Map<string, FlatComponentItem>();

  for (const item of obj.components) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || "");
    if (!id) continue;

    let compType = "";
    let compProps: Record<string, unknown> = {};

    if (item.component && typeof item.component === "object") {
      const keys = Object.keys(item.component);
      if (keys.length > 0) {
        compType = keys[0];
        compProps = (item.component[compType] as Record<string, unknown>) || {};
      }
    } else if (typeof item.type === "string") {
      compType = item.type;
      compProps = (item.props as Record<string, unknown>) || item;
    }

    if (compType) {
      componentMap.set(id, {
        id,
        type: compType,
        props: unwrapLiterals(compProps) as Record<string, unknown>,
      });
    }
  }

  if (componentMap.size === 0) return null;

  const rootId =
    typeof obj.root === "string"
      ? obj.root
      : obj.components[obj.components.length - 1]?.id;
  let candidateId: string | undefined;
  if (!rootId || !componentMap.has(rootId)) {
    // If no explicit root, pick the first Card, Form, Column, or last component
    candidateId =
      Array.from(componentMap.keys()).find((k) => {
        const t = componentMap.get(k)?.type;
        return t === "Card" || t === "Form" || t === "Column";
      }) || Array.from(componentMap.keys())[componentMap.size - 1];
  }

  const effectiveRootId =
    rootId && componentMap.has(rootId)
      ? rootId
      : candidateId || Array.from(componentMap.keys())[0];

  let detectedSubmitAction: A2UIAction | undefined;

  function resolveNode(id: string, visited = new Set<string>()): A2UIComponentNode {
    if (visited.has(id)) {
      return { type: "A2UIFallback", props: { error: `Circular reference on ${id}` } };
    }
    visited.add(id);

    const comp = componentMap.get(id);
    if (!comp) {
      return { type: "A2UIFallback", props: { error: `Missing component id: ${id}` } };
    }

    const { type, props } = comp;

    function getChildIds(compProps: Record<string, unknown>): string[] {
      if (Array.isArray(compProps.children)) {
        return compProps.children as string[];
      }
      if (typeof compProps.child === "string") {
        return [compProps.child];
      }
      return [];
    }

    switch (type) {
      case "Text": {
        const textContent = String(props.text ?? "");
        const variant = String(props.variant || "body");
        if (variant === "h1" || variant === "h2" || variant === "h3") {
          const level = variant === "h1" ? 1 : variant === "h2" ? 2 : 3;
          return {
            type: "Heading",
            id,
            props: { level },
            children: textContent,
          };
        }
        return {
          type: "Text",
          id,
          props: { variant },
          children: textContent,
        };
      }

      case "TextField": {
        const label = typeof props.label === "string" ? props.label : undefined;
        const text = typeof props.text === "string" ? props.text : "";
        const inputType =
          props.textFieldType === "number"
            ? "number"
            : props.textFieldType === "email"
              ? "email"
              : props.textFieldType === "password"
                ? "password"
                : "text";
        return {
          type: "TextInput",
          id,
          props: {
            name: id,
            label,
            defaultValue: text,
            placeholder: typeof props.placeholder === "string" ? props.placeholder : "",
            inputType,
          },
        };
      }

      case "MultipleChoice": {
        const label = typeof props.label === "string" ? props.label : undefined;
        const rawOptions = Array.isArray(props.options) ? props.options : [];
        const options = rawOptions.map((opt) => {
          if (typeof opt === "string") return { label: opt, value: opt };
          return {
            label: String(opt.label ?? opt.value ?? ""),
            value: String(opt.value ?? opt.label ?? ""),
          };
        });

        return {
          type: "RadioGroup",
          id,
          props: {
            name: id,
            label,
            options,
            defaultValue: options[0]?.value,
          },
        };
      }

      case "Slider": {
        const label = typeof props.label === "string" ? props.label : undefined;
        const minValue = typeof props.minValue === "number" ? props.minValue : 0;
        const maxValue = typeof props.maxValue === "number" ? props.maxValue : 100;
        const value = typeof props.value === "number" ? props.value : minValue;

        return {
          type: "Slider",
          id,
          props: {
            name: id,
            label,
            minValue,
            maxValue,
            value,
            defaultValue: value,
          },
        };
      }

      case "Button": {
        let label = "Submit";
        if (typeof props.child === "string") {
          const childComp = componentMap.get(props.child);
          if (childComp && childComp.type === "Text") {
            label = String(childComp.props.text || "Submit");
          }
        } else if (typeof props.label === "string") {
          label = props.label;
        }

        const actionObj = props.action as Record<string, unknown> | undefined;
        const actionEvent = String(actionObj?.name || actionObj?.event || "submit");
        const actionPayload = (actionObj?.params || actionObj?.payload || {}) as Record<
          string,
          unknown
        >;

        const action: A2UIAction = {
          event: actionEvent,
          payload: actionPayload,
          componentId: id,
        };

        if (
          actionEvent.includes("submit") ||
          props.primary === true ||
          label.toLowerCase().includes("submit")
        ) {
          detectedSubmitAction = action;
        }

        return {
          type: "Button",
          id,
          props: {
            label,
            variant: props.primary === false ? "secondary" : "primary",
            type: actionEvent.includes("submit") ? "submit" : "button",
          },
          actions: [action],
        };
      }

      case "Column":
      case "Container": {
        const resolvedChildren = getChildIds(props).map((cId) =>
          resolveNode(cId, new Set(visited))
        );
        return {
          type: "Column",
          id,
          props: {
            title: typeof props.title === "string" ? props.title : undefined,
          },
          children: resolvedChildren,
        };
      }

      case "Row": {
        const resolvedChildren = getChildIds(props).map((cId) =>
          resolveNode(cId, new Set(visited))
        );
        return {
          type: "Row",
          id,
          props: {
            title: typeof props.title === "string" ? props.title : undefined,
          },
          children: resolvedChildren,
        };
      }

      case "Card": {
        const resolvedChildren = getChildIds(props).map((cId) =>
          resolveNode(cId, new Set(visited))
        );
        return {
          type: "Card",
          id,
          props: {
            title:
              typeof props.title === "string"
                ? props.title
                : typeof obj.title === "string"
                  ? (obj.title as string)
                  : undefined,
            status: typeof props.status === "string" ? props.status : undefined,
          },
          children: resolvedChildren,
        };
      }

      default: {
        const resolvedChildren = getChildIds(props).map((cId) =>
          resolveNode(cId, new Set(visited))
        );
        return {
          type: type as A2UIComponentType,
          id,
          props,
          ...(resolvedChildren.length > 0 ? { children: resolvedChildren } : {}),
        };
      }
    }
  }

  const resolvedRoot = resolveNode(effectiveRootId);

  // If the top-level A2UI schema declared "type": "Form" or a submit action exists,
  // wrap in a Form container so input fields submit together cleanly.
  if (obj.type === "Form" || detectedSubmitAction) {
    return {
      type: "Form",
      id: "a2ui_form",
      actions: [
        detectedSubmitAction || {
          event: "submit_form",
          payload: {},
          componentId: "a2ui_form",
        },
      ],
      children: [resolvedRoot],
    };
  }

  return resolvedRoot;
}

/**
 * Checks if a payload resembles an A2UI structure.
 */
export function isA2UIPayload(raw: unknown): boolean {
  if (!raw) return false;

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return isA2UIPayload(parsed);
    } catch {
      return false;
    }
  }

  if (typeof raw !== "object") return false;

  if (Array.isArray(raw)) {
    return (
      raw.length > 0 &&
      raw.every(
        (item) =>
          item && typeof item === "object" && ("type" in item || "component" in item)
      )
    );
  }

  const obj = raw as Record<string, unknown>;
  if (obj.a2ui || obj.a2uiData || obj.a2ui_data) return true;
  if ("components" in obj && Array.isArray(obj.components)) return true;
  if ("root" in obj && obj.root) return true;
  if (typeof obj.type === "string" && obj.type.trim().length > 0) return true;

  return false;
}

/**
 * Parses and sanitizes raw input into validated A2UIPartData.
 * Returns null if the payload is invalid or empty.
 */
export function parseA2UIPayload(raw: unknown): A2UIPartData | null {
  if (!raw) return null;

  let data = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return null;
    }
    try {
      data = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  if (!data || typeof data !== "object") return null;

  // Handle wrappers: { a2ui: ... } or { a2uiData: ... } or { a2ui_data: ... }
  const obj = data as Record<string, unknown>;
  const unwrapped = (obj.a2ui || obj.a2uiData || obj.a2ui_data || data) as Record<
    string,
    unknown
  >;

  // Check if it is a Google flat A2UI structure with `components`
  if ("components" in unwrapped && Array.isArray(unwrapped.components)) {
    const flatTree = parseGoogleFlatA2UI(unwrapped);
    if (flatTree) {
      return {
        version: typeof unwrapped.version === "string" ? unwrapped.version : "0.9",
        root: flatTree,
      };
    }
  }

  if (Array.isArray(unwrapped)) {
    if (unwrapped.length === 0) return null;
    return {
      version: typeof obj.version === "string" ? obj.version : "0.9",
      root: unwrapped.map(sanitizeComponentNode),
    };
  }

  if (typeof unwrapped !== "object" || unwrapped === null) return null;

  const version =
    typeof unwrapped.version === "string"
      ? unwrapped.version
      : typeof obj.version === "string"
        ? obj.version
        : "0.9";

  if ("root" in unwrapped && unwrapped.root) {
    if (Array.isArray(unwrapped.root)) {
      return {
        version,
        root: unwrapped.root.map(sanitizeComponentNode),
      };
    }
    if (typeof unwrapped.root === "string" && "components" in unwrapped) {
      const flatTree = parseGoogleFlatA2UI(unwrapped);
      if (flatTree) {
        return { version, root: flatTree };
      }
    }
    if (typeof unwrapped.root === "object") {
      return {
        version,
        root: sanitizeComponentNode(unwrapped.root),
      };
    }
  }

  // If the object itself has a `type` property, treat it as a single root node
  if (typeof unwrapped.type === "string" && unwrapped.type.trim()) {
    return {
      version,
      root: sanitizeComponentNode(unwrapped),
    };
  }

  return null;
}

/**
 * Extracts a balanced JSON object or array slice from a string.
 */
function extractJsonSlice(str: string): { jsonStr: string; endIndex: number } | null {
  const startIdx = str.search(/[{\[]/);
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < str.length; i++) {
    const char = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{" || char === "[") {
        depth++;
      } else if (char === "}" || char === "]") {
        depth--;
        if (depth === 0) {
          return {
            jsonStr: str.substring(startIdx, i + 1),
            endIndex: i + 1,
          };
        }
      }
    }
  }
  return null;
}

/**
 * Extracts an embedded A2UI payload from message text (e.g. `---a2ui_JSON--- {...}`
 * or ```` ```a2ui\n{...}\n``` ````) and returns both the parsed A2UI data and clean text.
 */
export function extractA2UIFromContent(text: string): {
  a2ui: A2UIPartData | null;
  cleanText: string;
} {
  if (!text) {
    return { a2ui: null, cleanText: text };
  }

  // 1. Match `---a2ui_JSON---`
  const delimiterIdx = text.search(/---a2ui_JSON---/i);
  if (delimiterIdx !== -1) {
    const afterDelimiter = text.substring(delimiterIdx + "---a2ui_JSON---".length);
    const jsonSlice = extractJsonSlice(afterDelimiter);
    if (jsonSlice) {
      const parsed = parseA2UIPayload(jsonSlice.jsonStr);
      if (parsed) {
        const prefix = text.substring(0, delimiterIdx).trim();
        const suffix = afterDelimiter.substring(jsonSlice.endIndex).trim();
        const cleanText = [prefix, suffix].filter(Boolean).join("\n\n");
        return { a2ui: parsed, cleanText };
      }
    }
  }

  // 2. Match ```` ```a2ui\n{...}\n``` ```` or ```` ```json:a2ui\n{...}\n``` ````
  const fenceMatch = text.match(/```(?:a2ui|json:a2ui)\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    const rawJson = fenceMatch[1].trim();
    const parsed = parseA2UIPayload(rawJson);
    if (parsed) {
      const cleanText = text.replace(fenceMatch[0], "").trim();
      return { a2ui: parsed, cleanText };
    }
  }

  // 3. Match `<!-- a2ui_start -->{...}<!-- a2ui_end -->`
  const tagMatch = text.match(/<!--\s*a2ui_start\s*-->([\s\S]*?)<!--\s*a2ui_end\s*-->/i);
  if (tagMatch) {
    const rawJson = tagMatch[1].trim();
    const parsed = parseA2UIPayload(rawJson);
    if (parsed) {
      const cleanText = text.replace(tagMatch[0], "").trim();
      return { a2ui: parsed, cleanText };
    }
  }

  return { a2ui: null, cleanText: text };
}

/**
 * Extracts a plain text representation of an A2UI component tree.
 */
export function flattenA2UIText(
  node: A2UIComponentNode | A2UIComponentNode[] | string | undefined
): string {
  if (!node) return "";
  if (typeof node === "string") return node;

  if (Array.isArray(node)) {
    return node.map(flattenA2UIText).filter(Boolean).join(" ");
  }

  const parts: string[] = [];

  if (node.props) {
    if (typeof node.props.title === "string") parts.push(node.props.title);
    if (typeof node.props.label === "string") parts.push(node.props.label);
    if (typeof node.props.value === "string") parts.push(node.props.value);
    if (typeof node.props.description === "string") parts.push(node.props.description);
  }

  if (node.children) {
    parts.push(flattenA2UIText(node.children));
  }

  return parts.filter(Boolean).join(" ");
}
