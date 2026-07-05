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
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
