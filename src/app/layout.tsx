import type { Metadata, Viewport } from "next";
import { Caveat, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-outfit",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-caveat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nook",
  description: "A small room on the internet you can share with the people you like.",
  openGraph: {
    title: "Nook",
    description: "A small room on the internet you can share with the people you like.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#100d16",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${caveat.variable}`}>
      <body>{children}</body>
    </html>
  );
}
