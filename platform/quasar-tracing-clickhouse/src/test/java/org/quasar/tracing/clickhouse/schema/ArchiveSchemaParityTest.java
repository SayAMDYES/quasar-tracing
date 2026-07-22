package org.quasar.tracing.clickhouse.schema;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import org.junit.jupiter.api.Test;

/**
 * Contract tests for the Archive DDL installed by simple and Helm deployments.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/22
 */
class ArchiveSchemaParityTest {

    @Test
    void keepsSimpleAndHelmArchiveSchemasIdenticalAndAppendOnly() throws IOException {
        Path repository = repositoryRoot();
        String simple = Files.readString(repository.resolve("deploy/simple/sql/10_trace_archive.sql"));
        String helm = Files.readString(
                repository.resolve("deploy/helm/quasar-tracing/files/sql/10_trace_archive.sql"));

        assertThat(normalize(simple)).isEqualTo(normalize(helm));
        assertThat(simple).doesNotContainIgnoringCase("ReplacingMergeTree");
        assertThat(count(simple.toLowerCase(Locale.ROOT), "engine = mergetree")).isEqualTo(2);
        assertThat(simple).contains("trace_archive_manifest", "trace_archive_spans");
    }

    private static Path repositoryRoot() {
        Path current = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (current != null && !Files.isDirectory(current.resolve("deploy/simple/sql"))) {
            current = current.getParent();
        }
        if (current == null) {
            throw new IllegalStateException("REPOSITORY_ROOT_NOT_FOUND");
        }
        return current;
    }

    private static String normalize(String sql) {
        return sql.replaceAll("(?m)--.*$", "")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private static int count(String value, String needle) {
        int matches = 0;
        int offset = 0;
        while ((offset = value.indexOf(needle, offset)) >= 0) {
            matches++;
            offset += needle.length();
        }
        return matches;
    }
}
