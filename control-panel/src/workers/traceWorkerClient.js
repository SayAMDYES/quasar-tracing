/**
 * Request-ID client for trace worker operations.
 *
 * @author Quasar
 */

function workerError(error, fallbackCode = 'TRACE_WORKER_ERROR') {
  const code = typeof error?.code === 'string' ? error.code : fallbackCode;
  return Object.assign(new Error(typeof error?.message === 'string' ? error.message : code), { code });
}

export function createTraceWorkerClient(
  worker = new Worker(new URL('./traceWorker.js', import.meta.url), { type: 'module' }),
) {
  let nextId = 1;
  let terminalError = null;
  const pending = new Map();

  const terminate = (error) => {
    if (terminalError) return;
    terminalError = error;
    worker.removeEventListener('message', onMessage);
    worker.removeEventListener('error', onError);
    worker.terminate();
    pending.forEach(({ reject }) => reject(error));
    pending.clear();
  };

  const onMessage = ({ data }) => {
    const request = pending.get(data?.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.ok === true) request.resolve(data.result);
    else request.reject(workerError(data.error));
  };
  const onError = () => {
    terminate(workerError(null));
  };
  worker.addEventListener('message', onMessage);
  worker.addEventListener('error', onError);

  function request(operation, payload) {
    if (terminalError) throw terminalError;
    const id = nextId;
    nextId += 1;
    const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    try {
      worker.postMessage({ id, operation, payload });
    } catch {
      terminate(workerError(null));
    }
    return result;
  }

  return {
    canonicalize: (document) => request('canonicalize', document),
    createDocument: (document) => request('createDocument', document),
    createBundle: (traces, options) => request('createBundle', { traces, options }),
    segmentJson: (text, options) => request('segmentJson', { text, options }),
    searchJson: (text, query, maxMatches) => request('searchJson', { text, query, maxMatches }),
    importTrace: (text, options) => request('importTrace', { text, options }),
    compare: (baseline, candidate) => request('compare', { baseline, candidate }),
    request,
    dispose() {
      terminate(workerError(null, 'TRACE_WORKER_DISPOSED'));
    },
  };
}
