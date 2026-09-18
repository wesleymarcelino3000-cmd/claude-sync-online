import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Claude Sync Online", description: "Acompanhe suas contas Claude em um só lugar.", icons: { icon: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}</body></html>; }
