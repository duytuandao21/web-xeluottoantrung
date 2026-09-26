import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegacyPage from "@/components/common/LegacyPage";
import { getPublicPage } from "@/lib/public-pages";
import { pageMetadata } from "@/lib/page-metadata";
import type { SearchParams } from "@/types/legacy";

type RouteProps = { params: Promise<{ slug?: string[] }>; searchParams: Promise<SearchParams> };

const pathnameFor = (slug?: string[]) => `/${slug?.join("/") ?? ""}`;

export async function generateMetadata({ params, searchParams }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const pathname = pathnameFor(slug);
  return pageMetadata(await getPublicPage(pathname, await searchParams), pathname);
}

export default async function RoutePage({ params, searchParams }: RouteProps) {
  const { slug } = await params;
  const page = await getPublicPage(pathnameFor(slug), await searchParams);
  if (!page) notFound();
  return <LegacyPage page={page} />;
}
