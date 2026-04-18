import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KindRide — Your neighbor is your driver.",
  description:
    "Community-powered rideshare. Not Uber. Not Lyft. A neighborhood that moves together.",
  openGraph: {
    title: "KindRide — Your neighbor is your driver.",
    description:
      "Community-powered rideshare built on trust, not algorithms. Universities, churches, and local hubs creating rides together.",
    url: "https://kindride.app",
    siteName: "KindRide",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "KindRide — Your neighbor is your driver.",
    description: "Community rideshare. Not Uber. Not Lyft. A neighborhood that moves together.",
  },
  metadataBase: new URL("https://kindride.app"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
