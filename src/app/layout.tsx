import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
            {/* Desktop + iPad: Sidebar (full on desktop, icon-only on iPad) */}
            <div className="desktop-only-view">
              <Sidebar />
            </div>

            {/* iPad only: slim top header with user info */}
            <AppHeader variant="tablet" />

            {/* Mobile only: full app header */}
            <div className="mobile-only-view">
              <AppHeader variant="mobile" />
            </div>

            <main className="main-content">
              {children}
            </main>

            {/* Mobile only: bottom nav */}
            <div className="mobile-only-view">
              <BottomNav />
            </div>
          </div>
        </SystemProvider>
      </body>
    </html>
  );
}
