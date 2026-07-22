/**
 * Fixed-concurrency Trace Document downloader with bounded retry and cancellation.
 *
 * @author Quasar
 */

export const TRACE_DOWNLOAD_CONCURRENCY = 4;
export const TRACE_DOWNLOAD_TIMEOUT_MS = 15_000;
export const TRACE_DOWNLOAD_RETRY_DELAY_MS = 500;

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

function downloadError(code) {
  return Object.assign(new Error(code), { code });
}

function statusOf(error) {
  const status = error?.status ?? error?.response?.status;
  return Number.isInteger(status) ? status : null;
}

function isRetryable(error) {
  if (error?.code === 'DOWNLOAD_TIMEOUT') return true;
  const status = statusOf(error);
  return status == null || RETRYABLE_STATUSES.has(status);
}

function sanitizeFailure(item, error) {
  const status = statusOf(error);
  const code = error?.code === 'DOWNLOAD_TIMEOUT'
    ? 'DOWNLOAD_TIMEOUT'
    : status == null ? 'NETWORK_ERROR' : `HTTP_${status}`;
  const message = typeof error?.message === 'string' && error.message ? error.message : code;
  return { item, code, message };
}

function defaultJitter() {
  return Math.floor(Math.random() * 251);
}

function defaultSleep(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(downloadError('DOWNLOAD_CANCELLED'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(downloadError('DOWNLOAD_CANCELLED'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function requestWithTimeout(item, requester, attempt, options) {
  if (options.signal?.aborted) throw downloadError('DOWNLOAD_CANCELLED');
  const controller = new AbortController();
  let timer;
  let rejectExternal;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = downloadError('DOWNLOAD_TIMEOUT');
      controller.abort(error);
      reject(error);
    }, options.timeoutMs);
  });
  const externalAbort = new Promise((_, reject) => {
    rejectExternal = reject;
  });
  const onAbort = () => {
    const error = downloadError('DOWNLOAD_CANCELLED');
    controller.abort(error);
    rejectExternal(error);
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await Promise.race([
      Promise.resolve().then(() => requester(item, { signal: controller.signal, attempt })),
      timeout,
      externalAbort,
    ]);
  } catch (error) {
    if (options.signal?.aborted) throw downloadError('DOWNLOAD_CANCELLED');
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

async function requestWithRetry(item, requester, options) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestWithTimeout(item, requester, attempt, options);
    } catch (error) {
      if (error?.code === 'DOWNLOAD_CANCELLED') throw error;
      if (attempt === 1 || !isRetryable(error)) throw error;
      await options.sleep(options.retryDelayMs + options.jitter(item, attempt), options.signal);
      if (options.signal?.aborted) throw downloadError('DOWNLOAD_CANCELLED');
    }
  }
  throw downloadError('NETWORK_ERROR');
}

export async function downloadTraceDocuments(items, requester, options = {}) {
  if (!Array.isArray(items)) throw new TypeError('DOWNLOAD_ITEMS_REQUIRED');
  if (typeof requester !== 'function') throw new TypeError('DOWNLOAD_REQUESTER_REQUIRED');
  const settings = {
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? TRACE_DOWNLOAD_TIMEOUT_MS,
    retryDelayMs: options.retryDelayMs ?? TRACE_DOWNLOAD_RETRY_DELAY_MS,
    jitter: options.jitter || defaultJitter,
    sleep: options.sleep || defaultSleep,
    onProgress: options.onProgress || (() => {}),
  };
  const results = new Array(items.length);
  const failures = new Array(items.length);
  let cursor = 0;
  let completed = 0;
  let succeeded = 0;
  let failed = 0;

  const worker = async () => {
    while (cursor < items.length) {
      if (settings.signal?.aborted) throw downloadError('DOWNLOAD_CANCELLED');
      const index = cursor;
      cursor += 1;
      const item = items[index];
      try {
        const value = await requestWithRetry(item, requester, settings);
        results[index] = { item, value };
        succeeded += 1;
      } catch (error) {
        if (error?.code === 'DOWNLOAD_CANCELLED') throw error;
        failures[index] = sanitizeFailure(item, error);
        failed += 1;
      }
      completed += 1;
      settings.onProgress({ completed, total: items.length, succeeded, failed });
    }
  };

  const workers = Array.from(
    { length: Math.min(TRACE_DOWNLOAD_CONCURRENCY, items.length) },
    () => worker(),
  );
  const settled = await Promise.allSettled(workers);
  if (settings.signal?.aborted || settled.some(({ reason }) => reason?.code === 'DOWNLOAD_CANCELLED')) {
    throw downloadError('DOWNLOAD_CANCELLED');
  }
  return {
    results: results.filter(Boolean),
    failures: failures.filter(Boolean),
  };
}
