"use client";

import React, { memo } from "react";
import type { A2UIComponentNode, A2UIPartData } from "@/types/agent";
import { A2UICard } from "./catalog/a2ui-card";
import { A2UIHeading, A2UIText, A2UIBadge, A2UIDivider } from "./catalog/a2ui-typography";
import { A2UIStatMetric } from "./catalog/a2ui-stat-metric";
import { A2UITable } from "./catalog/a2ui-table";
import { A2UIProgressBar, A2UIMiniBarChart } from "./catalog/a2ui-mini-chart";
import { A2UIButton } from "./catalog/a2ui-button";
import { A2UIForm } from "./catalog/a2ui-form";
import {
  A2UITextInput,
  A2UISelectDropdown,
  A2UIRadioGroup,
  A2UISlider,
} from "./catalog/a2ui-inputs";
import { A2UIFallback } from "./a2ui-fallback";

export interface A2UINodeRendererProps {
  node: A2UIComponentNode;
}

export function A2UINodeRenderer({ node }: A2UINodeRendererProps) {
  if (!node || typeof node !== "object") return null;

  const renderChildren = () => {
    if (!node.children) return null;
    if (typeof node.children === "string") return node.children;
    if (Array.isArray(node.children)) {
      return node.children.map((child, idx) => (
        <A2UINodeRenderer key={child.id || `node_${child.type}_${idx}`} node={child} />
      ));
    }
    return null;
  };

  switch (node.type) {
    case "Card":
      return <A2UICard node={node}>{renderChildren()}</A2UICard>;
    case "Column":
      return <div className="flex flex-col space-y-2.5">{renderChildren()}</div>;
    case "Row":
      return (
        <div className="flex flex-row items-center space-x-2.5">{renderChildren()}</div>
      );
    case "Heading":
      return <A2UIHeading node={node}>{renderChildren()}</A2UIHeading>;
    case "Text":
      return <A2UIText node={node}>{renderChildren()}</A2UIText>;
    case "Badge":
      return <A2UIBadge node={node}>{renderChildren()}</A2UIBadge>;
    case "Divider":
      return <A2UIDivider node={node} />;
    case "StatMetric":
      return <A2UIStatMetric node={node} />;
    case "Table":
      return <A2UITable node={node} />;
    case "ProgressBar":
      return <A2UIProgressBar node={node} />;
    case "MiniBarChart":
      return <A2UIMiniBarChart node={node} />;
    case "Button":
      return <A2UIButton node={node} />;
    case "Form":
      return <A2UIForm node={node}>{renderChildren()}</A2UIForm>;
    case "TextInput":
    case "TextField":
      return <A2UITextInput node={node} />;
    case "SelectDropdown":
      return <A2UISelectDropdown node={node} />;
    case "RadioGroup":
    case "MultipleChoice":
      return <A2UIRadioGroup node={node} />;
    case "Slider":
      return <A2UISlider node={node} />;
    default:
      return <A2UIFallback node={node} />;
  }
}

export interface A2UIRendererProps {
  data: A2UIPartData | A2UIComponentNode | A2UIComponentNode[];
}

function A2UIRendererImpl({ data }: A2UIRendererProps) {
  if (!data) return null;

  // If passed an array of nodes
  if (Array.isArray(data)) {
    return (
      <div className="my-2.5 space-y-2.5">
        {data.map((node, idx) => (
          <A2UINodeRenderer key={node.id || `arr_${node.type}_${idx}`} node={node} />
        ))}
      </div>
    );
  }

  // If passed an A2UIPartData structure
  if ("root" in data && data.root) {
    if (Array.isArray(data.root)) {
      return (
        <div className="my-2.5 space-y-2.5">
          {data.root.map((node, idx) => (
            <A2UINodeRenderer key={node.id || `root_${node.type}_${idx}`} node={node} />
          ))}
        </div>
      );
    }
    return <A2UINodeRenderer node={data.root} />;
  }

  // If passed a single node
  if ("type" in data) {
    return <A2UINodeRenderer node={data} />;
  }

  return null;
}

export const A2UIRenderer = memo(A2UIRendererImpl);
