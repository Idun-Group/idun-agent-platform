import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mocking `@/lib/auth` lets us drive `getCurrentAuthUser` from each test
 * and count how many times it's invoked across concurrent callers.
 *
 * Greptile flagged the original `getUserId()` implementation for caching
 * the *resolved value* rather than the in-flight Promise: two callers on
 * the first page load could both see `cached === null`, both run the
 * async branch, and each return a distinct uuid. Last write to `cached`
 * wins, but the early callers already got different identities — that's
 * the per-user-isolation bug we set out to fix, reintroduced inside the
 * helper itself. These tests pin the fix.
 */
vi.mock("@/lib/auth", () => ({
  getCurrentAuthUser: vi.fn(),
}));

import { getCurrentAuthUser } from "@/lib/auth";
import { getUserId, resetUserId } from "@/lib/user-id";

describe("getUserId under concurrent callers", () => {
  beforeEach(() => {
    resetUserId();
    vi.mocked(getCurrentAuthUser).mockReset();
  });
  afterEach(() => {
    resetUserId();
  });

  it("returns the same identity to many parallel callers (SSO off)", async () => {
    vi.mocked(getCurrentAuthUser).mockResolvedValue(null);
    const results = await Promise.all(
      Array.from({ length: 50 }, () => getUserId()),
    );
    expect(new Set(results).size).toBe(1);
  });

  it("invokes getCurrentAuthUser exactly once for concurrent callers", async () => {
    // The first caller starts the resolution; subsequent callers must
    // await the same promise rather than each calling auth themselves.
    // Without this, every page load would trigger 5–10 redundant SSO
    // probes on cold boot.
    vi.mocked(getCurrentAuthUser).mockResolvedValue({
      email: "alice@example.com",
    });
    await Promise.all(Array.from({ length: 50 }, () => getUserId()));
    expect(getCurrentAuthUser).toHaveBeenCalledTimes(1);
  });

  it("returns the SSO email to all callers when the user is authenticated", async () => {
    vi.mocked(getCurrentAuthUser).mockResolvedValue({
      email: "alice@example.com",
    });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => getUserId()),
    );
    expect(results).toEqual(Array(10).fill("alice@example.com"));
  });

  it("resetUserId clears the cache so a fresh identity is minted next", async () => {
    vi.mocked(getCurrentAuthUser).mockResolvedValue(null);
    const first = await getUserId();
    resetUserId();
    const second = await getUserId();
    expect(first).not.toBe(second);
  });
});
