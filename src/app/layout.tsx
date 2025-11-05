import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Konchina - Online Card Game",
  description: "Play Konchina, a real-time multiplayer card game",
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
    ],
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
