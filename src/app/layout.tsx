import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#050508" />
      </head>
      <body>{children}</body>
    </html>
  );
}
