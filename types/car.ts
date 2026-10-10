export interface Car {
  id: string;
  className: string;
  imageClass: string;
  name: string;
  href: string;
  title?: string;
  nameClass: string;
  images: {src:string;alt:string}[];
  priceHtml: string;
  originalPrice?: number | null;
  specs: {icon?:string;alt?:string;text:string}[];
  compare: boolean;
  status?: string;
  createdAt?: string | null;
  newArrival?: boolean;
  isNewArrival?: boolean;
}
