import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/agent/",
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

vi.mock("@/lib/runtime-config", () => ({
  getRuntimeConfig: () => ({
    authMode: "none",
    theme: {
      appName: "Idun",
      greeting: "How can I help?",
      starterPrompts: [],
      logo: { text: "IA" },
      layout: "branded",
      colors: { light: {}, dark: {} },
      radius: "0.625",
      fontSans: "",
      fontSerif: "",
      fontMono: "",
      defaultColorScheme: "system",
    },
    layout: "branded",
  }),
}));

// SidebarTrigger requires SidebarProvider context. Stub it so the Topbar
// renders standalone without wrapping the test in a provider tree.
vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => <button aria-label="Toggle Sidebar">SidebarTrigger</button>,
}));

import { Topbar } from "@/components/admin/Topbar";

describe("Topbar", () => {
  it("invokes onOpenCommand when the Search button is clicked", () => {
    const spy = vi.fn();
    render(<Topbar onOpenCommand={spy} />);

    // The button label varies with viewport (md+ shows "Search…"); the icon
    // and ⌘K kbd are always present, so click via the visible kbd's parent.
    const searchButton = screen.getByRole("button", { name: /search/i });
    fireEvent.click(searchButton);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("renders Breadcrumbs with the labels for the mocked pathname", () => {
    render(<Topbar onOpenCommand={() => {}} />);

    // /admin/agent/ → segs ["admin","agent"] → labels "Admin", "Configuration".
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
  });

  it("renders the ThemeToggle without crashing (smoke)", () => {
    render(<Topbar onOpenCommand={() => {}} />);

    expect(screen.getByLabelText("Toggle theme")).toBeInTheDocument();
  });
});
