import { subscribe } from 'node:diagnostics_channel';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PerfMetrics } from './perf-metrics';
import { perfRoute } from './perf-observer';

export function registerPerfDiagnostics() {
  if (process.env.PERF_DIAGNOSTICS !== 'true') return;
  const globals = globalThis as typeof globalThis & { __ttPerfObserver?: PerfMetrics };
  if (globals.__ttPerfObserver) return;
  const recorder = globals.__ttPerfObserver = new PerfMetrics(true, 'web');
  recorder.start();
  const requests = new WeakMap<IncomingMessage, { started: number; label: string }>();
  subscribe('http.server.request.start', message => {
    const { request } = message as { request: IncomingMessage };
    const path = request.url?.split('?')[0] ?? '';
    if (request.method !== 'GET' || path.startsWith('/api/') || path.startsWith('/_next/') || path.includes('.')) return;
    requests.set(request, { started: performance.now(), label: perfRoute(path) });
  });
  subscribe('http.server.response.finish', message => {
    const { request, response } = message as { request: IncomingMessage; response: ServerResponse };
    const span = requests.get(request);
    if (!span) return;
    requests.delete(request);
    try { recorder.record('ssr.http', span.label, performance.now() - span.started, response.statusCode >= 400 ? 'error' : 'ok'); }
    catch { /* A channel subscriber must never throw into the HTTP server. */ }
  });
}
