import type { Metadata } from "next";
import type { ReactNode } from "react";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import "./globals.css";
import { Suspense } from 'react';
import SiteInteractions from '@/components/common/SiteInteractions';
import { allPublicLookups, publicApi } from '@/lib/public-api';
import { groupShowrooms, type Branch, type Region } from '@/lib/showrooms';

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

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const results = await Promise.allSettled([
    publicApi<{ key: string; value: string }[]>('/site-settings/thiet-lap-thong-tin'),
    allPublicLookups<Branch>('/lookups/branches'),
    allPublicLookups<Region>('/lookups/branch-regions'),
  ]);
  const settings = results[0].status === 'fulfilled' ? results[0].value : [];
  const branches = results[1].status === 'fulfilled' ? results[1].value : [];
  const regions = results[2].status === 'fulfilled' ? results[2].value : [];
  const info = Object.fromEntries(settings.map(row => [row.key, row.value]));
  const showrooms = groupShowrooms(branches, regions);
  return (
    <html lang="vi"><head>{legacyStyles.map((href) => <link key={href} rel="stylesheet" href={href} />)}</head>
      <body><div className="wapper"><Header phone={info.phone || info.hotline} />{children}<Footer showrooms={showrooms} phone={info.phone || info.hotline} address={info.address} /></div><Suspense fallback={null}><SiteInteractions/></Suspense></body>
    </html>
  );
}
