import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Marketplace Pick & Pack",
    short_name: "Pick & Pack",
    description: "Warehouse picking and packing workflow for marketplace order batches.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#be185d",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml"
      }
    ]
  };
}
