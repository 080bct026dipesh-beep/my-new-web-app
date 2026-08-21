import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/layout/NavBar";

export const metadata: Metadata = {
  title: "Kathmandu Bus Route Finder",
  description: "Find direct and single-transfer bus routes across Kathmandu Valley",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex h-full flex-col">
        <NavBar />
        <div className="min-h-0 flex-1">{children}</div>
      </body>
    </html>
  );
}
