/**
 * Worker entry point for CPU-heavy trace document operations.
 *
 * @author Quasar
 */
import {
  createTraceDocumentArtifact,
  normalizeTraceDocument,
} from '../utils/traceDocument.js';
import {
  buildVisualSegmentIndex,
  findTextMatches,
} from '../utils/jsonDocumentSegments.js';
import { buildTraceComparison } from '../utils/traceCompare.js';

const operations = {
  canonicalize: normalizeTraceDocument,
  createDocument: createTraceDocumentArtifact,
  segmentJson: ({ text, options }) => buildVisualSegmentIndex(text, options),
  searchJson: ({ text, query, maxMatches }) => findTextMatches(text, query, maxMatches),
  compare: ({ baseline, candidate }) => buildTraceComparison(baseline, candidate),
};

self.addEventListener('message', ({ data }) => {
  const id = data?.id;
  try {
    const operation = operations[data?.operation];
    if (!operation) throw Object.assign(new Error('UNSUPPORTED_TRACE_WORKER_OPERATION'), {
      code: 'UNSUPPORTED_TRACE_WORKER_OPERATION',
    });
    self.postMessage({ id, ok: true, result: operation(data.payload) });
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'TRACE_WORKER_ERROR';
    const message = typeof error?.message === 'string' && error.message === code
      ? error.message : code;
    self.postMessage({ id, ok: false, error: { code, message } });
  }
});
