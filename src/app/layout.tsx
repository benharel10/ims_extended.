import type { Metadata } from "next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { AppHeader } from "@/components/AppHeader";
import { Sidebar } from "@/components/Sidebar";

import { SystemProvider } from "@/components/SystemProvider";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "KSW Inventory",
  description: "Internal Inventory & Production Management System - KSW",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const user = session?.user;

  return (
    <html lang="en">
      <body>
        <SystemProvider user={user}>
          <div className="layout-container">
            <div className="desktop-only-view">
              <Sidebar />
            </div>
            <div className="mobile-only-view">
              <AppHeader />
            </div>
            <main className="main-content">
              {children}
            </main>
            <div className="mobile-only-view">
              <BottomNav />
            </div>
          </div>
        </SystemProvider>
      </body>
    </html>
  );
}
