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
          <div role="status" className="px-3 py-1.5 text-center text-xs font-extrabold leading-4 tracking-wide sm:py-2 sm:text-sm" style={{ background: "#7f1d1d", color: "white", position: "relative", zIndex: 40 }}>
            <span className="block sm:inline">{stagingBanner}</span>
            <span className="block sm:inline"> — SYNTHETIC DATA ONLY</span>
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
