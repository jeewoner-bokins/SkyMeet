import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // playwright 계열 CJS 패키지를 번들에서 제외 — 런타임에서 require로 로드
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "playwright-extra",
    "puppeteer-extra",
    "puppeteer-extra-plugin-stealth",
  ],
};

export default nextConfig;
