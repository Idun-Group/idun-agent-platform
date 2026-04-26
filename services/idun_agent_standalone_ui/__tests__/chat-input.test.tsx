import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/runtime-config", () => ({
  getRuntimeConfig: () => ({
    theme: {
      appName: "Idun Agent",
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
    authMode: "none",
    layout: "branded",
  }),
}));

import { ChatInput } from "@/components/chat/ChatInput";

describe("ChatInput", () => {
  it("calls onSend with trimmed text and clears the textarea on Enter", () => {
    const spy = vi.fn();
    render(<ChatInput onSend={spy} />);

    const textarea = screen.getByPlaceholderText(
      /Message Idun Agent/i,
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("hello");
    expect(textarea.value).toBe("");
  });

  it("does not call onSend when Shift+Enter is pressed", () => {
    const spy = vi.fn();
    render(<ChatInput onSend={spy} />);

    const textarea = screen.getByPlaceholderText(
      /Message Idun Agent/i,
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(spy).not.toHaveBeenCalled();
    // The textarea should NOT have been cleared by the submit path.
    expect(textarea.value).toBe("hello");
  });

  it("disables the send button while streaming when no onStop is provided", () => {
    const spy = vi.fn();
    render(<ChatInput onSend={spy} streaming={true} />);

    const button = screen.getByLabelText("Send message");
    expect(button).toBeDisabled();
  });

  it("morphs into a Stop button while streaming with onStop, and onStop fires on click", () => {
    const sendSpy = vi.fn();
    const stopSpy = vi.fn();
    render(<ChatInput onSend={sendSpy} streaming={true} onStop={stopSpy} />);

    // The send affordance is replaced by a Stop button when both `streaming`
    // and `onStop` are set.
    expect(screen.queryByLabelText("Send message")).not.toBeInTheDocument();
    const stopButton = screen.getByLabelText("Stop generation");
    fireEvent.click(stopButton);

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
