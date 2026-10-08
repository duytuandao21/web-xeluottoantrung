import type { Metadata } from "next";
import type { ReactNode } from "react";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import "./globals.css";
import '@/components/search/search.css';
import { Suspense } from 'react';
import SiteInteractions from '@/components/common/SiteInteractions';
import { allPublicLookups, publicApi, type Service, type CallContact } from '@/lib/public-api';
import { groupShowrooms, type Branch, type Region } from '@/lib/showrooms';
import { SaleAccessProvider } from '@/components/sale/SaleAccess';
import { getSiteInfo, getSiteName } from '@/lib/site-info';
import { getPolicies } from '@/lib/website-content';
import { getSiteBranding } from '@/lib/site-branding';
import type { ContentEntry } from '@/lib/public-api';
import SearchSuggestions from '@/components/search/SearchSuggestions';
import ChatbotLauncher from '@/components/chatbot/ChatbotLauncher';
import '@/components/chatbot/chatbot.css';
import { getImageOriginalUrl } from '@/lib/image-delivery';

export async function generateMetadata(): Promise<Metadata> {
  const [siteName, branding] = await Promise.all([getSiteName(), getSiteBranding()]);
  return {
    metadataBase: new URL('https://xeluottoantrung.com'),
    title: { default: siteName, template: `%s | ${siteName}` },
    icons: { icon: getImageOriginalUrl(branding.favicon) },
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
    publicApi<CallContact[]>('/content', { group: 'thiet-lap-nut-goi' }),
    getPolicies(),
    getSiteBranding(),
    publicApi<ContentEntry[]>('/content', { group: 'thiet-lap-mang-xa-hoi' }),
    publicApi<ContentEntry[]>('/content', { group: 'thiet-lap-ung-dung' }),
  ]);
  const info = results[0].status === 'fulfilled' ? results[0].value : {};
  const branches = results[1].status === 'fulfilled' ? results[1].value : [];
  const regions = results[2].status === 'fulfilled' ? results[2].value : [];
  const footerRows = results[3].status === 'fulfilled' ? results[3].value : [];
  const services = results[4].status === 'fulfilled' ? results[4].value : [];
  const callContacts = results[5].status === 'fulfilled' ? results[5].value : [];
  const policies = results[6].status === 'fulfilled' ? results[6].value : [];
  const branding = results[7].status === 'fulfilled' ? results[7].value : await getSiteBranding();
  const socialLinks = results[8].status === 'fulfilled' ? results[8].value : [];
  const appLinks = results[9].status === 'fulfilled' ? results[9].value : [];
  const footerSettings = Object.fromEntries(footerRows.map(row => [row.key, row.value]));
  const showrooms = groupShowrooms(branches, regions);
  return (
    <html lang="vi"><head>{legacyStyles.map((href) => <link key={href} rel="stylesheet" href={href} />)}</head>
      <body><SaleAccessProvider><div className="wapper"><Header phone={info.phone} services={services} logoUrl={branding.logo} mobileLogoUrl={branding.logoMobile} />{children}<Footer showrooms={showrooms} phone={info.phone} zalo={info.zalo} settings={footerSettings} callContacts={callContacts} policies={policies} logoUrl={branding.logoDark} socialLinks={socialLinks} appLinks={appLinks} /></div><Suspense fallback={null}><SiteInteractions/><SearchSuggestions/></Suspense><ChatbotLauncher /></SaleAccessProvider></body>
    </html>
  );
}
