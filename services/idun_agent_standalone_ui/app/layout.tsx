import "./globals.css";
import Script from "next/script";
import { Suspense, type ReactNode } from "react";
import { Toaster } from "sonner";
import { QueryProvider } from "@/lib/query-client";
import { ThemeLoader } from "@/lib/theme-loader";
import { ThemeProvider } from "@/lib/theme-provider";
import { TourProvider } from "@/components/tour/TourProvider";
import { fontSans, fontSerif, fontMono } from "@/lib/fonts";

export const metadata = { title: "Idun Agent" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable}`}
    >
      <head>
        <Script src="/runtime-config.js" strategy="beforeInteractive" />
        {/*
          Pre-hydration script: reads `defaultColorScheme` from the runtime
          config (populated by /runtime-config.js above) and adds the `dark`
          class to <html> synchronously before React hydrates. This avoids a
          light-flash when the deployment defaults to dark.
        */}
        <Script
          id="idun-theme-prehydrate"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function () {
  try {
    var cfg = window.__IDUN_CONFIG__;
    var pref = (cfg && cfg.theme && cfg.theme.defaultColorScheme) || 'system';
    var dark = pref === 'dark' ||
      (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();`,
          }}
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ThemeLoader />
          <QueryProvider>
            <Suspense fallback={null}>
              <TourProvider>{children}</TourProvider>
            </Suspense>
          </QueryProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
