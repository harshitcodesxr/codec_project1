import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project lives in a folder that has other projects as siblings. Pin
  // Turbopack's root so it doesn't walk up and pick up an unrelated
  // package-lock.json above the project.
  turbopack: {
    root: path.resolve("."),
  },
};

export default nextConfig;
