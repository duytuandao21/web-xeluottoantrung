import type { TVAnniversarySettings } from '@/lib/tv-anniversary-settings';

export type TVCar = {
  slug: string;
  name: string;
  year: number;
  price: number;
  originalPrice: number | null;
  mileage: number | null;
  fuel: string;
  cover: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
  brandSlug: string;
};

export type TVBrand = { slug: string; name: string; imageUrl: string | null };
export type TVHotline = { name: string; phone: string };

export type TVSnapshot = {
  theme?: 'standard' | 'anniversary-4';
  anniversary?: TVAnniversarySettings;
  cars: TVCar[];
  brands: TVBrand[];
  logo: string;
  favicon: string;
  phone: string;
  siteName: string;
  title: string;
  hotlineTitle: string;
  hotlines: TVHotline[];
  carIntervalSeconds: number;
  hotlineIntervalSeconds: number;
  updatedAt: string;
};
