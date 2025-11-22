import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Raven Transition Studio",
  description: "Transform images with a cinematic raven-style sweep transition."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
