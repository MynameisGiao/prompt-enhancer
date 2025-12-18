import type { Metadata } from "next";
import { Delius } from "next/font/google";
import "./globals.css";

const delius = Delius({
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prompt Enhancer",
  description: "Internal Prompt Tool",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${delius.className} antialiased`}>{children}</body>
    </html>
  );
}
