import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsMenu } from "@/components/settings/settings-menu";
import { TooltipProvider } from "@/components/ui/tooltip";

const mockSetTheme = vi.fn();

vi.mock("next-themes", () => {
  return {
    useTheme: () => ({
      theme: "dark",
      setTheme: mockSetTheme,
      themes: ["system", "light", "dark"],
    }),
    ThemeProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

describe("SettingsMenu Component & Theme Switching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders SettingsMenu trigger button", () => {
    render(
      <TooltipProvider>
        <SettingsMenu />
      </TooltipProvider>
    );

    const trigger = screen.getByRole("button", { name: /settings and theme/i });
    expect(trigger).toBeDefined();
  });

  it("opens menu and shows System, Light, and Dark theme options", async () => {
    render(
      <TooltipProvider>
        <SettingsMenu />
      </TooltipProvider>
    );

    const trigger = screen.getByRole("button", { name: /settings and theme/i });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Appearance")).toBeDefined();
      expect(screen.getByText("System")).toBeDefined();
      expect(screen.getByText("Light")).toBeDefined();
      expect(screen.getByText("Dark")).toBeDefined();
    });
  });

  it("calls setTheme('light') when Light option is clicked", async () => {
    render(
      <TooltipProvider>
        <SettingsMenu />
      </TooltipProvider>
    );

    const trigger = screen.getByRole("button", { name: /settings and theme/i });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Light")).toBeDefined();
    });

    const lightOption = screen.getByText("Light");
    fireEvent.click(lightOption);

    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });

  it("calls setTheme('system') when System option is clicked", async () => {
    render(
      <TooltipProvider>
        <SettingsMenu />
      </TooltipProvider>
    );

    const trigger = screen.getByRole("button", { name: /settings and theme/i });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("System")).toBeDefined();
    });

    const systemOption = screen.getByText("System");
    fireEvent.click(systemOption);

    expect(mockSetTheme).toHaveBeenCalledWith("system");
  });
});
