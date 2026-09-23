import type { Metadata } from "next";
import type { ReactNode } from "react";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import "./globals.css";
import { Suspense } from 'react';
import SiteInteractions from '@/components/common/SiteInteractions';

export const metadata: Metadata = {
  metadataBase: new URL("https://xeluottoantrung.com"),
  title: "TOÀN TRUNG",
  icons: { icon: "/upload/photo/favicon-3815.png" },
};

const legacyStyles = [
  "/assets/bootstrap/bootstrap.css", "/assets/css/all.css", "/assets/fancybox3/jquery.fancybox.css",
  "/assets/slick/slick.css", "/assets/slick/slick-theme.css", "/assets/magiczoomplus/magiczoomplus.css",
  "/assets/css/style.css", "/assets/css/jquery-ui.css", "/assets/css/media.css", "/assets/login/login.css",
];

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi"><head>{legacyStyles.map((href) => <link key={href} rel="stylesheet" href={href} />)}</head>
      <body><div className="wapper"><Header />{children}<Footer /></div><Suspense fallback={null}><SiteInteractions/></Suspense></body>
    </html>
  );
}
