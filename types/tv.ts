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
};

export type TVHotline = { name: string; phone: string };

export type TVSnapshot = {
  cars: TVCar[];
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
