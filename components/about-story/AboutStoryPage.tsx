import Link from 'next/link';
import ResponsiveImage from '@/components/common/ResponsiveImage';
import { responsiveImage } from '@/lib/image-delivery';
import { chapter, internalStoryHref, stageKeys, stageMilestones, usableStoryImage,
  type PublishedStory, type StoryChapter, type StoryImage } from './types';
import AboutStoryMotion from './AboutStoryMotion';

const stageLabels: Record<(typeof stageKeys)[number], string> = {
  '1997-2017': '1997 — 2017',
  '2018-2022': '2018 — 2022',
  '2024-2025': '2024 — 2025',
  '2026': '2026',
};

function pictureImages(images: StoryImage[]) {
  const valid = images.filter(usableStoryImage);
  return {
    desktop: valid.find(image => image.placement === 'desktop') ?? valid.find(image => image.placement === 'gallery') ?? valid[0],
    mobile: valid.find(image => image.placement === 'mobile'),
  };
}

/** Art direction uses one picture so browsers select one source, without manual duplicate preloads. */
function StoryPicture({ images, hero = false, className = '' }: { images: StoryImage[]; hero?: boolean; className?: string }) {
  const { desktop, mobile } = pictureImages(images);
  if (!desktop) return null;
  const heroSizes = '100vw';
  const mobileDelivery = mobile ? responsiveImage(mobile.url, hero ? 'hero' : 'content', hero ? heroSizes : '(max-width: 640px) calc(100vw - 32px)', mobile) : null;
  return <picture className={className}>
    {mobile && mobileDelivery && <source media="(max-width: 640px)" srcSet={mobileDelivery.srcSet || mobileDelivery.src} sizes={mobileDelivery.sizes} />}
    <ResponsiveImage src={desktop.url} dimensions={desktop} profile={hero ? 'hero' : 'content'}
      alt={desktop.alt} width={desktop.width} height={desktop.height}
      sizes={hero ? heroSizes : '(max-width: 960px) calc(100vw - 32px), 760px'}
      loading={hero ? 'eager' : 'lazy'} fetchPriority={hero ? 'high' : undefined}
      decoding="async" />
  </picture>;
}

function Opening({ section, page }: { section: StoryChapter; page: PublishedStory }) {
  const { desktop } = pictureImages(section.images);
  const destinations = [{key:'milestones',href:'#tt-story-history'},{key:'stories',href:'#tt-story-stories'},
    {key:'people',href:'#tt-story-people'},{key:'future',href:'#tt-story-future'}] as const;
  const next = destinations.find(item => chapter(page,item.key)?.visible !== false);
  return <section className={`tt-story__hero ${desktop ? 'tt-story__hero--image' : ''}`} id="tt-story-opening" aria-labelledby="tt-story-title">
    {desktop && <StoryPicture images={section.images} hero className="tt-story__hero-picture" />}
    <div className="tt-story__hero-shade" aria-hidden="true" />
    <div className="tt-story__hero-inner">
      <p className="tt-story__eyebrow">TOÀN TRUNG · CÂU CHUYỆN THƯƠNG HIỆU</p>
      <h1 id="tt-story-title">{section.title}</h1>
      {section.subtitle && <p className="tt-story__hero-lead">{section.subtitle}</p>}
      {section.body && <p className="tt-story__hero-body">{section.body}</p>}
      {next && <a className="tt-story__scroll-cue" href={next.href}><span aria-hidden="true">↓</span> Khám phá hành trình</a>}
    </div>
    <span className="tt-story__hero-edge" aria-hidden="true">1997 <span /> HÔM NAY</span>
  </section>;
}

function ChapterHeading({ index, section, id }: { index: string; section: StoryChapter; id: string }) {
  return <header className="tt-story__chapter-heading"><p className="tt-story__chapter-index">{index} / 05</p><div><p className="tt-story__kicker">CÂU CHUYỆN TOÀN TRUNG</p><h2 id={id}>{section.title}</h2>{section.subtitle && <p className="tt-story__chapter-lead">{section.subtitle}</p>}</div></header>;
}

function History({ section, page }: { section: StoryChapter; page: PublishedStory }) {
  const groups = stageKeys.map(stage => ({ stage, rows: stageMilestones(page, stage) })).filter(group => group.rows.length);
  return <section className="tt-story__history" id="tt-story-history" aria-labelledby="tt-story-history-title">
    <div className="tt-story__wrap"><ChapterHeading index="02" section={section} id="tt-story-history-title" />
      {section.body && <p className="tt-story__chapter-copy">{section.body}</p>}
      {groups.length ? <>
        <nav className="tt-story__stage-nav" aria-label="Các giai đoạn lịch sử">{groups.map(({stage}) => <a key={stage} href={`#tt-story-stage-${stage}`}>{stageLabels[stage]}</a>)}</nav>
        {groups.map(({stage,rows},groupIndex) => <div className="tt-story__stage" id={`tt-story-stage-${stage}`} key={stage}>
          <div className="tt-story__stage-heading"><span>0{groupIndex+1}</span><h3>{stageLabels[stage]}</h3></div>
          <ol className="tt-story__timeline">{rows.map((item,index) => {
            const hasImage = Boolean(pictureImages(item.images).desktop);
            return <li className={`tt-story__milestone ${item.featured ? 'tt-story__milestone--featured' : ''}`} key={item.id}>
              <div className="tt-story__milestone-marker" aria-hidden="true" />
              <article className="tt-story__milestone-content">
                <div className="tt-story__milestone-text"><p className="tt-story__year">{item.eventDate ? <time dateTime={item.eventDate}>{item.periodLabel}</time> : item.periodLabel}</p><h4>{item.title}</h4><p className="tt-story__milestone-summary">{item.summary}</p>{item.body && <p className="tt-story__milestone-body">{item.body}</p>}</div>
                <figure className={`tt-story__milestone-media ${hasImage ? '' : 'tt-story__milestone-media--empty'}`}>
                  {hasImage ? <StoryPicture images={item.images} /> : <div className="tt-story__milestone-placeholder" aria-hidden="true"><span>{item.periodLabel}</span></div>}
                </figure>
              </article>
              <span className="tt-story__milestone-count" aria-hidden="true">{String(index+1).padStart(2,'0')}</span>
            </li>;
          })}</ol>
        </div>)}
      </> : <p className="tt-story__empty">Các cột mốc đang được xác minh trước khi công bố.</p>}
    </div>
  </section>;
}

