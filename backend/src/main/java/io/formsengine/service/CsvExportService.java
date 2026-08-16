package io.formsengine.service;

import io.formsengine.definition.Definition;
import io.formsengine.definition.Question;
import io.formsengine.definition.Step;
import io.formsengine.definition.Tab;
import io.formsengine.domain.ResponseDocument;
import io.formsengine.validation.AddressTypeValidator;
import io.formsengine.validation.QuestionTypeRegistry;
import io.formsengine.validation.QuestionTypeValidator;
import org.springframework.stereotype.Service;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

/**
 * CSV response export (Phase 4 FR4-15/16/17, P4-D4/D5): RFC 4180 quoting,
 * UTF-8 with a byte-order mark for Excel, streamed row by row. Columns are
 * derived from one version's definition in reading order — meta columns first,
 * then one column per question code, with the FR4-16 per-type flattening
 * rules; DISPLAY_BLOCK contributes no column.
 *
 * <p>FR4-17 formula-injection guard (mandatory): every string-derived cell
 * beginning with {@code =}, {@code +}, {@code -} or {@code @} is prefixed with
 * a single quote — including joined cells and address sub-fields. Cells
 * rendered from JSON numbers and booleans (NUMBER, TOGGLE) are emitted bare: a
 * JSON number cannot carry a formula, and quoting {@code -5} would corrupt
 * numeric columns.
 */
@Service
public class CsvExportService {

    /**
     * FR4-16: server-generated meta columns, always first. {@code externalRef}
     * sits between responseId and status (Phase 5 FR5-3) — the downstream
     * join key.
     */
    private static final List<String> META_COLUMNS =
            List.of("responseId", "externalRef", "status", "versionNumber", "createdAt", "completedAt");

    /** One answer-derived column: an ADDRESS sub-column carries its subField. */
    private record AnswerColumn(String header, String code, String type, String subField) {
    }

    private final QuestionTypeRegistry typeRegistry;

    public CsvExportService(QuestionTypeRegistry typeRegistry) {
        this.typeRegistry = typeRegistry;
    }

