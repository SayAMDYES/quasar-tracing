package org.quasar.tracing.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.quasar.tracing.clickhouse.entity.SpanEntity;
import org.quasar.tracing.clickhouse.entity.TraceArchiveManifestEntity;
import org.quasar.tracing.clickhouse.mapper.TraceArchiveManifestWrite;
import org.quasar.tracing.clickhouse.mapper.TraceArchiveMapper;
import org.quasar.tracing.common.dto.TraceArchiveResultDTO;
import org.quasar.tracing.common.dto.TraceDocumentDTO;
import org.quasar.tracing.common.dto.TraceDocumentRootDTO;
import org.quasar.tracing.common.dto.TraceDocumentSpanDTO;
import org.quasar.tracing.common.dto.TraceDocumentStatusDTO;
import org.quasar.tracing.common.dto.TraceSource;
import org.quasar.tracing.core.config.ArchiveProperties;
import org.quasar.tracing.core.exception.ArchiveConflictException;
import org.quasar.tracing.core.exception.NotFoundException;

/**
 * State-machine tests for Archive activation, races, verification and tombstones.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/22
 */
class TraceArchiveServiceTest {

    private static final String TRACE_ID = "00000000000000000000000000000001";
    private static final long NOW = Instant.parse("2026-07-22T00:00:00Z").toEpochMilli();

    private final TraceArchiveMapper mapper = Mockito.mock(TraceArchiveMapper.class);
    private final TraceDocumentService documentService = Mockito.mock(TraceDocumentService.class);

    @Test
    void rejectsWritesWhenDisabledAndExposesCapabilitiesWithoutTouchingTables() {
        TraceArchiveService service = service(false, NOW);

        assertThat(service.capabilities())
                .extracting("enabled", "retentionDays", "maxSpansPerTrace")
                .containsExactly(false, 180, 20_000);
        assertThatThrownBy(() -> service.archive(TRACE_ID))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("TRACE_ARCHIVE_FEATURE_DISABLED");
        assertThatThrownBy(() -> service.delete(TRACE_ID))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("TRACE_ARCHIVE_FEATURE_DISABLED");
        verifyNoInteractions(mapper, documentService);
    }

    @Test
    void activatesOnlyAfterGenerationCountAndCanonicalChecksumMatch() {
        TraceDocumentDTO source = document();
        List<SpanEntity> archivedRows = List.of(new SpanEntity());
        AtomicReference<String> generation = new AtomicReference<>();
        when(mapper.selectLatest(TRACE_ID))
                .thenReturn(null)
                .thenAnswer(invocation -> active(generation.get(), "1", NOW));
        doAnswer(invocation -> {
            generation.set(invocation.getArgument(1));
            return 1;
        }).when(mapper).insertGeneration(anyString(), anyString(), anyLong(), anyLong());
        when(mapper.selectGeneration(eqTrace(), anyString())).thenReturn(archivedRows);
        when(mapper.maxRevision(TRACE_ID)).thenReturn("0");
        when(documentService.get(TRACE_ID, TraceSource.LIVE)).thenReturn(source);
        when(documentService.toDocument(TRACE_ID, archivedRows)).thenReturn(source);
        when(documentService.canonicalBytes(source)).thenReturn("canonical\n".getBytes(StandardCharsets.UTF_8));

        TraceArchiveResultDTO result = service(true, NOW).archive(TRACE_ID);

        assertThat(result.getCreated()).isTrue();
        assertThat(result.getArchive().getGeneration()).isEqualTo(generation.get());
        ArgumentCaptor<TraceArchiveManifestWrite> manifest =
                ArgumentCaptor.forClass(TraceArchiveManifestWrite.class);
        verify(mapper).insertManifest(manifest.capture());
        assertThat(manifest.getValue().getState()).isEqualTo("ACTIVE");
        assertThat(manifest.getValue().getRevision()).isEqualTo("1");
        assertThat(manifest.getValue().getSpanCount()).isOne();
        assertThat(manifest.getValue().getChecksumSha256()).hasSize(64);
        verify(mapper, never()).cleanupGeneration(anyString(), anyString());
    }

    @Test
    void returnsExistingActiveSnapshotWithoutReadingLiveSpans() {
        TraceArchiveManifestEntity existing = active("generation-existing", "7", NOW);
        when(mapper.selectLatest(TRACE_ID)).thenReturn(existing);

        TraceArchiveResultDTO result = service(true, NOW).archive(TRACE_ID);

        assertThat(result.getCreated()).isFalse();
        assertThat(result.getArchive().getGeneration()).isEqualTo("generation-existing");
        verifyNoInteractions(documentService);
        verify(mapper, never()).insertGeneration(anyString(), anyString(), anyLong(), anyLong());
    }

