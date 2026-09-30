import type { Metadata } from "next";
import type { ReactNode } from "react";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import "./globals.css";
import { Suspense } from 'react';
import SiteInteractions from '@/components/common/SiteInteractions';
import { allPublicLookups, publicApi, type Service } from '@/lib/public-api';
import { groupShowrooms, type Branch, type Region } from '@/lib/showrooms';
import { SaleAccessProvider } from '@/components/sale/SaleAccess';
import { getSiteInfo, getSiteName } from '@/lib/site-info';

export async function generateMetadata(): Promise<Metadata> {
  const siteName = await getSiteName();
  return {
    metadataBase: new URL('https://xeluottoantrung.com'),
    title: { default: siteName, template: `%s | ${siteName}` },
    icons: { icon: '/upload/photo/favicon-3815.png' },
  };
}

const legacyStyles = [
  "/assets/bootstrap/bootstrap.css", "/assets/css/all.css", "/assets/fancybox3/jquery.fancybox.css",
  "/assets/slick/slick.css", "/assets/slick/slick-theme.css", "/assets/magiczoomplus/magiczoomplus.css",
  "/assets/css/style.css", "/assets/css/jquery-ui.css", "/assets/css/media.css", "/assets/login/login.css",
];

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const results = await Promise.allSettled([
    getSiteInfo(),
    allPublicLookups<Branch>('/lookups/branches'),
    allPublicLookups<Region>('/lookups/branch-regions'),
    publicApi<{ key: string; value: string }[]>('/site-settings/thiet-lap-footer'),
    allPublicLookups<Service>('/services'),
  ]);
  const info = results[0].status === 'fulfilled' ? results[0].value : {};
  const branches = results[1].status === 'fulfilled' ? results[1].value : [];
  const regions = results[2].status === 'fulfilled' ? results[2].value : [];
  const footerRows = results[3].status === 'fulfilled' ? results[3].value : [];
  const services = results[4].status === 'fulfilled' ? results[4].value : [];
  const footerSettings = Object.fromEntries(footerRows.map(row => [row.key, row.value]));
  const showrooms = groupShowrooms(branches, regions);
  return (
    <html lang="vi"><head>{legacyStyles.map((href) => <link key={href} rel="stylesheet" href={href} />)}</head>
      <body><SaleAccessProvider><div className="wapper"><Header phone={info.phone} services={services} />{children}<Footer showrooms={showrooms} phone={info.phone} zalo={info.zalo} settings={footerSettings} /></div><Suspense fallback={null}><SiteInteractions/></Suspense></SaleAccessProvider></body>
    </html>
  );
}
