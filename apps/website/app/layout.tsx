import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geist = localFont({ src: "./fonts/Geist-Variable.woff2", weight: "100 900", variable: "--font-geist" });
// the face burned into every clip's captions: used only where the site shows a clip
const montserrat = localFont({ src: "./fonts/Montserrat-ExtraBold.ttf", weight: "800", variable: "--font-montserrat" });

export const metadata: Metadata = {
  title: "ClipperAi",
  description: "Turn one video into a month of content: captioned vertical clips, posts for every platform, a calendar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${montserrat.variable}`}>
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
