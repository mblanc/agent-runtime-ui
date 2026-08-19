import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ArtifactProvider, useArtifacts } from "@/lib/artifacts/artifact-context";
import type { AgentArtifact } from "@/types/agent";

describe("ArtifactContext & useArtifacts hook", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const sampleArtifacts: AgentArtifact[] = [
    {
      id: "doc.html",
      sessionId: "session-1",
      userId: "test-user",
      filename: "doc.html",
      title: "Sample HTML Document",
      mimeType: "text/html",
      currentVersion: 1,
      createTime: "2026-08-18T10:00:00Z",
      updateTime: "2026-08-18T10:30:00Z",
      scope: "session",
      versions: [
        {
          version: 0,
          content: "<h1>Version 0</h1>",
          createTime: "2026-08-18T10:00:00Z",
          sizeBytes: 18,
          mimeType: "text/html",
        },
        {
          version: 1,
          content: "<h1>Version 1</h1>",
          createTime: "2026-08-18T10:30:00Z",
          sizeBytes: 18,
          mimeType: "text/html",
        },
      ],
    },
  ];

  it("initializes with provided artifacts and closed canvas", () => {
    const { result } = renderHook(() => useArtifacts(), {
      wrapper: ({ children }) => (
        <ArtifactProvider initialArtifacts={sampleArtifacts}>{children}</ArtifactProvider>
      ),
    });

    expect(result.current.artifacts.length).toBe(1);
    expect(result.current.isOpen).toBe(false);
    expect(result.current.activeArtifact).toBeNull();
    expect(result.current.activeVersion).toBeNull();
  });

  it("opens an artifact and resolves latest version by default", () => {
    const { result } = renderHook(() => useArtifacts(), {
      wrapper: ({ children }) => (
        <ArtifactProvider initialArtifacts={sampleArtifacts}>{children}</ArtifactProvider>
      ),
    });

    act(() => {
      result.current.openArtifact("doc.html");
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.activeArtifact?.filename).toBe("doc.html");
    expect(result.current.activeVersion?.version).toBe(1);
    expect(result.current.activeVersion?.content).toBe("<h1>Version 1</h1>");
  });

  it("opens an artifact with a specific version and allows version switching", () => {
    const { result } = renderHook(() => useArtifacts(), {
      wrapper: ({ children }) => (
        <ArtifactProvider initialArtifacts={sampleArtifacts}>{children}</ArtifactProvider>
      ),
    });

    act(() => {
      result.current.openArtifact("doc.html", 0);
    });

    expect(result.current.activeVersion?.version).toBe(0);
    expect(result.current.activeVersion?.content).toBe("<h1>Version 0</h1>");

    act(() => {
      result.current.selectVersion(1);
    });

    expect(result.current.activeVersion?.version).toBe(1);
  });

  it("ingests stream artifact, adds it to the list, and auto-opens canvas", () => {
    const { result } = renderHook(() => useArtifacts(), {
      wrapper: ({ children }) => (
        <ArtifactProvider initialArtifacts={[]}>{children}</ArtifactProvider>
      ),
    });

    expect(result.current.artifacts.length).toBe(0);

    act(() => {
      result.current.ingestStreamArtifact({
        filename: "chart.svg",
        title: "Architecture Diagram",
        mimeType: "image/svg+xml",
        version: 0,
        content: "<svg><circle r='10'/></svg>",
      });
    });

    expect(result.current.artifacts.length).toBe(1);
    expect(result.current.isOpen).toBe(true);
    expect(result.current.activeArtifact?.filename).toBe("chart.svg");
    expect(result.current.activeVersion?.content).toBe("<svg><circle r='10'/></svg>");

    // Ingest update to the same artifact
    act(() => {
      result.current.ingestStreamArtifact({
        filename: "chart.svg",
        title: "Architecture Diagram",
        mimeType: "image/svg+xml",
        version: 1,
        content: "<svg><circle r='20'/></svg>",
      });
    });

    expect(result.current.artifacts.length).toBe(1);
    expect(result.current.activeArtifact?.versions.length).toBe(2);
    expect(result.current.activeVersion?.version).toBe(1);
    expect(result.current.activeVersion?.content).toBe("<svg><circle r='20'/></svg>");
  });

  it("toggles canvas, fullscreen mode, and updates split ratio", () => {
    const { result } = renderHook(() => useArtifacts(), {
      wrapper: ({ children }) => (
        <ArtifactProvider initialArtifacts={sampleArtifacts}>{children}</ArtifactProvider>
      ),
    });

    act(() => {
      result.current.toggleCanvas();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.toggleFullscreen();
    });
    expect(result.current.isFullscreen).toBe(true);

    act(() => {
      result.current.closeCanvas();
    });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.isFullscreen).toBe(false);

    act(() => {
      result.current.setSplitRatio(0.6);
    });
    expect(result.current.splitRatio).toBe(0.6);
  });
});
