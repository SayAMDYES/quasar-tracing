package org.quasar.tracing.common.json;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.util.DefaultIndenter;
import com.fasterxml.jackson.core.util.DefaultPrettyPrinter;
import java.io.IOException;

/**
 * Pretty printer matching {@code JSON.stringify(value, null, 2)} with LF line endings.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/19
 */
public final class TraceDocumentPrettyPrinter extends DefaultPrettyPrinter {

    public TraceDocumentPrettyPrinter() {
        DefaultIndenter indenter = new DefaultIndenter("  ", "\n");
        indentArraysWith(indenter);
        indentObjectsWith(indenter);
        _arrayEmptySeparator = "";
        _objectEmptySeparator = "";
    }

    private TraceDocumentPrettyPrinter(TraceDocumentPrettyPrinter base) {
        super(base);
    }

    @Override
    public DefaultPrettyPrinter createInstance() {
        return new TraceDocumentPrettyPrinter(this);
    }

    @Override
    public void writeObjectFieldValueSeparator(JsonGenerator generator) throws IOException {
        generator.writeRaw(": ");
    }
}
