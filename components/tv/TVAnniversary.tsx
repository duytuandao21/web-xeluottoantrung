import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTVAnniversaryMotion } from './use-tv-anniversary-motion';
import { TVAnniversarySparkles } from './TVAnniversaryExtras';

// One outline for both the beveled numeral and its existing light sweep.
const fourOutline = 'M49 5H73V58H82V76H73V95H52V76H18V57ZM52 29 34 58H52Z';
const fourMask = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path fill="white" fill-rule="evenodd" d="${fourOutline}"/></svg>`)}")`;
const ribbonOutline = 'M35 15Q320-11 605 15V89Q320 63 35 89Z';

/** Header clearance follows the QR; the footer ribbon is continuous and static. */
export const TVAnniversaryTrim = memo(function TVAnniversaryTrim({ position, silk = true }: { position: 'header' | 'footer'; silk?: boolean }) {
  const root = useRef<SVGSVGElement>(null);
  const [clearance, setClearance] = useState<{ x: number; y: number; width: number; height: number }[]>([]);
  useEffect(() => {
    if (position !== 'header') return;
    const svg = root.current;
    const parent = svg?.parentElement;
    if (!svg || !parent) return;
    let live = true;
    const selector = '.tv-qr';
    const fit = () => {
      if (!live) return;
      const bounds = svg.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const gap = Math.max(8, Math.min(24, innerWidth / 1920 * 12));
      const scaleX = 1920 / bounds.width;
      const scaleY = 162 / bounds.height;
      const boxes = [...parent.querySelectorAll(selector)].map(node => {
        const box = node.getBoundingClientRect();
        return { x: (box.left - bounds.left - gap) * scaleX, y: (box.top - bounds.top - gap) * scaleY,
          width: (box.width + gap * 2) * scaleX, height: (box.height + gap * 2) * scaleY };
      });
      setClearance(previous => JSON.stringify(previous) === JSON.stringify(boxes) ? previous : boxes);
      const qrContent = [...parent.querySelectorAll('.tv-qr > span, .tv-qr img')];
      if (qrContent.length) {
        const contentLeft = Math.min(...qrContent.map(node => node.getBoundingClientRect().left));
        parent.style.setProperty('--tv-event-safe-right', `${Math.max(0, (bounds.right - contentLeft + gap) / bounds.width * 100)}%`);
      }
    };
    // Observe only layout changes, never animation frames.
    const observer = new ResizeObserver(fit);
    observer.observe(parent);
    for (const node of parent.querySelectorAll(selector)) observer.observe(node);
    for (const node of parent.querySelectorAll('.tv-qr > span, .tv-qr img')) observer.observe(node);
    void document.fonts.ready.then(fit);
    fit();
    return () => { live = false; observer.disconnect(); parent.style.removeProperty('--tv-event-safe-right'); };
  }, [position]);
  const gold = `tv-anniversary-gold-${position}`;
  const red = `tv-anniversary-red-${position}`;
  const mask = `tv-anniversary-clearance-${position}`;
  return <svg ref={root} className={`tv-anniversary-trim tv-anniversary-trim--${position}`} viewBox={position === 'header' ? '0 0 1920 162' : '0 0 1920 100'}
    style={{ visibility: position === 'header' && !clearance.length ? 'hidden' : undefined }}
    preserveAspectRatio="none" fill="none" aria-hidden="true" focusable="false">
    <defs>
      {position === 'header' && <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="162" style={{ maskType: 'luminance' }}>
        <rect width="1920" height="162" fill="#fff"/>
        {clearance.map((box, index) => <rect key={index} {...box} fill="#000"/>)}
      </mask>}
      <linearGradient id={gold} x1="0" y1="0" x2="1" y2=".7" gradientUnits="objectBoundingBox">
        <stop stopColor="#92500d"/><stop offset=".2" stopColor="#e9ad36"/><stop offset=".4" stopColor="#fff3ba"/>
        <stop offset=".6" stopColor="#d69b29"/><stop offset=".82" stopColor="#fff0ac"/><stop offset="1" stopColor="#bb781a"/>
      </linearGradient>
      <linearGradient id={red} x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
        <stop stopColor="#ed171c"/><stop offset=".48" stopColor="#df0008"/><stop offset="1" stopColor="#a50010"/>
      </linearGradient>
    </defs>
    <g mask={position === 'header' ? `url(#${mask})` : undefined}>{position === 'header' ? <>
      <g id="tv-anniversary-corner">
        <path d="M0 0H205C141 8 74 21 33 41 17 49 6 59 0 71Z" fill={`url(#${red})`}/>
        <path d="M0 63C42 23 114 8 186 0H144C73 9 29 25 0 45Z" fill={`url(#${gold})`}/>
        <path d="M0 19C58 14 82 4 92 0H32L0 8Z" fill="#ff3535" opacity=".7"/>
        <path d="M0 162H26L0 140Z" fill={`url(#${red})`}/>
        <path d="M0 151 17 162H0Z" fill={`url(#${gold})`}/>
      </g>
      {/* Stay in the outer gutter beside the full-size QR. */}
      <use href="#tv-anniversary-corner" transform="translate(1920 0) scale(-.14 1)"/>
      <g fill={`url(#${gold})`}>
        <path d="m356 8 9 6-6 9-9-6ZM1476 17l12-4 4 10-12 4ZM323 126l10 4-4 11-10-5Z"/>
        <path d="M391 28c22 1 6 27 29 28l-8 8c-24-5-7-24-27-28ZM1554 42c-17 0-12 22-34 21l9 8c23-2 13-19 31-20Z"/>
        <g className={silk ? 'tv-event-silk tv-event-silk--left tv-event-animated' : undefined}><path d="M533 108c25 20 41-14 69-11 17 2 34 17 50 10-19 21-36-1-53 0-28 1-40 34-70 12Z"/></g>
        <g className={silk ? 'tv-event-silk tv-event-silk--right tv-event-animated' : undefined}><path d="M1324 100c27-23 40-11 59-4 19 8 31 4 43-8-9 29-30 28-47 18-17-10-35-15-52 5Z"/></g>
      </g>
      <path d="M416 0 323 162M1504 0l93 162" stroke="#ebca91" strokeWidth="25" opacity=".08"/>
    </> : <>
      <path d="M0 55C4 80 10 85 40 86 420 91 674 79 1000 85S1570 92 1880 86C1910 85 1916 80 1920 55V100H0Z" fill={`url(#${gold})`}/>
      <path d="M0 70C14 86 30 91 84 92 420 98 720 88 1040 92S1570 99 1836 92C1890 91 1906 86 1920 70V100H0Z" fill={`url(#${red})`}/>
      <path d="M0 90C190 105 390 95 590 98H0ZM1920 90C1730 105 1530 95 1330 98H1920Z" fill="#f8141c"/>
      <path d="M0 59C4 82 10 87 40 88 420 93 674 81 1000 87S1570 94 1880 88C1910 87 1916 82 1920 59" stroke="#fff4cd" strokeWidth="1.2"/>
    </>}</g>
  </svg>;
});

