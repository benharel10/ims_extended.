import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

import { SystemProvider } from "@/components/SystemProvider";

export const metadata: Metadata = {
  title: "KSW Inventory",
  description: "Internal Inventory & Production Management System - KSW",
};


import { getSession } from "@/lib/auth";

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
            <Sidebar />
            <main className="main-content">
              {children}
            </main>
          </div>
        </SystemProvider>
      </body>
    </html>
  );
}
