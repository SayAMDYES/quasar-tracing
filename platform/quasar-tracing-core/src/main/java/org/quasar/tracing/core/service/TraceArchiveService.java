package org.quasar.tracing.core.service;

import java.math.BigInteger;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.quasar.tracing.clickhouse.entity.SpanEntity;
import org.quasar.tracing.clickhouse.entity.TraceArchiveManifestEntity;
import org.quasar.tracing.clickhouse.mapper.TraceArchiveManifestWrite;
import org.quasar.tracing.clickhouse.mapper.TraceArchiveMapper;
import org.quasar.tracing.common.dto.ArchiveCapabilitiesDTO;
import org.quasar.tracing.common.dto.TraceArchiveResultDTO;
import org.quasar.tracing.common.dto.TraceArchiveStatusDTO;
import org.quasar.tracing.common.dto.TraceDocumentDTO;
import org.quasar.tracing.common.dto.TraceDocumentSpanDTO;
import org.quasar.tracing.common.dto.TraceSource;
import org.quasar.tracing.core.config.ArchiveProperties;
import org.quasar.tracing.core.exception.ArchiveConflictException;
import org.quasar.tracing.core.exception.InvalidQueryException;
import org.quasar.tracing.core.exception.NotFoundException;
import org.quasar.tracing.core.exception.TraceDocumentTooLargeException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Manifest-controlled state machine for immutable ClickHouse Trace Archive generations.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/22
 */
@Slf4j
@Service
public class TraceArchiveService {

    private static final BigInteger MAX_REVISION = BigInteger.ONE.shiftLeft(64).subtract(BigInteger.ONE);

    private final TraceArchiveMapper mapper;
    private final TraceDocumentService documentService;
    private final ArchiveProperties properties;
    private final Clock clock;

    @Autowired
    public TraceArchiveService(TraceArchiveMapper mapper, TraceDocumentService documentService,
            ArchiveProperties properties) {
        this(mapper, documentService, properties, Clock.systemUTC());
    }

    TraceArchiveService(TraceArchiveMapper mapper, TraceDocumentService documentService,
            ArchiveProperties properties, Clock clock) {
        this.mapper = mapper;
        this.documentService = documentService;
        this.properties = properties;
        this.clock = clock;
    }

    public ArchiveCapabilitiesDTO capabilities() {
        return new ArchiveCapabilitiesDTO(properties.isEnabled(), properties.retentionDays(),
                properties.maxSpansPerTrace());
    }

    public TraceArchiveStatusDTO status(String traceId) {
        requireEnabled();
        String normalizedTraceId = normalizeTraceId(traceId);
        TraceArchiveManifestEntity latest = visibleLatest(normalizedTraceId);
        return isActive(latest) ? activeStatus(latest) : absentStatus(normalizedTraceId);
    }

    public TraceArchiveResultDTO archive(String traceId) {
        requireEnabled();
        String normalizedTraceId = normalizeTraceId(traceId);
        TraceArchiveManifestEntity existing = visibleLatest(normalizedTraceId);
        if (isActive(existing)) {
            return new TraceArchiveResultDTO(false, activeStatus(existing));
        }

        TraceDocumentDTO source = documentService.get(normalizedTraceId, TraceSource.LIVE);
        if (source.getSpans().size() > properties.maxSpansPerTrace()) {
            throw new TraceDocumentTooLargeException();
        }
        byte[] sourceBytes = documentService.canonicalBytes(source);
        String sourceChecksum = sha256(sourceBytes);
        long archivedAt = clock.millis();
        long expiresAt = Math.addExact(archivedAt,
                Duration.ofDays(properties.retentionDays()).toMillis());
        String generation = UUID.randomUUID().toString();
        boolean manifestInserted = false;

        try {
            mapper.insertGeneration(normalizedTraceId, generation, archivedAt, expiresAt);
            List<SpanEntity> archivedRows = mapper.selectGeneration(normalizedTraceId, generation);
            if (archivedRows == null || archivedRows.size() != source.getSpans().size()) {
                throw verificationFailure();
            }
            TraceDocumentDTO archived = documentService.toDocument(normalizedTraceId, archivedRows);
            String archiveChecksum = sha256(documentService.canonicalBytes(archived));
            if (!sourceChecksum.equals(archiveChecksum)) {
                throw verificationFailure();
            }

            String revision = nextRevision(normalizedTraceId);
            TraceArchiveManifestWrite manifest = activeManifest(source, generation, revision,
                    archivedAt, expiresAt, archiveChecksum);
            mapper.insertManifest(manifest);
            manifestInserted = true;

            TraceArchiveManifestEntity winner = visibleLatest(normalizedTraceId);
            if (isActive(winner) && generation.equals(winner.getGeneration())) {
                return new TraceArchiveResultDTO(true, activeStatus(winner));
            }
            cleanup(normalizedTraceId, generation);
            if (isActive(winner)) {
                return new TraceArchiveResultDTO(false, activeStatus(winner));
            }
            throw new ArchiveConflictException("ARCHIVE_ACTIVATION_CONFLICT");
        } catch (RuntimeException exception) {
            if (!manifestInserted) {
                cleanup(normalizedTraceId, generation);
            }
            throw exception;
        }
    }

