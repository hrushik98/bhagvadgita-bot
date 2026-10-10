import type { Metadata, Viewport } from "next";
import {
  Instrument_Sans,
  Newsreader,
  Tiro_Devanagari_Hindi,
  Tiro_Devanagari_Sanskrit,
} from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

const tiroSanskrit = Tiro_Devanagari_Sanskrit({
  variable: "--font-tiro-sanskrit",
  subsets: ["devanagari", "latin"],
  weight: "400",
});

const tiroHindi = Tiro_Devanagari_Hindi({
  variable: "--font-tiro-hindi",
  subsets: ["devanagari"],
  weight: "400",
});

export const metadata: Metadata = {
  title: {
    default: "Gita Guide",
    template: "%s · Gita Guide",
  },
  description:
    "Ask life's questions and get answers grounded in the Bhagavad Gita, with every verse cited.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5efe3" },
    { media: "(prefers-color-scheme: dark)", color: "#14110e" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${instrument.variable} ${tiroSanskrit.variable} ${tiroHindi.variable} h-full antialiased`}
    >
      <body className="relative flex min-h-full flex-col">
        <SiteHeader />
        <div className="relative z-10 flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
