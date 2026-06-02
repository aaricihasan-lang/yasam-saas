import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf uses dynamic import('unpdf/pdfjs') internally (1.6MB ESM bundle).
  // Bundling it via Turbopack causes the dynamic import to fail at runtime on Vercel.
  // Marking as external lets Node.js resolve it directly from node_modules.
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
