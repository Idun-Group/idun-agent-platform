import { expect, test } from "@playwright/test";

test.describe("telemetry off-switch", () => {
  test("no requests to PostHog when /runtime-config.js disables telemetry", async ({
    page,
  }) => {
    // Intercept /runtime-config.js at the page level so we don't have to
    // restart the dev server with a different env. Mirror the real backend's
    // payload shape (window.__IDUN_CONFIG__) and force telemetry off.
    await page.route("**/runtime-config.js", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `window.__IDUN_CONFIG__ = ${JSON.stringify({
          theme: {
            appName: "Idun Agent",
            greeting: "How can I help?",
            starterPrompts: [],
            logo: { text: "IA" },
            layout: "branded",
            radius: "0.625",
            fontSans: "",
            fontSerif: "",
            fontMono: "",
            defaultColorScheme: "light",
            colors: {
              light: {
                background: "#fff",
                foreground: "#000",
                card: "#fff",
                cardForeground: "#000",
                popover: "#fff",
                popoverForeground: "#000",
                primary: "#000",
                primaryForeground: "#fff",
                secondary: "#eee",
                secondaryForeground: "#000",
                muted: "#eee",
                mutedForeground: "#666",
                accent: "#c96442",
                accentForeground: "#fff",
                destructive: "#dc2626",
                destructiveForeground: "#fff",
                border: "#ddd",
                input: "#ddd",
                ring: "rgba(0,0,0,0.2)",
              },
              dark: {
                background: "#000",
                foreground: "#fff",
                card: "#111",
                cardForeground: "#fff",
                popover: "#111",
                popoverForeground: "#fff",
                primary: "#fff",
                primaryForeground: "#000",
                secondary: "#222",
                secondaryForeground: "#fff",
                muted: "#222",
                mutedForeground: "#999",
                accent: "#d97757",
                accentForeground: "#000",
                destructive: "#ef4444",
                destructiveForeground: "#fff",
                border: "#222",
                input: "#222",
                ring: "rgba(255,255,255,0.2)",
              },
            },
          },
          authMode: "none",
          layout: "branded",
          telemetry: {
            enabled: false,
            host: "https://us.i.posthog.com",
            projectKey: "phc_off",
            deploymentType: "dev",
            identifyUsers: false,
            sessionReplay: false,
          },
        })};`,
      });
    });

    const posthogRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("posthog.com") || url.includes("i.posthog.com")) {
        posthogRequests.push(url);
      }
    });

    await page.goto("/");
    // Wait long enough for any deferred posthog init to fire if it were going to.
    await page.waitForTimeout(1000);

    expect(posthogRequests).toEqual([]);
  });
});
