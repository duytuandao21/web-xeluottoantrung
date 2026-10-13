export type Promotion = {
  id: string; title: string; kind: 'event' | 'promotion'; imageUrl: string;
  startsAt: string; endsAt: string; status: 'ongoing' | 'upcoming' | 'ended'; content?: string;
};
export type PromotionAd = Pick<Promotion, 'id' | 'title' | 'imageUrl' | 'endsAt'>;
export const promotionLabels = { ongoing: 'Đang diễn ra', upcoming: 'Sắp diễn ra', ended: 'Kết thúc' };
export const promotionDate = (value: string) => {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};
// The chosen end date is inclusive; expiration is the following calendar day.
export const promotionExpiry = (value: string) => +new Date(`${value}T00:00:00+07:00`) + 86400000;
