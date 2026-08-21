import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "What should I charge? | Contractor Job Pricing Calculator",
  description:
    "A plain-language pricing calculator for contractors. Enter your crew, materials, other job costs, and profit goal to get a recommended price to charge.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f5136",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#calculator">
          Skip to the calculator
        </a>
        {children}
      </body>
    </html>
  );
}
