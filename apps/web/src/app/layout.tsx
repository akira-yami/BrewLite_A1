import type { Metadata } from "next";
import { Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const playfair = Playfair_Display({
  subsets: ["latin", "vietnamese"],
  variable: "--font-serif",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BrewLite — Cà phê & Trà",
  description: "Đặt đồ uống nhanh chóng và thưởng thức hương vị ấm áp.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={`h-full antialiased ${playfair.variable} ${jakarta.variable}`}>
      <body className="flex min-h-full flex-col font-sans bg-[#FBF8F2] text-[#1E1915]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
