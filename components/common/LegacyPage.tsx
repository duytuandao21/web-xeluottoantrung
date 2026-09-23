import LegacyContent from "@/components/common/LegacyContent";
import type { LegacyPageData } from "@/types/legacy";
import inventory from '@/data/cars.json';
import type {Car} from '@/types/car';

export default function LegacyPage({ page }: { page: LegacyPageData }) {
  const cars:Record<string,Car>={};
  for(const match of page.content.matchAll(/data-key="([^"]+)"/g)) {
    const car=(inventory as Record<string,Car>)[match[1]];
    if(car) cars[match[1]]=car;
  }
  return <LegacyContent key={page.route} html={page.content} cars={cars} />;
}
