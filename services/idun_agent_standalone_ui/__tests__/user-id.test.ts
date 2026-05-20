import { describe, expect, it } from "vitest";
import { formatUserIdForDisplay } from "@/lib/user-id";

/**
 * `formatUserIdForDisplay` is the only piece of `lib/user-id.ts`
 * worth pinning in isolation — the rest is React glue (`useUserId`)
 * and a thin module-level cache (`getUserId`) that are covered by
 * integration tests.
 *
 * Each test targets a concrete failure mode rather than a branch tick.
 */
describe("formatUserIdForDisplay", () => {
  it("returns an email address as-is", () => {
    // Emails are recognizable and short enough; truncating one to 8
    // chars would render them useless.
    expect(formatUserIdForDisplay("alice@example.com")).toBe(
      "alice@example.com",
    );
  });

  it("truncates engine-minted uuid hex to 8 chars + ellipsis", () => {
    // 32-char lowercase hex (uuid4().hex). Pin the exact slice + glyph
    // so layouts can rely on a fixed width.
    expect(
      formatUserIdForDisplay("749f9e33278746e99b9a6039b5f9b814"),
    ).toBe("749f9e33…");
  });

  it("truncates SPA-minted uuid with dashes the same way", () => {
    // `crypto.randomUUID()` returns 36 chars with dashes; the first 8
    // include a dash, which is fine — we keep what comes first.
    expect(
      formatUserIdForDisplay("12345678-90ab-4cde-9f01-234567890abc"),
    ).toBe("12345678…");
  });

  it("does not truncate values already at or below 8 chars", () => {
    // Some IdPs return numeric `sub`s ("123"). No ellipsis needed.
    expect(formatUserIdForDisplay("123")).toBe("123");
    expect(formatUserIdForDisplay("12345678")).toBe("12345678");
  });

  it("treats a value with `@` as an email even if it's long", () => {
    // The presence of `@` is the email marker, not the length. A very
    // long email must still render in full.
    const longish = "averylongusername@subdomain.example.com";
    expect(formatUserIdForDisplay(longish)).toBe(longish);
  });
});
