import http from 'k6/http';
import { check, sleep } from 'k6';
const base = __ENV.BASE_URL;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base || '')) throw Error('Local loopback target required');
const workload = __ENV.WORKLOAD || 'home';
const target = Number(__ENV.TARGET || 20);
if (![10, 20].includes(target)) throw Error('TARGET must be 10 or 20');
if (!['home', 'listing', 'mixed'].includes(workload)) throw Error('Invalid workload');
export const options = {
  scenarios: { website: { executor: 'ramping-vus', stages: [
    { duration: '10s', target }, { duration: '40s', target }, { duration: '10s', target: 0 },
  ], gracefulRampDown: '10s' } },
  thresholds: { http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '20s' }], checks: ['rate>0.99'] },
};
export default function () {
  const listing = workload === 'listing' || workload === 'mixed' && __VU % 2 === 0;
  const route = listing ? '/san-pham' : '/';
  const response = http.get(base + route, { tags: { page: listing ? 'listing' : 'home' }, timeout: '10s' });
  check(response, { 'HTTP 200': r => r.status === 200, 'real SSR inventory': r => r.body.includes('Toyota') && !/Application error|Tạm thời chưa tải được dữ liệu/.test(r.body) });
  // Deterministic think time, identical between baseline and composition.
  sleep(2 + ((__VU * 7 + __ITER * 13) % 30) / 10);
}