    @Test
    void rejectsCountOrChecksumMismatchAndCleansOnlyTheIncompleteGeneration() {
        TraceDocumentDTO source = document();
        when(mapper.selectLatest(TRACE_ID)).thenReturn(null);
        when(documentService.get(TRACE_ID, TraceSource.LIVE)).thenReturn(source);
        when(documentService.canonicalBytes(source))
                .thenReturn("source\n".getBytes(StandardCharsets.UTF_8));
        when(mapper.selectGeneration(eqTrace(), anyString())).thenReturn(List.of());

        assertThatThrownBy(() -> service(true, NOW).archive(TRACE_ID))
                .isInstanceOf(ArchiveConflictException.class)
                .hasMessage("ARCHIVE_VERIFICATION_FAILED");
        verify(mapper).cleanupGeneration(eqTrace(), anyString());
        verify(mapper, never()).insertManifest(any());

        Mockito.reset(mapper, documentService);
        List<SpanEntity> archivedRows = List.of(new SpanEntity());
        when(mapper.selectLatest(TRACE_ID)).thenReturn(null);
        when(documentService.get(TRACE_ID, TraceSource.LIVE)).thenReturn(source);
        when(mapper.selectGeneration(eqTrace(), anyString())).thenReturn(archivedRows);
        when(documentService.toDocument(TRACE_ID, archivedRows)).thenReturn(document());
        when(documentService.canonicalBytes(any()))
                .thenReturn("source\n".getBytes(StandardCharsets.UTF_8))
                .thenReturn("corrupt\n".getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> service(true, NOW).archive(TRACE_ID))
                .isInstanceOf(ArchiveConflictException.class)
                .hasMessage("ARCHIVE_VERIFICATION_FAILED");
        verify(mapper).cleanupGeneration(eqTrace(), anyString());
        verify(mapper, never()).insertManifest(any());
    }

    @Test
    void cleansAWriteFailureButDoesNotDeleteAfterManifestWasInserted() {
        TraceDocumentDTO source = document();
        List<SpanEntity> archivedRows = List.of(new SpanEntity());
        when(mapper.selectLatest(TRACE_ID)).thenReturn(null);
        when(documentService.get(TRACE_ID, TraceSource.LIVE)).thenReturn(source);
        when(mapper.selectGeneration(eqTrace(), anyString())).thenReturn(archivedRows);
        when(documentService.toDocument(TRACE_ID, archivedRows)).thenReturn(source);
        when(documentService.canonicalBytes(source)).thenReturn(new byte[] {1});
        when(mapper.maxRevision(TRACE_ID)).thenReturn("0");
        doThrow(new IllegalStateException("manifest write failed"))
                .when(mapper).insertManifest(any());

        assertThatThrownBy(() -> service(true, NOW).archive(TRACE_ID))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("manifest write failed");
        verify(mapper).cleanupGeneration(eqTrace(), anyString());
    }

    @Test
    void concurrentWinningManifestIsReturnedAndLosingGenerationIsCleaned() {
        TraceDocumentDTO source = document();
        List<SpanEntity> rows = List.of(new SpanEntity());
        TraceArchiveManifestEntity winner = active("winner-generation", "1", NOW);
        when(mapper.selectLatest(TRACE_ID)).thenReturn(null, winner);
        when(documentService.get(TRACE_ID, TraceSource.LIVE)).thenReturn(source);
        when(mapper.selectGeneration(eqTrace(), anyString())).thenReturn(rows);
        when(documentService.toDocument(TRACE_ID, rows)).thenReturn(source);
        when(documentService.canonicalBytes(source)).thenReturn(new byte[] {1});
        when(mapper.maxRevision(TRACE_ID)).thenReturn("0");

        TraceArchiveResultDTO result = service(true, NOW).archive(TRACE_ID);

        assertThat(result.getCreated()).isFalse();
        assertThat(result.getArchive().getGeneration()).isEqualTo("winner-generation");
        verify(mapper).cleanupGeneration(eqTrace(), anyString());
    }

