import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  // Trust the preview gateway proxy so we get the visitor's real IP,
  // not the gateway's loopback address.
  allowedDevOrigins: ["preview-chat-e799d03e-c243-46c9-9eb3-6a2bfb1190ed.space-z.ai"],
  // Long-cache static assets (Next.js already hashes them). webp images
  // in /assets/ never change between deploys, so we cache them for a
  // year on the browser too.
  async headers() {
    return [
      {
        source: "/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
