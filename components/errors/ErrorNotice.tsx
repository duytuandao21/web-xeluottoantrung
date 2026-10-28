import './error-state.css';

export default function ErrorNotice({ message }: { message: string }) {
  return <div className="tt-error-notice" role="alert">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 3h.01" strokeLinecap="round" /></svg>
    <p>{message}</p>
  </div>;
}
