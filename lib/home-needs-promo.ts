// Static homepage artwork: no image download or client-side controller needed.
export const homeNeedsPromo = `
<aside class="home-needs-promo" aria-labelledby="home-needs-promo-title">
  <svg class="home-needs-promo__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
    <path d="m10 7 2.7 7.3L20 17l-7.3 2.7L10 27l-2.7-7.3L0 17l7.3-2.7L10 7Z" fill="#164d75"/>
    <path d="m13 32 1.7 4.3L19 38l-4.3 1.7L13 44l-1.7-4.3L7 38l4.3-1.7L13 32Z" fill="#164d75"/>
    <path d="m23 2 1 2.5L26.5 5.5 24 6.5 23 9l-1-2.5-2.5-1L22 4.5 23 2Z" fill="#397caa"/>
    <rect x="24" y="15" width="35" height="46" rx="5" fill="#073b63"/>
    <path d="M29 15h3v46h-3a5 5 0 0 1-5-5V20a5 5 0 0 1 5-5Z" fill="#125582"/>
    <path d="M36 10V8a5 5 0 0 1 10 0v2h3a3 3 0 0 1 3 3v6H30v-6a3 3 0 0 1 3-3h3Z" fill="#ffc337"/>
    <circle cx="41" cy="8" r="2" fill="#fff4d2"/>
    <path d="m30 29 2 2 4-5m-6 15 2 2 4-5m-6 15 2 2 4-5" stroke="#ffcf48" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M42 29h10M42 41h10M42 53h10" stroke="#e9f5ff" stroke-width="2" stroke-linecap="round"/>
  </svg>
  <div class="home-needs-promo__copy">
    <h3 id="home-needs-promo-title">Bạn chưa biết nên chọn xe nào?</h3>
    <p>Khảo sát nhanh cùng Toàn Trung để tìm chiếc xe phù hợp nhất.</p>
  </div>
  <a class="home-needs-promo__button" href="/tien-ich/mua-xe-theo-nhu-cau">
    <span>Tìm xe theo nhu cầu</span>
  </a>
</aside>`;
