import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegacyPage from "@/components/common/LegacyPage";
import { getLegacyPage, getStaticRoutes } from "@/lib/pages";
import type { SearchParams } from "@/types/legacy";

type RouteProps = { params: Promise<{ slug?: string[] }>; searchParams: Promise<SearchParams> };

const pathnameFor = (slug?: string[]) => `/${slug?.join("/") ?? ""}`;

export async function generateMetadata({ params, searchParams }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getLegacyPage(pathnameFor(slug), await searchParams);
  if (!page) return {};
  const image = page.openGraphImage ? (page.openGraphImage.startsWith("/") ? page.openGraphImage : `/${page.openGraphImage}`) : undefined;
  return { title: page.title, description: page.description || undefined, alternates: { canonical: pathnameFor(slug) }, openGraph: image ? { title: page.title, description: page.description || undefined, images: [image] } : undefined };
}

export function generateStaticParams() {
  return getStaticRoutes().map((route) => ({ slug: route.slice(1).split("/") }));
}

export default async function RoutePage({ params, searchParams }: RouteProps) {
  const { slug } = await params;
  const page = await getLegacyPage(pathnameFor(slug), await searchParams);
  if (!page) notFound();
  return <LegacyPage page={page} />;
}
