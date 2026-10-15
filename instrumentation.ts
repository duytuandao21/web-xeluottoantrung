export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.PERF_DIAGNOSTICS === 'true') {
    const { registerPerfDiagnostics } = await import('./lib/perf-node');
    registerPerfDiagnostics();
  }
}