    /**
     * Writes the full CSV — BOM, header row, then one row per response — to
     * {@code out}. Rows are consumed lazily from the stream (the caller owns
     * closing it) and written as they arrive.
     */
    public void write(Definition definition, Stream<ResponseDocument> rows, OutputStream out) throws IOException {
        Writer writer = new BufferedWriter(new OutputStreamWriter(out, StandardCharsets.UTF_8));
        // FR4-15: UTF-8 BOM (EF BB BF) as the very first bytes, for Excel.
        writer.write('\uFEFF');

        List<AnswerColumn> columns = answerColumns(definition);
        List<String> header = new ArrayList<>(META_COLUMNS);
        for (AnswerColumn column : columns) {
            header.add(column.header());
        }
        writeRow(writer, header);
        try {
            rows.forEachOrdered(r -> {
                try {
                    writeRow(writer, renderRow(r, columns));
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            });
        } catch (UncheckedIOException e) {
            throw e.getCause();
        }
        writer.flush();
    }

    /**
     * FR4-15/16: answer columns in reading order — steps (tabs before direct
     * questions) → top-level tabs → top-level questions; whichever collections
     * are non-empty. ADDRESS expands to {@code code.subField} columns for the
     * enabled sub-fields only; DISPLAY_BLOCK (non-answerable) is skipped.
     */
    private List<AnswerColumn> answerColumns(Definition definition) {
        List<Question> ordered = new ArrayList<>();
        for (Step step : definition.getSteps()) {
            for (Tab tab : step.getTabs()) {
                ordered.addAll(tab.getQuestions());
            }
            ordered.addAll(step.getQuestions());
        }
        for (Tab tab : definition.getTabs()) {
            ordered.addAll(tab.getQuestions());
        }
        ordered.addAll(definition.getQuestions());

        List<AnswerColumn> columns = new ArrayList<>();
        for (Question q : ordered) {
            boolean answerable = typeRegistry.validatorFor(q.getType())
                    .map(QuestionTypeValidator::answerable)
                    .orElse(true);
            if (!answerable || q.getCode() == null || q.getCode().isBlank()) {
                continue;
            }
            if ("ADDRESS".equals(q.getType())) {
                for (String field : AddressTypeValidator.enabledSubFields(q.getTypeConfig())) {
                    columns.add(new AnswerColumn(q.getCode() + "." + field, q.getCode(), "ADDRESS", field));
                }
            } else {
                columns.add(new AnswerColumn(q.getCode(), q.getCode(), q.getType(), null));
            }
        }
        return columns;
    }

    private static List<String> renderRow(ResponseDocument r, List<AnswerColumn> columns) {
        List<String> cells = new ArrayList<>(META_COLUMNS.size() + columns.size());
        cells.add(r.getResponseId() == null ? "" : r.getResponseId());
        // Host-supplied text → the FR4-17 formula guard applies.
        cells.add(r.getExternalRef() == null ? "" : guard(r.getExternalRef()));
        cells.add(r.getStatus() == null ? "" : r.getStatus());
        cells.add(Integer.toString(r.getVersionNumber()));
        cells.add(r.getCreatedAt() == null ? "" : r.getCreatedAt().toString());
        cells.add(r.getCompletedAt() == null ? "" : r.getCompletedAt().toString());
        Map<String, Object> answers = r.getAnswers() == null ? Map.of() : r.getAnswers();
        for (AnswerColumn column : columns) {
            cells.add(renderCell(answers.get(column.code()), column));
        }
        return cells;
    }

    /** FR4-16 per-type flattening; unanswered = empty cell. */
    private static String renderCell(Object value, AnswerColumn column) {
        if (value == null) {
            return "";
        }
        if (column.subField() != null) {
            // ADDRESS sub-column: the answer is a flat string-valued object (FR2-5).
            if (value instanceof Map<?, ?> map) {
                Object sub = map.get(column.subField());
                return sub == null ? "" : render(sub);
            }
            return "";
        }
        return render(value);
    }

    /**
     * Renders one answer value: strings guarded (FR4-17); JSON numbers and
     * booleans bare (TOGGLE {@code true}/{@code false}, NUMBER as-is — the
     * sanctioned deviation); arrays joined with {@code "; "} (CHECKBOX
     * selections, FILE_UPLOAD file names) with the guard applied to the joined
     * result.
     */
    private static String render(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof String s) {
            return guard(s);
        }
        if (value instanceof Boolean b) {
            return b.toString();
        }
        if (value instanceof Number n) {
            return n.toString();
        }
        if (value instanceof List<?> list) {
            StringBuilder joined = new StringBuilder();
            for (Object element : list) {
                if (!joined.isEmpty()) {
                    joined.append("; ");
                }
                if (element instanceof Map<?, ?> reference) {
                    // FILE_UPLOAD: file reference objects flatten to fileName (FR4-16).
                    Object fileName = reference.get("fileName");
                    joined.append(fileName == null ? "" : String.valueOf(fileName));
                } else if (element != null) {
                    joined.append(element);
                }
            }
            return guard(joined.toString());
        }
        if (value instanceof Map<?, ?> map) {
            // A flat object outside an ADDRESS column has no defined layout;
            // join entries readably rather than dropping data.
            StringBuilder joined = new StringBuilder();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!joined.isEmpty()) {
                    joined.append("; ");
                }
                joined.append(entry.getKey()).append(": ").append(entry.getValue());
            }
            return guard(joined.toString());
        }
        return guard(String.valueOf(value));
    }

    /** FR4-17 (P4-D5): the standard spreadsheet formula-injection mitigation. */
    private static String guard(String cell) {
        if (cell.isEmpty()) {
            return cell;
        }
        char first = cell.charAt(0);
        if (first == '=' || first == '+' || first == '-' || first == '@') {
            return "'" + cell;
        }
        return cell;
    }

    /** RFC 4180: comma-separated, CRLF row endings, quotes doubled inside quoted fields. */
    private static void writeRow(Writer writer, List<String> cells) throws IOException {
        for (int i = 0; i < cells.size(); i++) {
            if (i > 0) {
                writer.write(',');
            }
            writer.write(quote(cells.get(i)));
        }
        writer.write("\r\n");
    }

    private static String quote(String cell) {
        if (cell.indexOf(',') < 0 && cell.indexOf('"') < 0 && cell.indexOf('\r') < 0 && cell.indexOf('\n') < 0) {
            return cell;
        }
        return '"' + cell.replace("\"", "\"\"") + '"';
    }
}
