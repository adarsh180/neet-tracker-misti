import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono, Noto_Serif_Devanagari } from "next/font/google";
import Script from "next/script";
import LaunchSplash from "@/components/launch-splash";
import PwaRegister from "@/components/pwa-register";
import ThemeToggle from "@/components/theme-toggle";
import { PulseCycler } from "@/components/pulse/pulse-cycler";
import { DAYCYCLE_SCRIPT } from "@/lib/daycycle";
import "./globals.css";
import "./pulse.css";
import "./pulse-dash.css";
import "./pulse-pages.css";
import "./pulse-app.css";
import "./exams.css";
import "./hub.css";
import "./notify.css";
import "./orbit.css";
import "./dial.css";
import "./daycycle.css";
import "./clay.css";
import "./material.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

// Pulse type: Bricolage Grotesque for display (expressive, optical sizes),
// Inter to read, JetBrains Mono only for monitor-style vital readouts.
const displaySerif = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-pl-display",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-pl-mono",
});

const devanagari = Noto_Serif_Devanagari({
  subsets: ["devanagari", "latin"],
  display: "swap",
  variable: "--font-devanagari",
});

export const metadata: Metadata = {
  title: "NEET DOCTOR — NEET 2027",
  description: "Private NEET UG 2027 preparation platform.",
  keywords: "NEET 2027, AIIMS Delhi, MBBS, study tracker, NEET DOCTOR",
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the installed PWA paint edge-to-edge behind notches/punch-holes.
  viewportFit: "cover",
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
      className={`${inter.variable} ${displaySerif.variable} ${mono.variable} ${devanagari.variable}`}
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
                  var d = document.documentElement;
                  ${DAYCYCLE_SCRIPT}
                  document.documentElement.style.colorScheme = theme;
                  var meta = document.querySelector('meta[name="theme-color"]');
                  if (meta) meta.setAttribute("content", theme === "light" ? "#f4effd" : "#050508");
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
        <LaunchSplash />
        <PulseCycler />
        <PwaRegister />
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