function Stories({ section, page }: { section: StoryChapter; page: PublishedStory }) {
  return <section className="tt-story__stories" id="tt-story-stories" aria-labelledby="tt-story-stories-title"><div className="tt-story__wrap">
    <ChapterHeading index="03" section={section} id="tt-story-stories-title" />
    {section.body && <p className="tt-story__chapter-copy">{section.body}</p>}
    {page.stories.length ? <div className="tt-story__story-viewport"><ul className={`tt-story__story-grid ${page.stories.length > 1 ? 'tt-story__story-grid--sequence' : ''}`}>{page.stories.map(story => <li key={story.id} className="tt-story__story-card"><article tabIndex={0}>
      <div className="tt-story__story-media">{pictureImages(story.images).desktop && <StoryPicture images={story.images} />}</div>
      <div className="tt-story__story-copy"><h3>{story.title}</h3><p>{story.body}</p>{story.quote && <blockquote>“{story.quote}”</blockquote>}{story.displayName && <p className="tt-story__story-name">{story.displayName}</p>}</div>
    </article></li>)}</ul></div> : <div className="tt-story__empty tt-story__empty--stories"><span aria-hidden="true">“ ”</span><p>Những câu chuyện khách hàng đã được đồng ý công bố sẽ xuất hiện tại đây.</p></div>}
  </div></section>;
}

function People({ section }: { section: StoryChapter }) {
  const approved = section.images.filter(usableStoryImage);
  const gallery = approved.filter(image => image.placement === 'gallery');
  const display = gallery.length ? gallery.slice(0, 3) : approved.filter(image => image.placement === 'desktop').slice(0, 1);
  return <section className="tt-story__people" id="tt-story-people" aria-labelledby="tt-story-people-title"><div className="tt-story__wrap">
    <ChapterHeading index="04" section={section} id="tt-story-people-title" />
    <div className={`tt-story__people-layout ${display.length ? '' : 'tt-story__people-layout--text'}`}>
      <div className="tt-story__people-copy">{section.body && <p>{section.body}</p>}<span className="tt-story__people-rule" aria-hidden="true" /></div>
      {display.length > 0 && <div className={`tt-story__collage tt-story__collage--${display.length}`}>{display.map(image => <figure key={image.id}>
        <ResponsiveImage src={image.url} dimensions={image} profile="content" alt={image.alt} width={image.width} height={image.height} sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1024px) 45vw, 36vw" loading="lazy" decoding="async" />
        <figcaption>{image.alt}</figcaption>
      </figure>)}</div>}
    </div>
  </div></section>;
}

function Future({ section }: { section: StoryChapter }) {
  const href = internalStoryHref(section.ctaHref);
  return <section className="tt-story__future" id="tt-story-future" aria-labelledby="tt-story-future-title"><div className="tt-story__wrap tt-story__future-grid">
    <div className="tt-story__future-copy"><p className="tt-story__chapter-index">05 / 05</p><p className="tt-story__kicker">CHẶNG ĐƯỜNG PHÍA TRƯỚC</p><h2 id="tt-story-future-title">{section.title}</h2>{section.subtitle && <p className="tt-story__chapter-lead">{section.subtitle}</p>}{section.body && <p className="tt-story__future-body">{section.body}</p>}
      {href && section.ctaLabel && <Link className="tt-story__cta" href={href}>{section.ctaLabel}<span aria-hidden="true">↗</span></Link>}
    </div>
    {pictureImages(section.images).desktop && <figure className="tt-story__future-media"><StoryPicture images={section.images} /></figure>}
  </div></section>;
}

export default function AboutStoryPage({ page }: { page: PublishedStory }) {
  const opening = chapter(page,'opening'), history = chapter(page,'milestones'), stories = chapter(page,'stories'), people = chapter(page,'people'), future = chapter(page,'future');
  if (!opening || !history || !stories || !people || !future) return null;
  return <main className="tt-story">
    {opening.visible !== false ? <Opening section={opening} page={page}/> : <header className="tt-story__fallback-title"><h1>{opening.title}</h1></header>}
    {history.visible !== false && <History section={history} page={page}/>}
    {stories.visible !== false && <Stories section={stories} page={page}/>}
    {people.visible !== false && <People section={people}/>}
    {future.visible !== false && <Future section={future}/>}<AboutStoryMotion />
  </main>;
}
