import type { Metadata } from "next";

import "./globals.css";


export const metadata: Metadata = {
  title: "Toilet Scraper APP",
  description: "UI demo layer of toiler scraper App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
