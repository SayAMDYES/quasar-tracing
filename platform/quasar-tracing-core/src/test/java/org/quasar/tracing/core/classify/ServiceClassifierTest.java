package org.quasar.tracing.core.classify;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.quasar.tracing.core.config.ServiceTypeProperties;

/**
 * Unit tests for {@link ServiceClassifier}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
class ServiceClassifierTest {

    private final ServiceClassifier classifier =
        new ServiceClassifier(new ServiceTypeProperties(Map.of("mysql", "datastore", "kafka", "mq")));

    @Test
    void mapsKnownTypesAndDefaultsToApp() {
        assertThat(classifier.typeOf("mysql")).isEqualTo("datastore");
        assertThat(classifier.typeOf("kafka")).isEqualTo("mq");
        assertThat(classifier.typeOf("order-service")).isEqualTo("app");
    }

    @Test
    void isAppOnlyForUnmappedServices() {
        assertThat(classifier.isApp("order-service")).isTrue();
        assertThat(classifier.isApp("mysql")).isFalse();
    }
}
