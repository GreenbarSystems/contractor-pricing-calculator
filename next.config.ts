import type { NextConfig } from "next";

const plane = process.env.PLANE_URL ?? "http://127.0.0.1:43188";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["control-plane"],
  allowedDevOrigins: ["127.0.0.1", "localhost", "0.0.0.0"],
  async rewrites() {
    return [
      { source: "/api/plane/:path*", destination: `${plane}/api/:path*` },
    ];
  },
};

export default nextConfig;
