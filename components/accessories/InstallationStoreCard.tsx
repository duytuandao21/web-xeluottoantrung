export type InstallationStore = {
  name: string;
  location: string;
  phone: string;
  mapUrl: string;
  coverImageUrl?: string;
  logoImageUrl: string;
};

export default function InstallationStoreCard({ store, kind = 'installation' }: { store: InstallationStore; kind?: 'installation' | 'branch' }) {
  const telephone = store.phone.replace(/[^+\d]/g, '');
  const branch = kind === 'branch';
  return <section className={`tt-installation-store${branch ? ' tt-installation-store--branch' : ''}`} aria-label={branch ? 'Chi nhánh đang có xe' : 'Cửa hàng lắp đặt phụ kiện'}>
    {store.coverImageUrl
      ? <img className="tt-installation-store__cover" src={store.coverImageUrl} alt={`${branch ? 'Chi nhánh' : 'Cửa hàng lắp đặt'} ${store.name}`} loading="lazy" />
      : <div className="tt-installation-store__cover tt-installation-store__cover--empty"><span>Ảnh {branch ? 'chi nhánh' : 'cửa hàng'} đang được cập nhật</span></div>}
    <div className="tt-installation-store__body">
      <div className="tt-installation-store__identity">
        <span className="tt-installation-store__logo"><img src={store.logoImageUrl} alt={`Logo ${store.name}`} loading="lazy" /></span>
        <div><small>{branch ? 'Chi nhánh đang có xe' : 'Cửa hàng lắp đặt'}</small><h2>{store.name}</h2></div>
      </div>
      <div className="tt-installation-store__location-row">
        <p><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>{store.location}</p>
        <a href={store.mapUrl} target="_blank" rel="noopener noreferrer">Xem vị trí {branch ? 'chi nhánh' : 'cửa hàng'} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></a>
      </div>
      {telephone && <a className="tt-installation-store__phone" href={`tel:${telephone}`} aria-label={`Gọi ${branch ? 'chi nhánh' : 'cửa hàng'} ${store.phone}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3.09 5.18 2 2 0 0 1 5.08 3h3a2 2 0 0 1 2 1.72l.54 3.2a2 2 0 0 1-.57 1.7L8.3 11.38a16 16 0 0 0 4.32 4.32l1.77-1.75a2 2 0 0 1 1.7-.57l3.2.54A2 2 0 0 1 22 16.92Z"/></svg>
        {store.phone}
      </a>}
    </div>
  </section>;
}
