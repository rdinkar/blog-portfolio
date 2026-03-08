import type { Metadata } from "next";
import { Lora, Inter } from "next/font/google";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import "./globals.css";

const lora = Lora({
  variable: "--font-serif",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "RDinkar Blog",
    template: "%s | RDinkar Blog",
  },
  description:
    "A personal blog with thoughts on technology, frontend development, and software engineering.",
  openGraph: {
    type: "website",
  },
  verification: {
    google: "y6LLho4A1jFWSWPZ_t9LNrFG3jyml6AEbnYjVtzbZ0U",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${lora.variable} ${inter.variable} font-sans antialiased`}
      >
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
