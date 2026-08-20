import { describe, it, expect } from "vitest";
import {
  parseA2UIPayload,
  isA2UIPayload,
  flattenA2UIText,
  extractA2UIFromContent,
} from "@/lib/a2ui/a2ui-parser";
import type { A2UIComponentNode, A2UIPartData } from "@/types/agent";

describe("A2UI Tree Parser & Normalizer", () => {
  it("parses valid A2UIPartData with root object", () => {
    const raw: A2UIPartData = {
      version: "0.8",
      root: {
        type: "Card",
        id: "card_1",
        props: { title: "Deployment Plan" },
        children: [
          {
            type: "Heading",
            props: { level: 2 },
            children: "Cloud Run Config",
          },
          {
            type: "Button",
            id: "btn_deploy",
            props: { label: "Approve & Deploy", variant: "primary" },
            actions: [{ event: "submit_approval", payload: { approved: true } }],
          },
        ],
      },
    };

    const parsed = parseA2UIPayload(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe("0.8");
    expect(Array.isArray(parsed?.root)).toBe(false);
    const rootNode = parsed?.root as A2UIComponentNode;
    expect(rootNode.type).toBe("Card");
    expect(rootNode.id).toBe("card_1");
    expect(Array.isArray(rootNode.children)).toBe(true);
    expect((rootNode.children as A2UIComponentNode[]).length).toBe(2);
  });

  it("parses stringified JSON payload", () => {
    const jsonStr = JSON.stringify({
      version: "0.9",
      root: {
        type: "StatMetric",
        props: { label: "CPU Usage", value: "42%", change: "+5%" },
      },
    });

    const parsed = parseA2UIPayload(jsonStr);
    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe("0.9");
    const root = parsed?.root as A2UIComponentNode;
    expect(root.type).toBe("StatMetric");
    expect(root.props?.value).toBe("42%");
  });

  it("parses array of component nodes as root", () => {
    const rawNodes: A2UIComponentNode[] = [
      { type: "Heading", children: "Header" },
      { type: "Text", children: "Description" },
    ];

    const parsed = parseA2UIPayload(rawNodes);
    expect(parsed).not.toBeNull();
    expect(Array.isArray(parsed?.root)).toBe(true);
    expect((parsed?.root as A2UIComponentNode[]).length).toBe(2);
  });

  it("parses single component node directly as root", () => {
    const rawNode: A2UIComponentNode = {
      type: "Card",
      props: { title: "Simple Card" },
    };

    const parsed = parseA2UIPayload(rawNode);
    expect(parsed).not.toBeNull();
    const root = parsed?.root as A2UIComponentNode;
    expect(root.type).toBe("Card");
    expect(root.props?.title).toBe("Simple Card");
  });

  it("handles wrapper objects like { a2ui: ... } or { a2uiData: ... }", () => {
    const wrapped = {
      a2ui: {
        root: {
          type: "Badge",
          props: { label: "Success", variant: "success" },
        },
      },
    };

    const parsed = parseA2UIPayload(wrapped);
    expect(parsed).not.toBeNull();
    const root = parsed?.root as A2UIComponentNode;
    expect(root.type).toBe("Badge");
  });

  it("sanitizes malformed nodes with fallback types", () => {
    const malformed = {
      root: {
        // missing type
        props: { foo: "bar" },
        children: [
          {
            type: 123 as unknown as string,
            children: "invalid type node",
          },
        ],
      },
    };

    const parsed = parseA2UIPayload(malformed);
    expect(parsed).not.toBeNull();
    const root = parsed?.root as A2UIComponentNode;
    expect(root.type).toBe("A2UIFallback");
    const child = (root.children as A2UIComponentNode[])[0];
    expect(child.type).toBe("A2UIFallback");
  });

  it("returns null for non-A2UI or unparseable objects", () => {
    expect(parseA2UIPayload(null)).toBeNull();
    expect(parseA2UIPayload(undefined)).toBeNull();
    expect(parseA2UIPayload("")).toBeNull();
    expect(parseA2UIPayload("not a json string")).toBeNull();
    expect(parseA2UIPayload(42)).toBeNull();
    expect(parseA2UIPayload({})).toBeNull();
    expect(parseA2UIPayload({ otherField: 123 })).toBeNull();
  });

  it("isA2UIPayload correctly identifies A2UI payloads", () => {
    expect(isA2UIPayload({ root: { type: "Card" } })).toBe(true);
    expect(isA2UIPayload({ type: "Card" })).toBe(true);
    expect(isA2UIPayload([{ type: "Button" }])).toBe(true);
    expect(isA2UIPayload({ a2ui: { root: { type: "Text" } } })).toBe(true);
    expect(isA2UIPayload(null)).toBe(false);
    expect(isA2UIPayload("plain string")).toBe(false);
    expect(isA2UIPayload({ foo: "bar" })).toBe(false);
  });

  it("flattenA2UIText extracts text representations from component tree", () => {
    const tree: A2UIComponentNode = {
      type: "Card",
      props: { title: "Title" },
      children: [
        { type: "Heading", children: "Deploy Plan" },
        { type: "Text", children: "Target: europe-west1" },
        {
          type: "Form",
          children: [
            { type: "TextInput", props: { label: "Service Name", value: "my-svc" } },
            { type: "Button", props: { label: "Submit" } },
          ],
        },
      ],
    };

    const text = flattenA2UIText(tree);
    expect(text).toContain("Title");
    expect(text).toContain("Deploy Plan");
    expect(text).toContain("Target: europe-west1");
    expect(text).toContain("Service Name");
    expect(text).toContain("Submit");
  });

  it("parses Google ADK flat A2UI schema with literal unwrapping", () => {
    const rawGoogleA2UI = {
      components: [
        {
          id: "text-47d0ed79",
          component: {
            Text: {
              text: { literalString: "Quick Vacation Survey" },
              variant: "h2",
            },
          },
        },
        {
          id: "text-f1d0c20b",
          component: {
            Text: {
              text: {
                literalString:
                  "Help us understand your ideal vacation preferences with a few quick questions.",
              },
              variant: "body",
            },
          },
        },
        {
          id: "destination_type",
          component: {
            MultipleChoice: {
              label: { literalString: "What kind of destination are you looking for?" },
              maxAllowedSelections: 1,
              options: [
                { label: { literalString: "Beach/Tropical" }, value: "Beach/Tropical" },
                { label: { literalString: "City/Cultural" }, value: "City/Cultural" },
              ],
            },
          },
        },
        {
          id: "budget",
          component: {
            Slider: {
              label: { literalString: "What is your approximate budget (in USD)?" },
              maxValue: 5000,
              minValue: 500,
              value: { literalNumber: 2000 },
            },
          },
        },
        {
          id: "duration_days",
          component: {
            TextField: {
              label: {
                literalString: "How many days would you like your vacation to last?",
              },
              text: { literalString: "7" },
              textFieldType: "number",
            },
          },
        },
        {
          id: "btn-08cd817a-label",
          component: {
            Text: {
              text: { literalString: "Submit" },
              variant: "button",
            },
          },
        },
        {
          id: "btn-08cd817a",
          component: {
            Button: {
              action: { name: "submit_form", params: {} },
              child: "btn-08cd817a-label",
              primary: true,
            },
          },
        },
        {
          id: "col-b53c50cb",
          component: {
            Column: {
              children: [
                "text-47d0ed79",
                "text-f1d0c20b",
                "destination_type",
                "budget",
                "duration_days",
                "btn-08cd817a",
              ],
            },
          },
        },
        {
          id: "card-978c5613",
          component: {
            Card: {
              child: "col-b53c50cb",
            },
          },
        },
      ],
      root: "card-978c5613",
      title: "Quick Vacation Survey",
      type: "Form",
    };

    const parsed = parseA2UIPayload(rawGoogleA2UI);
    expect(parsed).not.toBeNull();
    const rootNode = parsed?.root as A2UIComponentNode;
    expect(rootNode.type).toBe("Form");
    expect(Array.isArray(rootNode.children)).toBe(true);

    const card = (rootNode.children as A2UIComponentNode[])[0];
    expect(card.type).toBe("Card");

    // The Column inside the Card
    const col = (card.children as A2UIComponentNode[])[0];
    expect(col.type).toBe("Column");
    const innerChildren = col.children as A2UIComponentNode[];
    expect(innerChildren.length).toBe(6);

    // Text -> Heading
    expect(innerChildren[0].type).toBe("Heading");
    expect(innerChildren[0].children).toBe("Quick Vacation Survey");

    // MultipleChoice -> RadioGroup
    expect(innerChildren[2].type).toBe("RadioGroup");
    expect(innerChildren[2].props?.label).toBe(
      "What kind of destination are you looking for?"
    );

    // Slider
    expect(innerChildren[3].type).toBe("Slider");
    expect(innerChildren[3].props?.minValue).toBe(500);
    expect(innerChildren[3].props?.maxValue).toBe(5000);
    expect(innerChildren[3].props?.value).toBe(2000);

    // TextField -> TextInput
    expect(innerChildren[4].type).toBe("TextInput");
    expect(innerChildren[4].props?.inputType).toBe("number");
    expect(innerChildren[4].props?.defaultValue).toBe("7");

    // Button
    expect(innerChildren[5].type).toBe("Button");
    expect(innerChildren[5].props?.label).toBe("Submit");
    expect(innerChildren[5].actions?.[0].event).toBe("submit_form");
  });

  it("extracts A2UI payload from ---a2ui_JSON--- delimiter and cleans text with trailing content", () => {
    const rawContent = `Certainly, here is a quick survey about your vacation preferences! Just fill out the fields and hit 'Submit'.

---a2ui_JSON--- {"components": [{"component": {"Text": {"text": {"literalString": "Quick Vacation Survey"}, "variant": "h2"}}, "id": "text-47d0ed79"}, {"component": {"Text": {"text": {"literalString": "Submit"}, "variant": "button"}}, "id": "btn-08cd817a-label"}, {"component": {"Button": {"action": {"name": "submit_form", "params": {}}, "child": "btn-08cd817a-label", "primary": true}}, "id": "btn-08cd817a"}, {"component": {"Column": {"children": ["text-47d0ed79", "btn-08cd817a"]}}, "id": "col-b53c50cb"}, {"component": {"Card": {"child": "col-b53c50cb"}}, "id": "card-978c5613"}], "root": "card-978c5613", "title": "Quick Vacation Survey", "type": "Form"}

Feel free to ask if you need recommendations!`;

    const { a2ui, cleanText } = extractA2UIFromContent(rawContent);
    expect(a2ui).not.toBeNull();
    expect(cleanText).toContain(
      "Certainly, here is a quick survey about your vacation preferences!"
    );
    expect(cleanText).toContain("Feel free to ask if you need recommendations!");
    expect(cleanText).not.toContain("---a2ui_JSON---");
    expect(cleanText).not.toContain('"components"');
    const rootNode = a2ui?.root as A2UIComponentNode;
    expect(rootNode.type).toBe("Form");
  });
});
