import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgent } from "@/lib/agui";

const _origFetch = global.fetch;
const _stubBody = (text: string) =>
  new Response(new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });

describe("runAgent body shape", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("includes user message when message option is set", async () => {
    const captured: { body: string } = { body: "" };
    vi.spyOn(global, "fetch").mockImplementation(
      async (_url, init) => {
        captured.body = String(init?.body ?? "");
        return _stubBody("data: {\"type\":\"RUN_FINISHED\"}\n\n");
      },
    );
    await runAgent({
      threadId: "t1", runId: "r1", message: "hello",
      onEvent: () => {},
    });
    const body = JSON.parse(captured.body);
    expect(body.messages).toEqual([
      { id: "r1-u", role: "user", content: "hello" },
    ]);
    expect(body.forwardedProps).toEqual({});
  });

  it("forwardedProps option overrides default empty forwardedProps", async () => {
    const captured: { body: string } = { body: "" };
    vi.spyOn(global, "fetch").mockImplementation(
      async (_url, init) => {
        captured.body = String(init?.body ?? "");
        return _stubBody("data: {\"type\":\"RUN_FINISHED\"}\n\n");
      },
    );
    await runAgent({
      threadId: "t1", runId: "r1",
      forwardedProps: {
        idun: {
          a2uiClientMessage: {
            version: "v0.9",
            action: {
              name: "submit_form", surfaceId: "s1",
              sourceComponentId: "btn", timestamp: "2026-05-05T00:00:00Z",
              context: {},
            },
          },
        },
      },
      onEvent: () => {},
    });
    const body = JSON.parse(captured.body);
    expect(body.forwardedProps?.idun?.a2uiClientMessage?.action?.name)
      .toBe("submit_form");
  });

  it("omits the user message when only forwardedProps is provided", async () => {
    const captured: { body: string } = { body: "" };
    vi.spyOn(global, "fetch").mockImplementation(
      async (_url, init) => {
        captured.body = String(init?.body ?? "");
        return _stubBody("data: {\"type\":\"RUN_FINISHED\"}\n\n");
      },
    );
    await runAgent({
      threadId: "t1", runId: "r1",
      forwardedProps: { idun: {} },
      onEvent: () => {},
    });
    const body = JSON.parse(captured.body);
    expect(body.messages).toEqual([]);
  });
});

afterAll(() => {
  global.fetch = _origFetch;
});
