import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { A2UIProvider } from "@/components/a2ui/a2ui-context";
import { A2UIRenderer } from "@/components/a2ui/a2ui-renderer";
import type { A2UIPartData } from "@/types/agent";

describe("A2UI Catalog Components", () => {
  it("renders Card with title, status badge, and children", () => {
    const data: A2UIPartData = {
      root: {
        type: "Card",
        props: {
          title: "Server Status",
          status: "Healthy",
          statusVariant: "success",
          icon: "🚀",
        },
        children: [
          { type: "Heading", props: { level: 2 }, children: "Region: europe-west1" },
          { type: "Text", children: "All services operational" },
        ],
      },
    };

    render(
      <A2UIProvider>
        <A2UIRenderer data={data} />
      </A2UIProvider>
    );

    expect(screen.getByText("Server Status")).toBeDefined();
    expect(screen.getByText("Healthy")).toBeDefined();
    expect(screen.getByText("🚀")).toBeDefined();
    expect(screen.getByText("Region: europe-west1")).toBeDefined();
    expect(screen.getByText("All services operational")).toBeDefined();
  });

  it("renders StatMetric with value, unit, and change indicator", () => {
    const data: A2UIPartData = {
      root: {
        type: "StatMetric",
        props: {
          label: "Active Connections",
          value: "1,420",
          unit: "req/s",
          change: "+18%",
          changeType: "increase",
        },
      },
    };

    render(
      <A2UIProvider>
        <A2UIRenderer data={data} />
      </A2UIProvider>
    );

    expect(screen.getByText("Active Connections")).toBeDefined();
    expect(screen.getByText("1,420")).toBeDefined();
    expect(screen.getByText("req/s")).toBeDefined();
    expect(screen.getByText("+18%")).toBeDefined();
  });

  it("renders Table with headers and multiple rows", () => {
    const data: A2UIPartData = {
      root: {
        type: "Table",
        props: {
          caption: "Deployed Services",
          headers: ["Name", "Region", "Instances"],
          rows: [
            ["api-gateway", "europe-west1", 4],
            ["auth-service", "us-central1", 2],
          ],
        },
      },
    };

    render(
      <A2UIProvider>
        <A2UIRenderer data={data} />
      </A2UIProvider>
    );

    expect(screen.getByText("Deployed Services")).toBeDefined();
    expect(screen.getByText("Name")).toBeDefined();
    expect(screen.getByText("api-gateway")).toBeDefined();
    expect(screen.getByText("auth-service")).toBeDefined();
  });

  it("renders ProgressBar and MiniBarChart", () => {
    const data: A2UIPartData = {
      root: [
        {
          type: "ProgressBar",
          props: { label: "Memory Usage", value: 75 },
        },
        {
          type: "MiniBarChart",
          props: {
            title: "Latency Distribution",
            data: [
              { label: "p50", value: 45 },
              { label: "p99", value: 120 },
            ],
          },
        },
      ],
    };

    render(
      <A2UIProvider>
        <A2UIRenderer data={data} />
      </A2UIProvider>
    );

    expect(screen.getByText("Memory Usage")).toBeDefined();
    expect(screen.getByText("75%")).toBeDefined();
    expect(screen.getByText("Latency Distribution")).toBeDefined();
    expect(screen.getByText("p50")).toBeDefined();
    expect(screen.getByText("p99")).toBeDefined();
  });

  it("dispatches action on Button click and locks state to submitted", async () => {
    const onAction = vi.fn();
    const data: A2UIPartData = {
      root: {
        type: "Button",
        id: "btn_deploy",
        props: { label: "Approve Deployment", variant: "primary" },
        actions: [{ event: "submit_approval", payload: { env: "prod" } }],
      },
    };

    render(
      <A2UIProvider onAction={onAction}>
        <A2UIRenderer data={data} />
      </A2UIProvider>
    );

    const button = screen.getByRole("button", { name: /Approve Deployment/i });
    expect(button).toBeDefined();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(
      { event: "submit_approval", payload: { env: "prod" } },
      "btn_deploy"
    );

    // Button should now be disabled
    expect(button.getAttribute("disabled")).not.toBeNull();
  });

  it("aggregates input values on Form submit and dispatches action", async () => {
    const onAction = vi.fn();
    const data: A2UIPartData = {
      root: {
        type: "Form",
        id: "config_form",
        actions: [{ event: "save_config", payload: { projectId: "test-proj" } }],
        children: [
          {
            type: "TextInput",
            props: {
              name: "serviceName",
              label: "Service Name",
              defaultValue: "web-app",
            },
          },
          {
            type: "SelectDropdown",
            props: {
              name: "region",
              label: "Region",
              defaultValue: "us-central1",
              options: [
                { label: "US Central", value: "us-central1" },
                { label: "EU West", value: "europe-west1" },
              ],
            },
          },
          {
            type: "Button",
            props: { label: "Save Configuration", type: "submit" },
          },
        ],
      },
    };

    render(
      <A2UIProvider onAction={onAction}>
        <A2UIRenderer data={data} />
      </A2UIProvider>
    );

    expect(screen.getByText("Service Name")).toBeDefined();
    const input = screen.getByDisplayValue("web-app");
    await act(async () => {
      fireEvent.change(input, { target: { value: "custom-app" } });
    });

    const submitBtn = screen.getByRole("button", { name: /Save Configuration/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(
      {
        event: "save_config",
        componentId: "config_form",
        payload: {
          projectId: "test-proj",
          serviceName: "custom-app",
          region: "us-central1",
        },
      },
      "config_form"
    );
  });

  it("renders A2UIFallback for unknown component types", () => {
    const data: A2UIPartData = {
      root: {
        type: "NonExistentWidget" as unknown as "Card",
        props: { foo: "bar" },
      },
    };

    render(
      <A2UIProvider>
        <A2UIRenderer data={data} />
      </A2UIProvider>
    );

    expect(screen.getByText("Component: NonExistentWidget")).toBeDefined();
  });
});
