import { describe, it, expect, beforeEach } from "vitest";
import { MockAgentRuntimeProvider } from "@/lib/agent-runtime/mock/mock-provider";
import { mockMemoriesStore } from "@/lib/agent-runtime/mock/mock-store";
import { AgentMemory } from "@/types/agent";

describe("Mock Memory Store & Provider", () => {
  let provider: MockAgentRuntimeProvider;

  beforeEach(() => {
    provider = new MockAgentRuntimeProvider("mock-arch-advisor", "us-central1");
    // Re-seed mock memories store for clean test runs
    mockMemoriesStore.clear();
    const seeded: AgentMemory[] = [
      {
        id: "mem-1",
        userId: "test-user",
        fact: "Prefers TypeScript with strict typing over vanilla JS",
        topic: "coding_preferences",
        confidenceScore: 0.95,
        createTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        updateTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "mem-2",
        userId: "test-user",
        fact: "Always uses Bun package manager and Tailwind CSS v3",
        topic: "coding_preferences",
        confidenceScore: 0.98,
        createTime: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        updateTime: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "mem-3",
        userId: "test-user",
        fact: "Project Lead for Cloud Migration in europe-west1",
        topic: "enterprise_context",
        confidenceScore: 0.9,
        createTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        updateTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "mem-other",
        userId: "other-user",
        fact: "Prefers Python and Poetry",
        topic: "coding_preferences",
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString(),
      },
    ];

    for (const mem of seeded) {
      mockMemoriesStore.set(mem.id, mem);
    }
  });

  describe("listMemories", () => {
    it("lists all memories for the authenticated user", async () => {
      const memories = await provider.listMemories("test-user");
      expect(memories).toHaveLength(3);
      expect(memories.some((m) => m.id === "mem-1")).toBe(true);
      expect(memories.some((m) => m.id === "mem-other")).toBe(false);
    });

    it("filters memories by topic case-insensitively", async () => {
      const codingMemories = await provider.listMemories(
        "test-user",
        "coding_preferences"
      );
      expect(codingMemories).toHaveLength(2);

      const enterpriseMemories = await provider.listMemories(
        "test-user",
        "ENTERPRISE_CONTEXT"
      );
      expect(enterpriseMemories).toHaveLength(1);
      expect(enterpriseMemories[0].id).toBe("mem-3");
    });

    it("returns empty array for user with no memories", async () => {
      const memories = await provider.listMemories("nonexistent-user");
      expect(memories).toHaveLength(0);
    });
  });

  describe("createMemory", () => {
    it("creates a new memory with generated ID and timestamps", async () => {
      const newMemory = await provider.createMemory(
        "test-user",
        "Prefers dark mode UI interfaces",
        "general"
      );

      expect(newMemory.id).toBeDefined();
      expect(newMemory.userId).toBe("test-user");
      expect(newMemory.fact).toBe("Prefers dark mode UI interfaces");
      expect(newMemory.topic).toBe("general");
      expect(newMemory.createTime).toBeDefined();
      expect(newMemory.updateTime).toBeDefined();

      const list = await provider.listMemories("test-user");
      expect(list).toHaveLength(4);
    });
  });

  describe("updateMemory", () => {
    it("updates an existing memory fact and topic", async () => {
      const updated = await provider.updateMemory(
        "test-user",
        "mem-1",
        "Prefers TypeScript 5.8 with strict typing",
        "coding_preferences"
      );

      expect(updated.id).toBe("mem-1");
      expect(updated.fact).toBe("Prefers TypeScript 5.8 with strict typing");

      const fetched = mockMemoriesStore.get("mem-1");
      expect(fetched?.fact).toBe("Prefers TypeScript 5.8 with strict typing");
    });

    it("throws error when trying to update another user's memory (IDOR protection)", async () => {
      await expect(
        provider.updateMemory(
          "malicious-user",
          "mem-1",
          "Hacked fact",
          "coding_preferences"
        )
      ).rejects.toThrow(/Unauthorized/);
    });

    it("throws error for non-existent memory ID", async () => {
      await expect(
        provider.updateMemory("test-user", "mem-9999", "Fact", "general")
      ).rejects.toThrow(/not found/);
    });
  });

  describe("deleteMemory", () => {
    it("deletes a memory for the owner", async () => {
      await provider.deleteMemory("test-user", "mem-1");
      expect(mockMemoriesStore.has("mem-1")).toBe(false);

      const list = await provider.listMemories("test-user");
      expect(list).toHaveLength(2);
    });

    it("throws error when attempting to delete another user's memory", async () => {
      await expect(provider.deleteMemory("malicious-user", "mem-1")).rejects.toThrow(
        /Unauthorized/
      );
      expect(mockMemoriesStore.has("mem-1")).toBe(true);
    });
  });

  describe("retrieveMemories", () => {
    it("retrieves relevant memories matching keywords in query", async () => {
      const retrieved = await provider.retrieveMemories(
        "test-user",
        "How should I configure TypeScript and Bun for this project?"
      );

      expect(retrieved.length).toBeGreaterThan(0);
      expect(retrieved[0].fact).toMatch(/TypeScript|Bun/);
      expect(retrieved[0].relevanceScore).toBeGreaterThan(0.7);
    });

    it("returns top general memories if no exact keyword match is found", async () => {
      const retrieved = await provider.retrieveMemories(
        "test-user",
        "What is the weather today?"
      );

      expect(retrieved.length).toBeGreaterThan(0);
      expect(retrieved[0].relevanceScore).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe("generateMemories", () => {
    it("extracts memories from session events and persists to store", async () => {
      const generated = await provider.generateMemories("test-user", "1");
      expect(generated.length).toBeGreaterThan(0);
      expect(generated[0].userId).toBe("test-user");
      expect(generated[0].sourceSessionId).toBe("1");
      expect(mockMemoriesStore.has(generated[0].id)).toBe(true);
    });
  });
});
