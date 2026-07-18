import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Marketplace Pick & Pack",
  title: {
    default: "Marketplace Pick & Pack",
    template: "%s | Marketplace Pick & Pack"
  },
  description: "Multi-marketplace warehouse pick and pack workflow, starting with Flipkart.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Marketplace Pick & Pack",
    statusBarStyle: "default"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#be185d"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const stagingBanner = process.env.NEXT_PUBLIC_STAGING_BANNER?.trim();
  return (
    <html lang="en">
      <body>
        {stagingBanner ? (
          <div role="status" style={{ background: "#7f1d1d", color: "white", fontWeight: 800, padding: "8px 12px", textAlign: "center", letterSpacing: "0.04em", position: "relative", zIndex: 10000 }}>
            {stagingBanner} — SYNTHETIC DATA ONLY
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
