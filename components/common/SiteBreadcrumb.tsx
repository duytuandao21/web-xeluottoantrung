import Link from 'next/link';

type Crumb = { label: string; href?: string };

export default function SiteBreadcrumb({ items }: { items: Crumb[] }) {
  return <div className="breadCrumbs"><div className="main_fix">
    <nav aria-label="Đường dẫn"><ol className="site-breadcrumb">
      {items.map((item, index) => {
        const current = index === items.length - 1;
        const label = <>{index === 0 && <svg className="site-breadcrumb__home" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 1 12h3v10h6v-6h4v6h6V12h3L12 2Z" /></svg>}<span>{item.label}</span></>;
        return <li key={`${item.label}-${index}`}>
          {item.href && !current ? <Link href={item.href}>{label}</Link> : <span aria-current={current ? 'page' : undefined}>{label}</span>}
        </li>;
      })}
    </ol></nav>
  </div></div>;
}
