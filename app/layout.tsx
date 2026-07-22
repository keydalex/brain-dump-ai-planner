import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "Brain Dump AI Planner",
  description: "AI-планувальник дня у стилі Todoist. Перетворюй хаос на структуровані задачі.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Brain Dump AI",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0B0B0C",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk" className="h-full bg-[#0B0B0C]">
      <body className={`${inter.className} min-h-full flex justify-center bg-[#0B0B0C] text-[#F3F4F6] antialiased`}>
        <div className="mobile-app-container">
          {children}
        </div>
      </body>
    </html>
  );
}
