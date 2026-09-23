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
  // Stops Chrome on Android shrinking the page to fit anything that pokes
  // past the edge, which looked like the whole room zooming out.
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  // When the keyboard comes up, shrink the page above it rather than sliding
  // the keyboard over the bottom of it: the chat box, the note being typed
  // and the dock all stay where the thumb can see them.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${caveat.variable}`}>
      <body>{children}</body>
    </html>
  );
}
