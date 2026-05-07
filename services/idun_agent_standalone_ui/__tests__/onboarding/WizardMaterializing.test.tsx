import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WizardMaterializing } from "@/components/onboarding/WizardMaterializing";

describe("WizardMaterializing", () => {
  it("renders the loading caption", () => {
    render(<WizardMaterializing />);
    expect(screen.getByText(/creating your agent/i)).toBeInTheDocument();
  });
});
