import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import Navbar from "@/components/layout/navbar";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "ContextForge",
  description:
    "Generate a versioned AI development context package - the persistent memory layer for AI coding assistants.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  const app = (
    <html lang="en" className={cn("font-sans", inter.variable)}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Navbar />
        {children}
      </body>
    </html>
  );

  return clerkEnabled ? <ClerkProvider>{app}</ClerkProvider> : app;
}