export const TVAnniversaryBadge = memo(function TVAnniversaryBadge({ sparkles = true }: { sparkles?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useTVAnniversaryMotion(root);
  return <div ref={root} className="tv-anniversary-badge" role="img" aria-label="Kỷ niệm 4 năm thành lập, 2022–2026">
    {sparkles && <TVAnniversarySparkles/>}
    <div className="tv-anniversary-badge__number" aria-hidden="true">
      <svg className="tv-anniversary-badge__laurel" viewBox="0 0 100 100" preserveAspectRatio="none" fill="url(#tv-anniversary-laurel-gold)" focusable="false">
        <defs><linearGradient id="tv-anniversary-laurel-gold" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff0b3"/><stop offset=".28" stopColor="#d4a13a"/><stop offset=".5" stopColor="#f8db83"/><stop offset=".75" stopColor="#b77e1e"/><stop offset="1" stopColor="#f0c65d"/>
        </linearGradient></defs>
        <g transform="translate(4 5) scale(.92)">
          <g transform="translate(-8 0) scale(1.16 1)">
          <g id="tv-anniversary-laurel"><path d="M30 9C9 28 10 64 38 86L47 92" fill="none" stroke="#bb8626" strokeWidth="1.25"/>
            {[[28, 18, 18], [23, 26, 10], [19, 35, 0], [18, 44, -12], [20, 53, -22], [23, 62, -32], [28, 70, -43], [34, 78, -55], [42, 85, -68]].map(([x, y, angle], index) => <g key={index} transform={`translate(${x} ${y}) rotate(${angle})`}>
              <path d="M0 1C-6-1-9-6-8-11-2-9 0-4 0 1Z"/><path d="M1 0C0-5 4-10 7-12 8-6 5-2 1 0Z"/>
            </g>)}</g>
          <use href="#tv-anniversary-laurel" transform="translate(100 0) scale(-1 1)"/>
          <path d="M47 91C35 87 27 89 21 94C31 95 40 94 47 91ZM53 91C65 87 73 89 79 94C69 95 60 94 53 91Z"/>
          <path d="m44 89 12 7m0-7-12 7" fill="none" stroke="#bb8626" strokeWidth=".9"/>
          </g>
        </g>
      </svg>
      <strong style={{ '--tv-anniversary-number-mask': fourMask } as CSSProperties}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" fill="none" focusable="false">
          <defs><linearGradient id="tv-anniversary-four-gold" x1="35" y1="5" x2="66" y2="95" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff3c6"/><stop offset=".22" stopColor="#f6dc8c"/><stop offset=".48" stopColor="#e9c063"/><stop offset=".7" stopColor="#dbae46"/><stop offset="1" stopColor="#ba882b"/>
          </linearGradient></defs>
          <path d={fourOutline} fill="#956215" fillRule="evenodd" opacity=".45" transform="translate(1.2 1.2)"/>
          <path d={fourOutline} fill="url(#tv-anniversary-four-gold)" fillRule="evenodd" stroke="#c59938" strokeWidth=".65"/>
          <path d="M49 5 18 57H21L51 7ZM49 5H73L71 8H50Z" fill="#fff7d3" opacity=".8"/>
          <path d="M73 5V58H82L79 61H71V8ZM18 73H52V76H18ZM52 92H73V95H52Z" fill="#a9711b" opacity=".45"/>
          <path d="M52 29V58H34M52 76V94" stroke="#fff1bc" strokeWidth=".8"/>
        </svg>
      </strong>
    </div>
    <div className="tv-anniversary-badge__message" aria-hidden="true">
      <strong>
        <span className="tv-anniversary-ribbon-wrap">
        <svg className="tv-anniversary-ribbon" viewBox="0 0 640 92" preserveAspectRatio="none" fill="none" focusable="false">
          <defs>
            <linearGradient id="tv-anniversary-ribbon-face" x1="320" y1="6" x2="320" y2="82" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ff3430"/><stop offset=".3" stopColor="#ed0709"/><stop offset=".72" stopColor="#db0005"/><stop offset="1" stopColor="#b3000a"/>
            </linearGradient>
            <linearGradient id="tv-anniversary-ribbon-edge" x1="20" y1="0" x2="620" y2="92" gradientUnits="userSpaceOnUse">
              <stop stopColor="#a46612"/><stop offset=".25" stopColor="#ffe49a"/><stop offset=".5" stopColor="#cf9527"/><stop offset=".75" stopColor="#fff1ab"/><stop offset="1" stopColor="#aa6a16"/>
            </linearGradient>
            <linearGradient id="tv-anniversary-ribbon-light" x1="0" y1="0" x2="110" y2="30" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fff4b9" stopOpacity="0"/><stop offset=".5" stopColor="#fff9d9" stopOpacity=".7"/><stop offset="1" stopColor="#fff4b9" stopOpacity="0"/>
            </linearGradient>
            <clipPath id="tv-anniversary-ribbon-clip"><path d={ribbonOutline}/></clipPath>
          </defs>
          <path d="M36 35 0 31 15 57 0 91 52 84 52 38Z" fill="#c8000b"/>
          <path d="m604 35 36-4-15 26 15 34-52-7V38Z" fill="#c8000b"/>
          <path d="m0 91 52-7v-4L2 87Zm640 0-52-7v-4l50 7Z" fill="url(#tv-anniversary-ribbon-edge)"/>
          <path d="m35 85 17-1V73Zm570 0-17-1V73Z" fill="#81000b"/>
          <path d={ribbonOutline} fill="url(#tv-anniversary-ribbon-face)" stroke="url(#tv-anniversary-ribbon-edge)" strokeWidth="3"/>
          <path d="M39 19Q320-6 601 19" stroke="#ff8d64" strokeWidth="2" opacity=".55"/>
          <g clipPath="url(#tv-anniversary-ribbon-clip)"><rect className="tv-anniversary-ribbon-glint" width="110" height="92" transform="translate(-130 0)" fill="url(#tv-anniversary-ribbon-light)"/></g>
        </svg>
        </span>
        <span className="tv-anniversary-badge__label">KỶ NIỆM 4 NĂM THÀNH LẬP</span>
      </strong>
      <span className="tv-anniversary-badge__years">2022 – 2026</span>
    </div>
  </div>;
});
