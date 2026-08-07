import type { Metadata } from "next";
import "./design-system.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nothing Superapp",
  description: "The shell / OS of Nothing Superapp",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
