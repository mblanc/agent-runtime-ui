import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import {
  computeStateDelta,
  inferValueType,
  parseStateInputValue,
} from "@/lib/session-state/state-diff";
import { SessionStateProvider, useSessionState } from "@/lib/session-state/state-context";

describe("Session State Diff and Parsing Helpers", () => {
  it("infers value types correctly", () => {
    expect(inferValueType("hello")).toBe("string");
    expect(inferValueType(42)).toBe("number");
    expect(inferValueType(true)).toBe("boolean");
    expect(inferValueType([1, 2, 3])).toBe("array");
    expect(inferValueType({ foo: "bar" })).toBe("object");
    expect(inferValueType(null)).toBe("null");
    expect(inferValueType(undefined)).toBe("null");
  });

  it("parses state string input values into appropriate types", () => {
    expect(parseStateInputValue("true")).toBe(true);
    expect(parseStateInputValue("false")).toBe(false);
    expect(parseStateInputValue("null")).toBe(null);
    expect(parseStateInputValue("123")).toBe(123);
    expect(parseStateInputValue('{"cluster":"prod"}')).toEqual({ cluster: "prod" });
    expect(parseStateInputValue('["a","b"]')).toEqual(["a", "b"]);
    expect(parseStateInputValue("regular string")).toBe("regular string");
  });

  it("computes structural state deltas correctly", () => {
    const oldState = {
      target_cluster: "staging-1",
      obsolete_key: "old_val",
      unchanged_key: 100,
    };

    const newState = {
      target_cluster: "prod-1",
      new_variable: true,
      unchanged_key: 100,
    };

    const deltas = computeStateDelta(oldState, newState);
    expect(deltas.length).toBe(3);

    // new_variable added
    const added = deltas.find((d) => d.key === "new_variable");
    expect(added).toBeDefined();
    expect(added?.action).toBe("added");
    expect(added?.newValue).toBe(true);

    // obsolete_key deleted
    const deleted = deltas.find((d) => d.key === "obsolete_key");
    expect(deleted).toBeDefined();
    expect(deleted?.action).toBe("deleted");
    expect(deleted?.previousValue).toBe("old_val");

    // target_cluster updated
    const updated = deltas.find((d) => d.key === "target_cluster");
    expect(updated).toBeDefined();
    expect(updated?.action).toBe("updated");
    expect(updated?.previousValue).toBe("staging-1");
    expect(updated?.newValue).toBe("prod-1");
  });
});

describe("SessionStateProvider & useSessionState hook", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: "sess-1",
        state: { env: "prod" },
        updateTime: new Date().toISOString(),
      }),
    }) as unknown as typeof fetch;
  });

  function TestConsumer() {
    const { state, isDrawerOpen, setIsDrawerOpen, updateVariable, deleteVariable } =
      useSessionState();

    return (
      <div>
        <div data-testid="state-json">{JSON.stringify(state)}</div>
        <div data-testid="drawer-status">{isDrawerOpen ? "open" : "closed"}</div>
        <button onClick={() => setIsDrawerOpen(true)}>Open Drawer</button>
        <button onClick={() => updateVariable("env", "prod")}>Set Env</button>
        <button onClick={() => deleteVariable("env")}>Delete Env</button>
      </div>
    );
  }

  it("provides initial state and allows drawer toggling", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: "sess-1",
        state: { initial_key: "value1" },
        updateTime: new Date().toISOString(),
      }),
    }) as unknown as typeof fetch;

    await act(async () => {
      render(
        <SessionStateProvider
          initialSessionId="sess-1"
          initialState={{ initial_key: "value1" }}
        >
          <TestConsumer />
        </SessionStateProvider>
      );
    });

    expect(screen.getByTestId("state-json").textContent).toContain("initial_key");
    expect(screen.getByTestId("drawer-status").textContent).toBe("closed");

    await act(async () => {
      screen.getByText("Open Drawer").click();
    });

    expect(screen.getByTestId("drawer-status").textContent).toBe("open");
  });

  it("updates and deletes state variables optimistically and synchronizes with API", async () => {
    await act(async () => {
      render(
        <SessionStateProvider initialSessionId="sess-1" initialState={{}}>
          <TestConsumer />
        </SessionStateProvider>
      );
    });

    await act(async () => {
      screen.getByText("Set Env").click();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/sessions/sess-1/state"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ state: { env: "prod" }, mode: "merge" }),
      })
    );
  });
});
