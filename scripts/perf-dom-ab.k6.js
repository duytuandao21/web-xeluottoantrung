// Fixed arrival traffic; same public SSR checks as the closed-loop script.
import http from 'k6/http';
import { check } from 'k6';
const base = __ENV.BASE_URL, workload = __ENV.WORKLOAD;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base || '')) throw Error('Local loopback target required');
if (!['home', 'listing', 'mixed'].includes(workload)) throw Error('Invalid workload');
const scenario = (rate, exec, maxVUs) => ({ executor: 'constant-arrival-rate', rate, timeUnit: '1s', duration: '60s',
  preAllocatedVUs: Math.min(4, maxVUs), maxVUs, exec, gracefulStop: '10s' });
export const options = {
  scenarios: workload === 'mixed' ? { home: scenario(1, 'home', 5), listing: scenario(1, 'listing', 5) }
    : { website: scenario(2, workload, 10) },
  thresholds: { http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '20s' }],
    checks: ['rate>0.99'], dropped_iterations: ['count==0'] },
};
function request(route, page) {
  const response = http.get(base + route, { tags: { page }, timeout: '10s' });
  check(response, { 'HTTP 200': r => r.status === 200,
    'real SSR inventory': r => r.body.includes('Toyota') && !/Application error|Tạm thời chưa tải được dữ liệu/.test(r.body) });
}
export function home() { request('/', 'home'); }
export function listing() { request('/san-pham', 'listing'); }
