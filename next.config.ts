import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf uses dynamic import('unpdf/pdfjs') internally (1.6MB ESM bundle).
  // Bundling it via Turbopack causes the dynamic import to fail at runtime on Vercel.
  // Marking as external lets Node.js resolve it directly from node_modules.
  serverExternalPackages: ["unpdf"],

  experimental: {
    // Next.js routes ALL multipart/form-data POST requests through the Server Actions
    // pipeline, even regular Route Handlers. The default bodySizeLimit is 1MB.
    // Large file uploads (PDF conversion) require a higher limit.
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
