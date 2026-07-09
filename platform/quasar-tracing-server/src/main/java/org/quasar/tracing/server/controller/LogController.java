package org.quasar.tracing.server.controller;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import org.quasar.tracing.common.api.QTResponse;
import org.quasar.tracing.common.dto.LogRecordDTO;
import org.quasar.tracing.common.dto.LogSearchResultDTO;
import org.quasar.tracing.core.service.LogService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Log search: {@code GET /api/logs}. Parses the optional filters (severities as a CSV) and
 * delegates to {@link LogService}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class LogController {

    private static final long STREAM_POLL_INTERVAL_MS = 1000L;
    private static final int MAX_STREAM_CONNECTIONS = 8;

    private final ExecutorService logStreamExecutor = newLogStreamExecutor();
    private final LogService logService;

    @GetMapping("/logs")
    public QTResponse<LogSearchResultDTO> search(
            @RequestParam(required = false) String service,
            @RequestParam(required = false) String traceId,
            @RequestParam(required = false) String spanId,
            @RequestParam(required = false) String environment,
            @RequestParam(required = false) String namespace,
            @RequestParam(required = false) String k8sNamespace,
            @RequestParam(required = false) String k8sPodName,
            @RequestParam(required = false) String k8sNodeName,
            @RequestParam(required = false) String serviceInstanceId,
            @RequestParam(required = false) String severities,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long from,
            @RequestParam(required = false) Long to,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) Integer offset) {
        return QTResponse.ok(
            logService.search(service, traceId, spanId, environment, namespace, k8sNamespace, k8sPodName, k8sNodeName,
                serviceInstanceId, parseCsv(severities), q, from, to, limit, offset));
    }

    private static List<String> parseCsv(String csv) {
        if (csv == null || csv.isBlank()) {
            return List.of();
        }
        return Arrays.stream(csv.split(","))
            .map(String::trim)
            .filter(value -> !value.isEmpty())
            .toList();
    }

    @GetMapping(path = "/logs/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(
            @RequestParam(required = false) String service,
            @RequestParam(required = false) String traceId,
            @RequestParam(required = false) String spanId,
            @RequestParam(required = false) String environment,
            @RequestParam(required = false) String namespace,
            @RequestParam(required = false) String k8sNamespace,
            @RequestParam(required = false) String k8sPodName,
            @RequestParam(required = false) String k8sNodeName,
            @RequestParam(required = false) String serviceInstanceId,
            @RequestParam(required = false) String severities,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long cursor,
            @RequestParam(required = false) Integer limit) {
        SseEmitter emitter = new SseEmitter(0L);
        AtomicBoolean active = new AtomicBoolean(true);
        Runnable cleanup = () -> {
            active.set(false);
        };
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(error -> cleanup.run());

        try {
            logStreamExecutor.execute(() -> streamLogs(emitter, active, service, traceId, spanId, environment, namespace,
                k8sNamespace, k8sPodName, k8sNodeName, serviceInstanceId, parseCsv(severities), q, cursor, limit));
        } catch (RejectedExecutionException ex) {
            active.set(false);
            emitter.completeWithError(ex);
        }
        return emitter;
    }

    @PreDestroy
    void shutdownLogStreamExecutor() {
        logStreamExecutor.shutdownNow();
    }

    private static ExecutorService newLogStreamExecutor() {
        AtomicInteger sequence = new AtomicInteger();
        return new ThreadPoolExecutor(0, MAX_STREAM_CONNECTIONS, 60L, TimeUnit.SECONDS, new SynchronousQueue<>(), runnable -> {
            Thread thread = new Thread(runnable, "log-stream-" + sequence.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        }, new ThreadPoolExecutor.AbortPolicy());
    }

    private void streamLogs(SseEmitter emitter, AtomicBoolean active, String service, String traceId, String spanId,
            String environment, String namespace, String k8sNamespace, String k8sPodName, String k8sNodeName,
            String serviceInstanceId, List<String> severities, String q, Long cursor, Integer limit) {
        Long currentCursor = cursor == null ? System.currentTimeMillis() : cursor;
        try {
            while (active.get()) {
                List<LogRecordDTO> records = logService.stream(service, traceId, spanId, environment, namespace,
                    k8sNamespace, k8sPodName, k8sNodeName, serviceInstanceId, severities, q, currentCursor, limit);
                for (LogRecordDTO record : records) {
                    emitter.send(SseEmitter.event().name("log").data(record));
                    Long timestamp = record.getTimestamp();
                    if (timestamp != null && (currentCursor == null || timestamp > currentCursor)) {
                        currentCursor = timestamp;
                    }
                }
                emitter.send(SseEmitter.event().name("heartbeat").data(currentCursor));
                Thread.sleep(STREAM_POLL_INTERVAL_MS);
            }
        } catch (IOException ignored) {
            emitter.complete();
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException ex) {
            emitter.completeWithError(ex);
        }
    }
}
