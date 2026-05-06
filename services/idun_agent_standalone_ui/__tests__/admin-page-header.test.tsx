import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TooltipProvider } from "@/components/ui/tooltip";

function renderWithTooltip(ui: React.ReactNode) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("AdminPageHeader", () => {
  it("renders title", () => {
    renderWithTooltip(<AdminPageHeader title="Agent" />);
    expect(screen.getByRole("heading", { name: "Agent" })).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    renderWithTooltip(
      <AdminPageHeader title="Agent" description="Identity and graph." />,
    );
    expect(screen.getByText("Identity and graph.")).toBeInTheDocument();
  });

  it("does not render description when omitted", () => {
    const { container } = renderWithTooltip(<AdminPageHeader title="Agent" />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("renders the dirty badge when isDirty=true", () => {
    renderWithTooltip(<AdminPageHeader title="Agent" isDirty />);
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it("does not render the dirty badge by default", () => {
    renderWithTooltip(<AdminPageHeader title="Agent" />);
    expect(screen.queryByText(/unsaved changes/i)).toBeNull();
  });

  it("renders the docs button when docsHref is provided", () => {
    renderWithTooltip(
      <AdminPageHeader
        title="Agent"
        docsHref="https://docs.idunplatform.com/standalone/agent"
      />,
    );
    const link = screen.getByRole("link", { name: /documentation/i });
    expect(link).toHaveAttribute(
      "href",
      "https://docs.idunplatform.com/standalone/agent",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("does not render the docs button when docsHref is omitted", () => {
    renderWithTooltip(<AdminPageHeader title="Agent" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders children in the action area", () => {
    renderWithTooltip(
      <AdminPageHeader title="Agent">
        <button data-testid="custom-action">Action</button>
      </AdminPageHeader>,
    );
    expect(screen.getByTestId("custom-action")).toBeInTheDocument();
  });
});
