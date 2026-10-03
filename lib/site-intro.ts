// Run before the body is painted so subsequent visits never flash the splash screen.
export const siteIntroBootstrap = `(() => {
  const navigation = performance.getEntriesByType('navigation')[0];
  const reloadHome = location.pathname === '/' && navigation && navigation.type === 'reload';
  let firstVisit = false;
  try {
    firstVisit = sessionStorage.getItem('tt-site-intro-seen') !== '1';
    sessionStorage.setItem('tt-site-intro-seen', '1');
  } catch {
    firstVisit = !document.referrer.startsWith(location.origin + '/');
  }
  if (firstVisit || reloadHome) {
    document.documentElement.dataset.siteIntro = 'loading';
    setTimeout(() => { delete document.documentElement.dataset.siteIntro; }, 8000);
  }
})();`;
