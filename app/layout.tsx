import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import DashboardNotifications from "@/shared/DashboardNotifications";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import { ToastProvider } from "@/components/ui/ToastProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Yaşam Sistemi",
  description: "Yaşam Sistemi Yönetim Paneli",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <ConfirmProvider>
            <DashboardNotifications />
            {children}
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}