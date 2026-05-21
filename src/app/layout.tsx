import type { Metadata } from "next";
import { Inter, Noto_Serif_Devanagari, Playfair_Display } from "next/font/google";
import Script from "next/script";
import PwaRegister from "@/components/pwa-register";
import ThemeToggle from "@/components/theme-toggle";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

const devanagari = Noto_Serif_Devanagari({
  subsets: ["devanagari", "latin"],
  display: "swap",
  variable: "--font-devanagari",
});

export const metadata: Metadata = {
  title: "NEET DOCTOR — NEET 2027",
  description: "Divyani's premium journey to AIIMS Delhi MBBS. A personalized NEET UG 2027 preparation platform.",
  keywords: "NEET 2027, AIIMS Delhi, MBBS, study tracker, Divyani, NEET DOCTOR",
  applicationName: "NEET DOCTOR",
  appleWebApp: {
    capable: true,
    title: "NEET Tracker",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${inter.variable} ${playfair.variable} ${devanagari.variable}`}
    >
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        <meta name="theme-color" content="#050508" />
        <Script
          id="theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem("neet-theme");
                  var theme = stored === "light" || stored === "dark"
                    ? stored
                    : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
                  document.documentElement.dataset.theme = theme;
                  document.documentElement.style.colorScheme = theme;
                  var meta = document.querySelector('meta[name="theme-color"]');
                  if (meta) meta.setAttribute("content", theme === "light" ? "#f8f1e7" : "#050508");
                } catch (error) {
                  document.documentElement.dataset.theme = "dark";
                  document.documentElement.style.colorScheme = "dark";
                }
              })();
            `,
          }}
        />
      </head>
      <body>
        <PwaRegister />
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
