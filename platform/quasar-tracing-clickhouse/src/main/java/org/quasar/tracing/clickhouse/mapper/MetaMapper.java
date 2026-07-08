package org.quasar.tracing.clickhouse.mapper;

import java.util.List;

/**
 * Catalog / meta lookups backing the filters endpoint: the distinct service names,
 * server-span operations, and environments seen within the recent retention window.
 *
 * <p>SQL lives in {@code resources/mapper/MetaMapper.xml}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
public interface MetaMapper {

    /** @return distinct service names, ascending. */
    List<String> selectServiceNames();

    /** @return distinct server-span operation names, ascending. */
    List<String> selectOperations();

    /** @return distinct non-empty deployment environments, ascending. */
    List<String> selectEnvironments();

    /** @return distinct non-empty generic namespaces, ascending. */
    List<String> selectNamespaces();

    /** @return distinct non-empty Kubernetes namespaces, ascending. */
    List<String> selectK8sNamespaces();

    /** @return distinct non-empty Kubernetes pod names, ascending. */
    List<String> selectK8sPodNames();

    /** @return distinct non-empty Kubernetes node names, ascending. */
    List<String> selectK8sNodeNames();

    /** @return distinct non-empty OTel service instance ids, ascending. */
    List<String> selectServiceInstances();
}
