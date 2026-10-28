import Link from 'next/link';
import './error-state.css';

export type ErrorCode = 401 | 403 | 404 | 429 | 500 | 503;

const messages = {
  401: { label: 'Cần đăng nhập', title: 'Đăng nhập để tiếp tục', description: 'Nội dung này dành cho tài khoản được cấp quyền. Vui lòng đăng nhập để tiếp tục hành trình cùng Toàn Trung.' },
  403: { label: 'Quyền truy cập', title: 'Bạn chưa có quyền truy cập', description: 'Tài khoản hiện tại chưa được cấp quyền xem nội dung này. Vui lòng liên hệ người quản trị nếu bạn cần được hỗ trợ.' },
  404: { label: 'Không tìm thấy trang', title: 'Có vẻ bạn đã đi chệch một chút', description: 'Đường dẫn có thể đã thay đổi hoặc trang không còn tồn tại. Những chiếc xe phù hợp với bạn vẫn đang chờ được khám phá.' },
  429: { label: 'Vui lòng chờ', title: 'Chậm lại một chút nhé', description: 'Bạn đã gửi nhiều yêu cầu trong thời gian ngắn. Vui lòng đợi ít phút rồi thử lại.' },
  500: { label: 'Gián đoạn tạm thời', title: 'Tạm thời chưa tải được trang', description: 'Đã có sự cố trong lúc tải nội dung. Bạn có thể thử lại hoặc trở về trang chủ để tiếp tục xem xe.' },
  503: { label: 'Dịch vụ tạm gián đoạn', title: 'Chúng tôi sẽ sớm trở lại', description: 'Dịch vụ hiện chưa sẵn sàng. Vui lòng thử lại sau ít phút. Cảm ơn bạn đã kiên nhẫn đồng hành cùng Toàn Trung.' },
} satisfies Record<ErrorCode, { label: string; title: string; description: string }>;

type Props = {
  code: ErrorCode;
  onRetry?: () => void;
  onSignIn?: () => void;
  pending?: boolean;
  standalone?: boolean;
};

function Arrow() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function ErrorState({ code, onRetry, onSignIn, pending = false, standalone = false }: Props) {
  const message = messages[code];
  const browse = code === 404;
  return <main className={`tt-error${standalone ? ' tt-error--standalone' : ''}`} aria-labelledby="tt-error-title">
    <div className="tt-error__container">
      {standalone && <Link prefetch={false} className="tt-error__brand" href="/"><span>XE LƯỚT</span> TOÀN TRUNG</Link>}
      <section className="tt-error__card">
        <div className="tt-error__content">
          <p className="tt-error__label" aria-label={`Lỗi ${code}. ${message.label}`}>{message.label}</p>
          <h1 id="tt-error-title">{message.title}</h1>
          <p className="tt-error__description">{message.description}</p>
          <div className="tt-error__actions">
            {onRetry ? <button className="tt-error__button tt-error__button--primary" type="button" disabled={pending} aria-busy={pending} onClick={onRetry}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12 5" strokeLinecap="round" strokeLinejoin="round" /></svg>{pending ? 'Đang tải lại…' : 'Thử lại'}
            </button> : code === 401 && onSignIn ? <button type="button" className="tt-error__button tt-error__button--primary" onClick={onSignIn}>Đăng nhập <Arrow /></button>
              : <Link prefetch={false} className="tt-error__button tt-error__button--primary" href={browse ? '/san-pham' : '/'}>{browse ? 'Khám phá xe đang bán' : 'Về trang chủ'}<Arrow /></Link>}
            {(onRetry || browse || code === 401 && onSignIn) && <Link prefetch={false} className="tt-error__button tt-error__button--secondary" href="/">Về trang chủ</Link>}
            {!onRetry && !browse && !(code === 401 && onSignIn) && <Link prefetch={false} className="tt-error__button tt-error__button--secondary" href="/san-pham">Xem xe đang bán</Link>}
          </div>
        </div>
        <div className="tt-error__art" aria-hidden="true">
          <div className="tt-error__orbit" />
          <span className="tt-error__code">{code}</span>
          <div className="tt-error__road">
            <svg className="tt-error__car" viewBox="0 0 160 64" fill="none"><path d="m19 35 11-5 15-17h54l24 17 21 5 6 13H12l7-13Z" fill="white" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /><path d="m44 29 9-10h21v10H44Zm38 0V19h13l14 10H82Z" fill="currentColor" opacity=".13" /><path d="M129 37h12M23 39h9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><circle cx="43" cy="49" r="9" fill="white" stroke="currentColor" strokeWidth="3" /><circle cx="121" cy="49" r="9" fill="white" stroke="currentColor" strokeWidth="3" /><circle cx="43" cy="49" r="3" fill="currentColor" /><circle cx="121" cy="49" r="3" fill="currentColor" /></svg>
          </div>
          <span className="tt-error__art-caption">MỘT ĐIỂM DỪNG NHỎ TRÊN HÀNH TRÌNH</span>
        </div>
      </section>
    </div>
  </main>;
}
