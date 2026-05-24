import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Meesho Pick & Pack",
  title: {
    default: "Meesho Pick & Pack",
    template: "%s | Meesho Pick & Pack"
  },
  description: "Small seller warehouse pick and pack workflow for Meesho label batches.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Pick & Pack",
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
