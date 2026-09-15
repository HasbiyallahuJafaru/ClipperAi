import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DESCRIPTION, NAME, SITE } from "./site";

const geist = localFont({ src: "./fonts/Geist-Variable.woff2", weight: "100 900", variable: "--font-geist" });
// the italic accent inside headings (`<em>`), chosen by the user for a more stylish hero
const serif = localFont({ src: "./fonts/InstrumentSerif-Italic.woff2", weight: "400", style: "italic", variable: "--font-serif" });
// the face burned into every clip's captions: used only where the site shows a clip
const montserrat = localFont({ src: "./fonts/Montserrat-ExtraBold.ttf", weight: "800", variable: "--font-montserrat" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: `${NAME}: AI Clip Maker for YouTube Shorts, TikTok & Reels`, template: `%s | ${NAME}` },
  description: DESCRIPTION,
  applicationName: NAME,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: NAME, url: "/", locale: "en_US" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${serif.variable} ${montserrat.variable}`}>
      <body className="min-h-dvh antialiased">
        <ClerkProvider appearance={{
          variables: { colorPrimary: "#2355f5", colorForeground: "#0a1022", fontFamily: "inherit", borderRadius: "0.75rem" },
        }}>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
