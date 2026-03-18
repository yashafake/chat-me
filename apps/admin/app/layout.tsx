import type { Metadata } from "next";
import type { Viewport } from "next";
import type { ReactNode } from "react";

import { PwaBootstrap } from "../components/pwa-bootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: "chat-me operator console",
  description: "Self-hosted multi-tenant operator admin for chat-me",
  manifest: "/admin/manifest.webmanifest",
  icons: {
    icon: "/admin/pwa-icon.svg",
    apple: "/admin/pwa-icon.svg"
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "chat-me"
  }
};

export const viewport: Viewport = {
  themeColor: "#08101a",
  colorScheme: "dark"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <PwaBootstrap />
        <main className="mx-auto min-h-screen max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
