import "./globals.css";
import Script from "next/script";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { QueryProvider } from "@/lib/query-client";
import { ThemeLoader } from "@/lib/theme-loader";
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
      </head>
      <body className="min-h-screen font-sans antialiased">
        <ThemeLoader />
        <QueryProvider>{children}</QueryProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
