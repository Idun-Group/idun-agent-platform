import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WizardScanning } from "@/components/onboarding/WizardScanning";

describe("WizardScanning", () => {
  it("renders the loading caption", () => {
    render(<WizardScanning />);
    expect(screen.getByText(/scanning your project/i)).toBeInTheDocument();
  });
});