    @Test
    void tombstoneIsImmediatelyAbsentAndCrossMonthRearchiveUsesAHigherRevision() {
        long july = Instant.parse("2026-07-31T23:59:00Z").toEpochMilli();
        long august = Instant.parse("2026-08-01T00:01:00Z").toEpochMilli();
        TraceArchiveManifestEntity active = active("old-generation", "1", july);
        TraceArchiveManifestEntity deleted = active("old-generation", "2", july);
        deleted.setState("DELETED");
        when(mapper.selectLatest(TRACE_ID)).thenReturn(active, deleted, deleted, deleted)
                .thenAnswer(invocation -> active("new-generation", "3", august));
        when(mapper.maxRevision(TRACE_ID)).thenReturn("1", "2");

        service(true, july).delete(TRACE_ID);
        assertThat(service(true, august).status(TRACE_ID).getState()).isEqualTo("ABSENT");

        TraceDocumentDTO source = document();
        List<SpanEntity> rows = List.of(new SpanEntity());
        when(documentService.get(TRACE_ID, TraceSource.LIVE)).thenReturn(source);
        when(mapper.selectGeneration(eqTrace(), anyString())).thenReturn(rows);
        when(documentService.toDocument(TRACE_ID, rows)).thenReturn(source);
        when(documentService.canonicalBytes(source)).thenReturn(new byte[] {1});
        TraceArchiveResultDTO result = service(true, august).archive(TRACE_ID);

        assertThat(result.getArchive().getRevision()).isEqualTo("3");
        ArgumentCaptor<TraceArchiveManifestWrite> writes =
                ArgumentCaptor.forClass(TraceArchiveManifestWrite.class);
        verify(mapper, Mockito.times(2)).insertManifest(writes.capture());
        assertThat(writes.getAllValues()).extracting(TraceArchiveManifestWrite::getState)
                .containsExactly("DELETED", "ACTIVE");
        assertThat(writes.getAllValues().get(0).getArchivedAt()).isEqualTo(july);
        assertThat(writes.getAllValues().get(1).getArchivedAt()).isEqualTo(august);
    }

    @Test
    void treatsExpiredActiveAsAbsentAndRejectsUInt64RevisionExhaustion() {
        TraceArchiveManifestEntity expired = active("generation", "1", NOW);
        expired.setExpiresAt(NOW - 1);
        when(mapper.selectLatest(TRACE_ID)).thenReturn(expired);

        assertThat(service(true, NOW).status(TRACE_ID).getState()).isEqualTo("ABSENT");

        Mockito.reset(mapper, documentService);
        TraceDocumentDTO source = document();
        List<SpanEntity> rows = List.of(new SpanEntity());
        when(mapper.selectLatest(TRACE_ID)).thenReturn(null);
        when(documentService.get(TRACE_ID, TraceSource.LIVE)).thenReturn(source);
        when(mapper.selectGeneration(eqTrace(), anyString())).thenReturn(rows);
        when(documentService.toDocument(TRACE_ID, rows)).thenReturn(source);
        when(documentService.canonicalBytes(source)).thenReturn(new byte[] {1});
        when(mapper.maxRevision(TRACE_ID)).thenReturn("18446744073709551615");

        assertThatThrownBy(() -> service(true, NOW).archive(TRACE_ID))
                .isInstanceOf(ArchiveConflictException.class)
                .hasMessage("ARCHIVE_REVISION_EXHAUSTED");
        verify(mapper).cleanupGeneration(eqTrace(), anyString());
    }

    private TraceArchiveService service(boolean enabled, long now) {
        return new TraceArchiveService(mapper, documentService,
                new ArchiveProperties(enabled, 180, 20_000),
                Clock.fixed(Instant.ofEpochMilli(now), ZoneOffset.UTC));
    }

    private static TraceDocumentDTO document() {
        TraceDocumentDTO document = new TraceDocumentDTO();
        document.setTraceId(TRACE_ID);
        document.setStartTimeUnixNano("1000000000");
        document.setDurationNano("100");
        TraceDocumentRootDTO root = new TraceDocumentRootDTO();
        root.setSpanId("0000000000000001");
        root.setServiceName("checkout");
        root.setName("POST /orders");
        root.setSelection("natural");
        document.setRoot(root);
        document.setServices(List.of("checkout"));
        TraceDocumentSpanDTO span = new TraceDocumentSpanDTO();
        span.setTraceId(TRACE_ID);
        span.setSpanId("0000000000000001");
        span.setParentSpanId("");
        span.setStartTimeUnixNano("1000000000");
        span.setDurationNano("100");
        TraceDocumentStatusDTO status = new TraceDocumentStatusDTO();
        status.setCode("OK");
        span.setStatus(status);
        document.setSpans(List.of(span));
        return document;
    }

    private static TraceArchiveManifestEntity active(String generation, String revision, long archivedAt) {
        TraceArchiveManifestEntity entity = new TraceArchiveManifestEntity();
        entity.setTraceId(TRACE_ID);
        entity.setGeneration(generation);
        entity.setRevision(revision);
        entity.setRevisionId("00000000-0000-0000-0000-000000000001");
        entity.setState("ACTIVE");
        entity.setArchivedAt(archivedAt);
        entity.setExpiresAt(archivedAt + 365L * 24 * 60 * 60 * 1000);
        entity.setSourceStartTimeUnixNano("1000000000");
        entity.setSourceEndTimeUnixNano("1000000100");
        entity.setRootServiceName("checkout");
        entity.setRootSpanName("POST /orders");
        entity.setDurationNano("100");
        entity.setSpanCount(1);
        entity.setErrorCount(0);
        entity.setStatus("Ok");
        entity.setServices(List.of("checkout"));
        entity.setChecksumSha256("0".repeat(64));
        return entity;
    }

    private static String eqTrace() {
        return Mockito.eq(TRACE_ID);
    }

}
