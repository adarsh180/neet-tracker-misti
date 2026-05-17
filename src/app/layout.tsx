import type { Metadata } from "next";
import { Inter, Noto_Serif_Devanagari, Playfair_Display } from "next/font/google";
import Script from "next/script";
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
  title: "Sacred Path — NEET 2027",
  description: "Divyani's sacred journey to AIIMS Delhi MBBS. A personalized NEET UG 2027 preparation platform.",
  keywords: "NEET 2027, AIIMS Delhi, MBBS, study tracker, Divyani",
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
        <link rel="icon" href="/favicon.ico" />
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
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
