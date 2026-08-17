import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGIN ? [process.env.ALLOWED_DEV_ORIGIN] : [],
  // Chromium's compressed runtime assets are loaded dynamically at request
  // time, so Next's static tracer cannot discover them automatically. Keep the
  // include scoped to the PDF route to avoid bloating unrelated functions.
  outputFileTracingIncludes: {
    "/api/practice/*/report.pdf": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
    "/api/voice/audio/*": [
      "./private-assets/voice/adarsh-v1/*.mp3",
    ],
  },
  images: {
    remotePatterns: [],
  },
  // For Vercel deployment
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
          {
            key: "Permissions-Policy",
            // Voice navigation and Daily Goals use the microphone only from
            // this first-party app. Cross-origin frames remain blocked.
            value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
          },
        ],
      },
      {
        // NCERT chapters are rendered by the app's same-origin PDF iframe.
        // This narrow override keeps every other route non-embeddable.
        source: "/api/reader/:id/document",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'; base-uri 'self'; object-src 'self'; form-action 'self'",
          },
        ],
      },
      {
        source: "/api/reader/:id/document/:filename",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'; base-uri 'self'; object-src 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
