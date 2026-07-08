package org.quasar.tracing.clickhouse.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

/**
 * Registers the MyBatis mapper interfaces under {@code org.quasar.tracing.clickhouse.mapper}.
 *
 * <p>The application entry point lives in {@code org.quasar.tracing.server}, so the
 * starter's default same-package mapper scan would miss this module; this explicit
 * scan wires the mappers regardless of where the app class sits.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Configuration
@MapperScan("org.quasar.tracing.clickhouse.mapper")
public class MyBatisConfig {
}
