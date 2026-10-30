// Server-rendered artwork. Separate IDs keep the two header variants' SVG
// paint servers independent, including in Safari when one header is hidden.
function AnniversarySeal({ id }: { id: string }) {
  const leaves = [
    'M21 10C14 8 14 3 17 0C22 2 24 6 21 10Z',
    'M17 17C9 15 8 10 10 6C16 8 19 12 17 17Z',
    'M14 25C6 23 4 18 6 14C12 16 16 20 14 25Z',
    'M14 33C5 33 2 28 3 24C10 24 14 28 14 33Z',
    'M17 41C8 43 4 39 4 35C11 33 16 36 17 41Z',
    'M22 47C14 51 8 49 7 44C14 41 20 43 22 47Z',
    'M18 17C18 10 22 7 27 8C27 14 23 18 18 17Z',
    'M15 26C15 18 19 15 24 16C24 22 21 26 15 26Z',
    'M16 34C17 26 22 24 26 26C24 32 21 35 16 34Z',
    'M20 42C23 35 28 33 32 36C29 41 25 44 20 42Z',
  ];
  return <svg className="tt-anniversary-bar__badge" viewBox="0 0 100 58" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-gold`} x1="0" y1="0" x2=".3" y2="1">
        <stop stopColor="#fff3bb"/><stop offset=".45" stopColor="#f5d57b"/><stop offset=".72" stopColor="#b98429"/><stop offset="1" stopColor="#ffe4a0"/>
      </linearGradient>
      <g id={`${id}-laurel`} fill={`url(#${id}-gold)`}>
        <path d="M23 5C5 22 10 43 31 53" fill="none" stroke="#c19742" strokeWidth="1"/>
        {leaves.map((d, index) => <path key={index} d={d}/>)}
      </g>
    </defs>
    <rect x="23" y="9" width="54" height="40" rx="20" fill="#52080a" fillOpacity=".18" stroke="#c6983e" strokeWidth="1.1"/>
    <use href={`#${id}-laurel`}/><use href={`#${id}-laurel`} transform="translate(100 0) scale(-1 1)"/>
    <text x="50" y="39" textAnchor="middle" className="tt-anniversary-bar__four" fill={`url(#${id}-gold)`}>4</text>
    <path d="m61 43 1.1 4.8L68 49l-5.9 1.1L61 55l-1.1-4.9L54 49l5.9-1.2Z" fill="#fff4c2"/>
  </svg>;
}

export default function AnniversaryAnnouncementBar({ variant }: { variant: 'desktop' | 'mobile' }) {
  const id = `tt-announcement-${variant}`;
  return (
    <aside className="tt-anniversary-bar" aria-label="Kỷ niệm 4 năm thành lập Toàn Trung TP.HCM">
      <div className="tt-anniversary-bar__inner">
        <AnniversarySeal id={id}/>
        <span className="tt-anniversary-bar__divider" aria-hidden="true"/>
        <p className="tt-anniversary-bar__desktop">KỶ NIỆM <strong>4 NĂM</strong> THÀNH LẬP TOÀN TRUNG TP.HCM</p>
        <span className="tt-anniversary-bar__diamond" aria-hidden="true"/>
        <p className="tt-anniversary-bar__years">2022–2026</p>
        <span className="tt-anniversary-bar__diamond tt-anniversary-bar__diamond--end" aria-hidden="true"/>
        <p className="tt-anniversary-bar__mobile">KỶ NIỆM <strong>4 NĂM</strong> THÀNH LẬP<span>TOÀN TRUNG TP.HCM <i aria-hidden="true">·</i> <em>2022–2026</em></span></p>
      </div>
    </aside>
  );
}
