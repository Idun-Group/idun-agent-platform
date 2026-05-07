import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// usePathname is mocked per-case via the hoisted ref so each test can
// substitute a different path without re-mocking the module.
const pathnameRef = vi.hoisted(() => ({ value: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.value,
}));

import { Breadcrumbs } from "@/components/admin/Breadcrumbs";

afterEach(() => {
  // Reset between cases so a leaked path can't bleed into the next test.
  pathnameRef.value = "/";
});

describe("Breadcrumbs", () => {
  it("renders 'Admin' for /admin/", () => {
    pathnameRef.value = "/admin/";
    render(<Breadcrumbs />);

    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
  });

  it("renders 'Admin' + 'Configuration' for /admin/agent/", () => {
    pathnameRef.value = "/admin/agent/";
    render(<Breadcrumbs />);

    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
  });

  it("renders 'Admin' + 'Settings' for /admin/settings/", () => {
    pathnameRef.value = "/admin/settings/";
    render(<Breadcrumbs />);

    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders 'Traces' for /traces/", () => {
    pathnameRef.value = "/traces/";
    render(<Breadcrumbs />);

    expect(screen.getByText("Traces")).toBeInTheDocument();
  });

  it("renders 'Traces' + 'Session' for /traces/session/", () => {
    pathnameRef.value = "/traces/session/";
    render(<Breadcrumbs />);

    expect(screen.getByText("Traces")).toBeInTheDocument();
    expect(screen.getByText("Session")).toBeInTheDocument();
  });

  it("returns null when usePathname() is the root '/'", () => {
    pathnameRef.value = "/";
    const { container } = render(<Breadcrumbs />);

    expect(container.firstChild).toBeNull();
  });
});
