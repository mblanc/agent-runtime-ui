import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryItemCard } from "@/components/memory/memory-item-card";
import { AddMemoryModal } from "@/components/memory/add-memory-modal";
import { MemoryDrawer } from "@/components/memory/memory-drawer";
import { MemoryProvider } from "@/lib/memory-context";
import type { AgentMemory } from "@/types/agent";

const mockSampleMemory: AgentMemory = {
  id: "mem-101",
  userId: "test-user",
  fact: "Prefers TypeScript with strict typing over vanilla JS",
  topic: "coding_preferences",
  confidenceScore: 0.95,
  createTime: new Date().toISOString(),
  updateTime: new Date().toISOString(),
};

describe("Memory Bank UI Components", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("MemoryItemCard", () => {
    it("renders fact text, topic badge, and action buttons", () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined);
      const onDelete = vi.fn().mockResolvedValue(undefined);

      render(
        <MemoryItemCard
          memory={mockSampleMemory}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      );

      expect(screen.getByText(/Prefers TypeScript with strict typing/)).toBeDefined();
      expect(screen.getByText("Coding Preferences")).toBeDefined();
      expect(screen.getByText("95% match")).toBeDefined();
    });

    it("toggles inline edit mode and saves modified fact and topic", async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined);
      const onDelete = vi.fn().mockResolvedValue(undefined);

      render(
        <MemoryItemCard
          memory={mockSampleMemory}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      );

      const editBtn = screen.getByLabelText("Edit memory");
      fireEvent.click(editBtn);

      const textarea = screen.getByPlaceholderText("Memory fact...");
      expect(textarea).toBeDefined();

      fireEvent.change(textarea, {
        target: { value: "Prefers TypeScript 5.8 with Bun" },
      });

      const saveBtn = screen.getByText("Save");
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith(
          "mem-101",
          "Prefers TypeScript 5.8 with Bun",
          "coding_preferences"
        );
      });
    });

    it("triggers onDelete when delete button is clicked", async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined);
      const onDelete = vi.fn().mockResolvedValue(undefined);

      render(
        <MemoryItemCard
          memory={mockSampleMemory}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      );

      const deleteBtn = screen.getByLabelText("Delete memory");
      fireEvent.click(deleteBtn);

      await waitFor(() => {
        expect(onDelete).toHaveBeenCalledWith("mem-101");
      });
    });
  });

  describe("AddMemoryModal", () => {
    it("renders nothing when isOpen is false", () => {
      const { container } = render(
        <AddMemoryModal
          isOpen={false}
          onClose={vi.fn()}
          onAdd={vi.fn().mockResolvedValue(undefined)}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it("submits new memory fact and category when filled", async () => {
      const onAdd = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(<AddMemoryModal isOpen={true} onClose={onClose} onAdd={onAdd} />);

      const textarea = screen.getByPlaceholderText(/e\.g\. Prefers TypeScript/);
      fireEvent.change(textarea, {
        target: { value: "Always uses Tailwind CSS v3" },
      });

      const addBtn = screen.getByText("Add Memory");
      fireEvent.click(addBtn);

      await waitFor(() => {
        expect(onAdd).toHaveBeenCalledWith(
          "Always uses Tailwind CSS v3",
          "coding_preferences"
        );
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  describe("MemoryHeaderButton & MemoryDrawer Integration", () => {
    it("renders MemoryHeaderButton with count and opens drawer on click", async () => {
      const { MemoryHeaderButton } =
        await import("@/components/memory/memory-header-button");

      function TestApp() {
        return (
          <MemoryProvider initialMemories={[mockSampleMemory]}>
            <div>
              <MemoryHeaderButton />
              <MemoryDrawer />
            </div>
          </MemoryProvider>
        );
      }

      render(<TestApp />);

      // Memory button should be visible in header with count
      const memoryBtn = screen.getByRole("button", { name: "Open Memory Bank" });
      expect(memoryBtn).toBeDefined();
      expect(screen.getByText("Memory Bank")).toBeDefined();
      expect(screen.getByText("1")).toBeDefined();

      // Click button
      fireEvent.click(memoryBtn);

      // Verify drawer opened and displays memory profile title & memory item
      await waitFor(() => {
        expect(screen.getByText("Personalized semantic context for")).toBeDefined();
        expect(screen.getByText(/Prefers TypeScript with strict typing/)).toBeDefined();
        expect(screen.getByText("Auto-Consolidation")).toBeDefined();
      });
    });
  });

  describe("UserAvatarMenu & MemoryDrawer Integration", () => {
    it("renders Memory Bank Profile option in avatar menu and opens drawer on click", async () => {
      const { UserAvatarMenu } = await import("@/components/auth/user-avatar-menu");
      const authClient = await import("@/lib/auth-client");
      vi.spyOn(authClient, "useSession").mockReturnValue({
        data: {
          user: {
            id: "test-user",
            name: "Test User",
            email: "test@example.com",
          },
          session: {
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        },
        isPending: false,
        refetch: vi.fn().mockResolvedValue(undefined),
      });

      function TestApp() {
        return (
          <MemoryProvider initialMemories={[mockSampleMemory]}>
            <div>
              <UserAvatarMenu />
              <MemoryDrawer />
            </div>
          </MemoryProvider>
        );
      }

      render(<TestApp />);

      // Open avatar dropdown trigger
      const trigger = screen.getByRole("button", { name: /test user/i });
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

      // Memory Bank Profile item should be in dropdown
      const memoryProfileItem = await screen.findByText("Memory Bank Profile");
      expect(memoryProfileItem).toBeDefined();

      // Click Memory Bank Profile
      fireEvent.click(memoryProfileItem);

      // Verify drawer opened
      await waitFor(() => {
        expect(screen.getByText("Personalized semantic context for")).toBeDefined();
        expect(screen.getByText(/Prefers TypeScript with strict typing/)).toBeDefined();
      });
    });
  });
});
