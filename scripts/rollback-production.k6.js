import http from 'k6/http';
import { check, sleep } from 'k6';
const base = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const target = Number(__ENV.TARGET || 5);
if (![5, 10, 20].includes(target)) throw Error('TARGET must be 5, 10 or 20');
export const options = {
  scenarios: { website: { executor: 'ramping-vus', stages: [
    { duration: '30s', target }, { duration: '60s', target }, { duration: '30s', target: 0 },
  ], gracefulRampDown: '10s' } },
  thresholds: { http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' }],
    http_req_duration: ['p(95)<2000'], checks: ['rate>0.99'] },
};
export default function () {
  const response = http.get(base + '/', { tags: { page: 'homepage' }, timeout: '10s' });
  check(response, { 'HTTP 200': r => r.status === 200,
    'HTML returned': r => (r.headers['Content-Type'] || '').includes('text/html'),
    'SSR content available': r => !/Application error|Tạm thời chưa tải được dữ liệu/.test(r.body) && r.body.includes('Toyota') });
  sleep(Math.random() * 3 + 2);
}