    public void delete(String traceId) {
        requireEnabled();
        String normalizedTraceId = normalizeTraceId(traceId);
        TraceArchiveManifestEntity current = visibleLatest(normalizedTraceId);
        if (!isActive(current)) {
            return;
        }

        TraceArchiveManifestWrite tombstone = new TraceArchiveManifestWrite(
                current.getTraceId(), current.getGeneration(), nextRevision(normalizedTraceId),
                UUID.randomUUID().toString(), "DELETED", clock.millis(), current.getExpiresAt(),
                current.getSourceStartTimeUnixNano(), current.getSourceEndTimeUnixNano(),
                current.getRootServiceName(), current.getRootSpanName(), current.getDurationNano(),
                current.getSpanCount(), current.getErrorCount(), current.getStatus(),
                current.getServices(), current.getChecksumSha256());
        mapper.insertManifest(tombstone);

        TraceArchiveManifestEntity latest = visibleLatest(normalizedTraceId);
        if (latest != null && "DELETED".equals(latest.getState())) {
            cleanup(normalizedTraceId, current.getGeneration());
            return;
        }
        throw new ArchiveConflictException("ARCHIVE_DELETE_CONFLICT");
    }

    private TraceArchiveManifestWrite activeManifest(TraceDocumentDTO source, String generation,
            String revision, long archivedAt, long expiresAt, String checksum) {
        int errorCount = (int) source.getSpans().stream()
                .map(TraceDocumentSpanDTO::getStatus)
                .filter(status -> "Error".equalsIgnoreCase(status.getCode()))
                .count();
        BigInteger start = new BigInteger(source.getStartTimeUnixNano());
        BigInteger duration = new BigInteger(source.getDurationNano());
        return new TraceArchiveManifestWrite(
                source.getTraceId(), generation, revision, UUID.randomUUID().toString(), "ACTIVE",
                archivedAt, expiresAt, start.toString(), start.add(duration).toString(),
                source.getRoot().getServiceName(), source.getRoot().getName(),
                source.getDurationNano(), source.getSpans().size(), errorCount,
                errorCount > 0 ? "Error" : "Ok", source.getServices(), checksum);
    }

    private String nextRevision(String traceId) {
        String current = mapper.maxRevision(traceId);
        BigInteger revision;
        try {
            revision = new BigInteger(current == null || current.isBlank() ? "0" : current);
        } catch (NumberFormatException exception) {
            throw new IllegalStateException("INVALID_ARCHIVE_REVISION", exception);
        }
        if (revision.signum() < 0 || revision.compareTo(MAX_REVISION) >= 0) {
            throw new ArchiveConflictException("ARCHIVE_REVISION_EXHAUSTED");
        }
        return revision.add(BigInteger.ONE).toString();
    }

    private TraceArchiveManifestEntity visibleLatest(String traceId) {
        TraceArchiveManifestEntity latest = mapper.selectLatest(traceId);
        if (latest == null || latest.getExpiresAt() == null || latest.getExpiresAt() <= clock.millis()) {
            return null;
        }
        return latest;
    }

    private void cleanup(String traceId, String generation) {
        try {
            mapper.cleanupGeneration(traceId, generation);
        } catch (RuntimeException exception) {
            log.warn("Archive generation cleanup failed for traceId={} generation={}",
                    traceId, generation, exception);
        }
    }

    private void requireEnabled() {
        if (!properties.isEnabled()) {
            throw new NotFoundException("TRACE_ARCHIVE_FEATURE_DISABLED");
        }
    }

    private static String normalizeTraceId(String traceId) {
        try {
            return TraceDocumentDTO.normalizeTraceId(traceId);
        } catch (IllegalArgumentException exception) {
            throw new InvalidQueryException("INVALID_TRACE_ID");
        }
    }

    private static boolean isActive(TraceArchiveManifestEntity manifest) {
        return manifest != null && "ACTIVE".equals(manifest.getState());
    }

    private static TraceArchiveStatusDTO activeStatus(TraceArchiveManifestEntity manifest) {
        return new TraceArchiveStatusDTO(true, "ACTIVE", manifest.getTraceId(),
                manifest.getGeneration(), manifest.getRevision(), manifest.getArchivedAt(),
                manifest.getExpiresAt(), manifest.getSpanCount(), manifest.getChecksumSha256());
    }

    private static TraceArchiveStatusDTO absentStatus(String traceId) {
        return new TraceArchiveStatusDTO(false, "ABSENT", traceId, null, null,
                null, null, null, null);
    }

    private static ArchiveConflictException verificationFailure() {
        return new ArchiveConflictException("ARCHIVE_VERIFICATION_FAILED");
    }

    private static String sha256(byte[] value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA_256_UNAVAILABLE", exception);
        }
    }
}
