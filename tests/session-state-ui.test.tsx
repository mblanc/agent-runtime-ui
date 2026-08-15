import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { StateDeltaChip } from "@/components/session-state/state-delta-chip";
import { StateVariableCard } from "@/components/session-state/state-variable-card";
import { AddStateVariableModal } from "@/components/session-state/add-state-variable-modal";
import { SessionStateHeaderButton } from "@/components/session-state/session-state-header-button";
import { SessionStateDrawer } from "@/components/session-state/session-state-drawer";
import { SessionStateProvider } from "@/lib/session-state/state-context";

describe("StateDeltaChip Component", () => {
  it("renders nothing when actions state_delta is empty or undefined", () => {
    const { container } = render(<StateDeltaChip actions={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders state delta chip with variable preview pills", () => {
    render(
      <StateDeltaChip
        actions={{
          state_delta: {
            target_cluster: "prod-europe-west1",
            active_tier: "enterprise",
          },
        }}
      />
    );

    const chip = screen.getByRole("button", {
      name: /Session State Delta: 2 variables modified/i,
    });
    expect(chip).toBeDefined();
    expect(chip.textContent).toContain("State Delta (2):");
    expect(chip.textContent).toContain("target_cluster:");
    expect(chip.textContent).toContain("prod-europe-west1");
    expect(chip.textContent).toContain("active_tier:");
  });
});

describe("StateVariableCard Component", () => {
  it("renders key, type badge, and formatted value", () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <StateVariableCard
        variableKey="cluster_config"
        value={{ replicas: 3, memory: "4GiB" }}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    );

    expect(screen.getByText("cluster_config")).toBeDefined();
    expect(screen.getByText("object")).toBeDefined();
    expect(screen.getByText(/replicas/)).toBeDefined();
  });

  it("supports inline editing and saving updated value", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <StateVariableCard
        variableKey="active_env"
        value="staging"
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    );

    const editBtn = screen.getByLabelText("Edit variable");
    await act(async () => {
      fireEvent.click(editBtn);
    });

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "production" } });

    const saveBtn = screen.getByRole("button", { name: /Save/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(onUpdate).toHaveBeenCalledWith("active_env", "production");
  });

  it("triggers onDelete callback when delete button is clicked", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <StateVariableCard
        variableKey="deprecated_flag"
        value={true}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    );

    const deleteBtn = screen.getByLabelText("Delete variable");
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    expect(onDelete).toHaveBeenCalledWith("deprecated_flag");
  });
});

describe("AddStateVariableModal Component", () => {
  it("validates input and submits typed state variable", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<AddStateVariableModal isOpen={true} onClose={onClose} onAdd={onAdd} />);

    const keyInput = screen.getByPlaceholderText(/target_cluster/i);
    const valueInput = screen.getByPlaceholderText(/Enter value.../i);

    fireEvent.change(keyInput, { target: { value: "max_workers" } });
    fireEvent.change(valueInput, { target: { value: "8" } });

    const submitBtn = screen.getByRole("button", { name: /Set Variable/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(onAdd).toHaveBeenCalledWith("max_workers", 8);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("SessionStateHeaderButton & Drawer Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: "sess-1",
        state: {
          deployment_status: "active",
          tier: "enterprise",
        },
        updateTime: new Date().toISOString(),
      }),
    }) as unknown as typeof fetch;
  });

  it("renders live variable count and opens drawer on click", async () => {
    await act(async () => {
      render(
        <SessionStateProvider
          initialSessionId="sess-1"
          initialState={{
            deployment_status: "active",
            tier: "enterprise",
          }}
        >
          <SessionStateHeaderButton />
          <SessionStateDrawer />
        </SessionStateProvider>
      );
    });

    const headerBtn = screen.getByTitle("Open ADK Session State Inspector");
    expect(headerBtn).toBeDefined();
    expect(headerBtn.textContent).toContain("2");

    // Click header button to open drawer
    await act(async () => {
      fireEvent.click(headerBtn);
    });

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(dialog.textContent).toContain("Session State Inspector");
    expect(dialog.textContent).toContain("deployment_status");
    expect(dialog.textContent).toContain("tier");
  });
});
