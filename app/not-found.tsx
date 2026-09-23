import Link from "next/link";

export default function NotFound() {
  return <main className="not-found main_fix"><h1>Không tìm thấy trang</h1><p>Trang này không có trong source clone đã cung cấp.</p><Link href="/">Về trang chủ</Link></main>;
}
