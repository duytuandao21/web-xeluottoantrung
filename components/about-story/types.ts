export const stageKeys = ['1997-2017', '2018-2022', '2024-2025', '2026'] as const;
export type StoryStage = typeof stageKeys[number];
export type StoryImage = { id: string; url: string; width: number; height: number; alt: string; placement: 'desktop' | 'mobile' | 'gallery' };
export type StoryChapter = { key: 'opening' | 'milestones' | 'stories' | 'people' | 'future'; visible?: boolean; title: string; subtitle: string | null; body: string | null; ctaLabel: string | null; ctaHref: string | null; images: StoryImage[] };
export type StoryMilestone = { id: string; slug: string; periodLabel: string; eventDate: string | null; stage: StoryStage; title: string; summary: string; body: string | null; featured: boolean; images: StoryImage[] };
export type CustomerStory = { id: string; title: string; body: string; quote: string | null; displayName: string | null; images: StoryImage[] };
export type PublishedStory = { chapters: StoryChapter[]; milestones: StoryMilestone[]; stories: CustomerStory[]; publishedAt: string; revision: number };

/** The API accepts only site-relative CTA routes. Fail closed if a snapshot predates validation. */
export function internalStoryHref(value: string | null | undefined): string | null {
  return value && /^\/(?!\/)[a-z0-9/\-]*(?:#[a-z0-9\-]+)?$/.test(value) ? value : null;
}

export function usableStoryImage(image: StoryImage | null | undefined): image is StoryImage {
  if (!image || !Number.isInteger(image.width) || image.width < 1 || image.width > 20000 ||
      !Number.isInteger(image.height) || image.height < 1 || image.height > 20000 || !image.alt?.trim()) return false;
  try { const url = new URL(image.url); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}

export function chapter(page: PublishedStory, key: StoryChapter['key']): StoryChapter | undefined {
  return page.chapters.find(item => item.key === key);
}

export function stageMilestones(page: PublishedStory, stage: StoryStage): StoryMilestone[] {
  return page.milestones.filter(item => item.stage === stage);
}
