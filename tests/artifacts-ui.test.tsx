import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArtifactProvider } from "@/lib/artifacts/artifact-context";
import { ArtifactChip } from "@/components/artifacts/artifact-chip";
import { ArtifactsHeaderButton } from "@/components/artifacts/artifacts-header-button";
import { VersionSelector } from "@/components/artifacts/version-selector";
import { ArtifactsCanvas } from "@/components/artifacts/artifacts-canvas";
import type { AgentArtifact, ArtifactStreamPayload } from "@/types/agent";

describe("Artifacts UI Components", () => {
  const sampleArtifact: AgentArtifact = {
    id: "dashboard.html",
    sessionId: "session-1",
    userId: "test-user",
    filename: "dashboard.html",
    title: "Executive Sales Dashboard",
    mimeType: "text/html",
    currentVersion: 1,
    createTime: "2026-08-18T10:00:00Z",
    updateTime: "2026-08-18T10:30:00Z",
    scope: "session",
    versions: [
      {
        version: 0,
        content: "<h1>v0 Initial</h1>",
        createTime: "2026-08-18T10:00:00Z",
        sizeBytes: 17,
        mimeType: "text/html",
      },
      {
        version: 1,
        content: "<h1>v1 Upgraded Dashboard</h1>",
        createTime: "2026-08-18T10:30:00Z",
        sizeBytes: 30,
        mimeType: "text/html",
      },
    ],
  };

  describe("ArtifactChip", () => {
    it("renders artifact chip with title, filename, and version badge", () => {
      const payload: ArtifactStreamPayload = {
        filename: "dashboard.html",
        title: "Executive Sales Dashboard",
        mimeType: "text/html",
        version: 1,
        content: "<h1>v1</h1>",
      };

      render(
        <ArtifactProvider initialArtifacts={[sampleArtifact]}>
          <ArtifactChip artifact={payload} />
        </ArtifactProvider>
      );

      expect(screen.getByText("Executive Sales Dashboard")).toBeDefined();
      expect(screen.getByText("dashboard.html")).toBeDefined();
      expect(screen.getByText("v1")).toBeDefined();
      expect(screen.getByText("Open Canvas")).toBeDefined();
    });
  });

  describe("ArtifactsHeaderButton", () => {
    it("returns null when no artifacts are present", () => {
      const { container } = render(
        <ArtifactProvider initialArtifacts={[]}>
          <ArtifactsHeaderButton />
        </ArtifactProvider>
      );

      expect(container.firstChild).toBeNull();
    });

    it("renders shelf button with badge count when artifacts exist", () => {
      render(
        <ArtifactProvider initialArtifacts={[sampleArtifact]}>
          <ArtifactsHeaderButton />
        </ArtifactProvider>
      );

      expect(screen.getByText("Canvas")).toBeDefined();
      expect(screen.getByText("1")).toBeDefined();
    });
  });

  describe("VersionSelector", () => {
    it("renders active version button", () => {
      const onSelectVersion = vi.fn();

      render(
        <VersionSelector
          artifact={sampleArtifact}
          selectedVersion={1}
          onSelectVersion={onSelectVersion}
        />
      );

      expect(screen.getByText("v1")).toBeDefined();
      expect(screen.getByText("latest")).toBeDefined();
    });
  });

  describe("ArtifactsCanvas", () => {
    it("renders canvas with tabs, controls, and active version content when open", () => {
      render(
        <ArtifactProvider initialArtifacts={[sampleArtifact]}>
          <ArtifactsCanvas />
          <ArtifactChip
            artifact={{
              filename: "dashboard.html",
              title: "Executive Sales Dashboard",
              mimeType: "text/html",
              version: 1,
              content: "<h1>v1 Upgraded Dashboard</h1>",
            }}
          />
        </ArtifactProvider>
      );

      // Open canvas via chip
      const chip = screen.getByText("Executive Sales Dashboard");
      fireEvent.click(chip);

      expect(
        screen.getAllByText("Executive Sales Dashboard").length
      ).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("preview")).toBeDefined();
      expect(screen.getByText("code")).toBeDefined();

      // Switch to code tab
      const codeTab = screen.getByText("code");
      fireEvent.click(codeTab);

      expect(screen.getAllByText("html").length).toBeGreaterThanOrEqual(1);
    });
  });
});
