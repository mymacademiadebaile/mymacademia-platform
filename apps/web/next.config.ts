import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [60, 65, 70, 75],
    // Rhythm covers and professor photos uploaded from the backoffice live on Cloudinary.
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }]
  }
};

export default nextConfig;
