package io.formsengine;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * FR4-15/16/17 (P4-D4/D5): CSV response export — BOM-prefixed UTF-8, RFC 4180
 * quoting, columns derived from the selected version's definition in reading
 * order with the per-type flattening rules, newest-first rows, per-version
 * scoping, status filter, and the mandatory formula-injection guard on every
 * string-derived cell (numbers and booleans emitted bare by design).
 */
class CsvExportTest extends BaseApiTest {

    // ---- definition builders (steps → tabs → questions, BRD 5.1) ----

    @SafeVarargs
    private static Map<String, Object> tab(String id, Map<String, Object>... questions) {
        Map<String, Object> tab = new LinkedHashMap<>();
        tab.put("id", id);
        tab.put("title", "Tab " + id);
        tab.put("questions", new ArrayList<>(Arrays.asList(questions)));
        return tab;
    }

    @SafeVarargs
    private static Map<String, Object> stepWithTabs(String id, Map<String, Object>... tabs) {
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("id", id);
        step.put("title", "Step " + id);
        step.put("tabs", new ArrayList<>(Arrays.asList(tabs)));
        return step;
    }

    @SafeVarargs
    private static Map<String, Object> stepWithQuestions(String id, Map<String, Object>... questions) {
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("id", id);
        step.put("title", "Step " + id);
        step.put("questions", new ArrayList<>(Arrays.asList(questions)));
        return step;
    }

    /** ADDRESS with only {@code state} opted in beyond the always-enabled trio. */
    private static Map<String, Object> partialAddress(String id, String code) {
        Map<String, Object> typeConfig = new LinkedHashMap<>();
        typeConfig.put("enabledFields", new LinkedHashMap<>(Map.of("state", true)));
        typeConfig.put("requiredFields", new LinkedHashMap<>());
        typeConfig.put("defaultCountry", "US");
        typeConfig.put("autocomplete", false);
        return Defs.question(id, code, "ADDRESS", typeConfig);
    }

    /**
     * The v1 fixture definition: steps with tabs and with direct questions,
     * covering every flattening rule. Expected answer columns, reading order:
     * notes, colors, tog, num, homeAddr.country, homeAddr.line1, homeAddr.city,
     * homeAddr.state, docs, quoted — the display block contributes none.
     */
    private static Map<String, Object> fixtureDefinition() {
        Map<String, Object> def = Defs.emptyDefinition();
        def.put("steps", new ArrayList<>(List.of(
                stepWithTabs("s1",
                        tab("t1",
                                Defs.textQuestion("id-notes", "notes"),
                                Defs.checkboxQuestion("id-colors", "colors", "Red", "Blue", "Green")),
                        tab("t2",
                                Defs.toggleQuestion("id-tog", "tog"),
                                Defs.numberQuestion("id-num", "num"))),
                stepWithQuestions("s2",
                        partialAddress("id-addr", "homeAddr"),
                        Defs.fileUploadQuestion("id-docs", "docs", List.of("DOCUMENTS"), 3, 10),
                        Defs.displayBlock("id-blurb", "Just some text"),
                        Defs.textQuestion("id-quoted", "quoted")))));
        return def;
    }

    // externalRef sits between responseId and status since Phase 5 (FR5-3).
    private static final String EXPECTED_V1_HEADER =
            "responseId,externalRef,status,versionNumber,createdAt,completedAt,"
                    + "notes,colors,tog,num,"
                    + "homeAddr.country,homeAddr.line1,homeAddr.city,homeAddr.state,"
                    + "docs,quoted";

    /** One published questionnaire's ids. */
    private record Ctx(String id, String publicId) {
    }

    private Ctx publishFixture(String name) {
        Map<String, Object> detail = createQuestionnaire(name);
        String id = (String) detail.get("id");
        String publicId = (String) detail.get("publicId");
        assertEquals(200, putDraft(id, fixtureDefinition()).getStatusCode().value(), "draft save should succeed");
        assertEquals(200, publish(id, null).getStatusCode().value(), "publish should succeed");
        return new Ctx(id, publicId);
    }

    private String newResponse(String publicId, int versionNumber) {
        ResponseEntity<Map<String, Object>> created = post(
                "/public/v1/questionnaires/" + publicId + "/responses", Map.of("versionNumber", versionNumber));
        assertEquals(201, created.getStatusCode().value());
        return (String) created.getBody().get("responseId");
    }

    private void putAnswers(String responseId, Map<String, Object> answers) {
        assertEquals(200, patch("/public/v1/responses/" + responseId,
                Map.of("answers", answers)).getStatusCode().value());
    }

    /** The fully-answered response exercising every flattening + guard rule. */
    private String fullyAnsweredResponse(String publicId) {
        String responseId = newResponse(publicId, 1);
        Map<String, Object> answers = new LinkedHashMap<>();
        answers.put("notes", "=1+1");
        answers.put("colors", List.of("Red", "Blue"));
        answers.put("tog", false);
        answers.put("num", 0);
        answers.put("homeAddr", Map.of(
                "country", "US", "line1", "=2+2", "city", "Springfield", "state", "IL"));
        answers.put("docs", List.of(
                Map.of("fileId", "f_1", "fileName", "=cmd.pdf", "size", 10, "contentType", "application/pdf"),
                Map.of("fileId", "f_2", "fileName", "b img.pdf", "size", 5, "contentType", "application/pdf")));
        answers.put("quoted", "a,\"b\"\nline2");
        putAnswers(responseId, answers);
        return responseId;
    }

    private ResponseEntity<byte[]> fetchCsv(String questionnaireId, String query) {
        return rest.getForEntity("/api/v1/questionnaires/" + questionnaireId + "/responses/export.csv"
                + (query == null ? "" : "?" + query), byte[].class);
    }

    /** Asserts the BOM (EF BB BF) leads, then returns the decoded CSV text without it. */
    private static String assertBomAndDecode(byte[] body) {
        assertNotNull(body);
        assertTrue(body.length >= 3, "CSV body must at least carry the BOM");
        assertEquals((byte) 0xEF, body[0], "first BOM byte");
        assertEquals((byte) 0xBB, body[1], "second BOM byte");
        assertEquals((byte) 0xBF, body[2], "third BOM byte");
        return new String(body, 3, body.length - 3, StandardCharsets.UTF_8);
    }

    /** Minimal RFC 4180 reader (quotes, doubled quotes, CRLF rows, embedded newlines). */
    private static List<List<String>> parseCsv(String content) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < content.length(); i++) {
            char c = content.charAt(i);
            if (inQuotes) {
                if (c == '"') {
                    if (i + 1 < content.length() && content.charAt(i + 1) == '"') {
                        cell.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    cell.append(c);
                }
            } else if (c == '"') {
                inQuotes = true;
            } else if (c == ',') {
                row.add(cell.toString());
                cell.setLength(0);
            } else if (c == '\r' && i + 1 < content.length() && content.charAt(i + 1) == '\n') {
                row.add(cell.toString());
                cell.setLength(0);
                rows.add(row);
                row = new ArrayList<>();
                i++;
            } else {
                cell.append(c);
            }
        }
        if (cell.length() > 0 || !row.isEmpty()) {
            row.add(cell.toString());
            rows.add(row);
        }
        return rows;
    }

    // ---- tests ----

    @Test
    void csvFlattensEveryTypeWithGuardsQuotingAndOrdering() throws InterruptedException {
        Ctx ctx = publishFixture("CSV Full");
        String olderId = fullyAnsweredResponse(ctx.publicId());
        assertEquals(200, post("/public/v1/responses/" + olderId + "/complete", Map.of())
                .getStatusCode().value());
        Thread.sleep(20); // distinct createdAt for a deterministic newest-first order
        String newerId = newResponse(ctx.publicId(), 1);
        putAnswers(newerId, Map.of("notes", "plain", "tog", true, "num", 3.5));

        ResponseEntity<byte[]> resp = fetchCsv(ctx.id(), null);
        assertEquals(200, resp.getStatusCode().value());
        assertTrue(resp.getHeaders().getContentType().toString().startsWith("text/csv"),
                "Content-Type must be text/csv, got: " + resp.getHeaders().getContentType());
        String disposition = resp.getHeaders().getFirst("Content-Disposition");
        assertNotNull(disposition);
        assertTrue(disposition.startsWith("attachment"), "CSV must download as an attachment");
        assertTrue(disposition.contains("csv-full-responses.csv"), "got: " + disposition);

        String content = assertBomAndDecode(resp.getBody());
        List<List<String>> rows = parseCsv(content);
        assertEquals(3, rows.size(), "header + two responses");
        assertEquals(EXPECTED_V1_HEADER, String.join(",", rows.get(0)),
                "header must follow the definition's reading order with meta columns first");

        // Newest first (FR4-15).
        List<String> newer = rows.get(1);
        List<String> older = rows.get(2);
        assertEquals(newerId, newer.get(0));
        assertEquals(olderId, older.get(0));

        // Older row: every flattening + guard rule (FR4-16/17).
        assertEquals("", older.get(1), "no externalRef supplied = empty cell (FR5-3)");
        assertEquals("COMPLETED", older.get(2));
        assertEquals("1", older.get(3));
        assertTrue(older.get(4).endsWith("Z"), "createdAt must be ISO-8601, got: " + older.get(4));
        assertTrue(older.get(5).endsWith("Z"), "completedAt must be ISO-8601, got: " + older.get(5));
        assertEquals("'=1+1", older.get(6), "a leading '=' must be guarded (FR4-17)");
        assertEquals("Red; Blue", older.get(7), "CHECKBOX joins with '; '");
        assertEquals("false", older.get(8), "TOGGLE renders bare true/false");
        assertEquals("0", older.get(9), "NUMBER renders the bare number, including 0");
        assertEquals("US", older.get(10));
        assertEquals("'=2+2", older.get(11), "the guard applies inside address sub-fields");
        assertEquals("Springfield", older.get(12));
        assertEquals("IL", older.get(13));
        assertEquals("'=cmd.pdf; b img.pdf", older.get(14),
                "FILE_UPLOAD joins file names; the joined cell is guarded");
        assertEquals("a,\"b\"\nline2", older.get(15),
                "comma + quote + newline must round-trip through RFC 4180 quoting");
        assertTrue(content.contains("\"a,\"\"b\"\"\nline2\""),
                "the raw stream must show RFC 4180 quoting with doubled quotes");

        // Newer row: bare values unguarded, unanswered cells empty.
        assertEquals("IN_PROGRESS", newer.get(2));
        assertEquals("", newer.get(5), "no completedAt while in progress");
        assertEquals("plain", newer.get(6), "ordinary strings are not guarded");
        assertEquals("", newer.get(7), "unanswered = empty cell");
        assertEquals("true", newer.get(8));
        assertEquals("3.5", newer.get(9));
        for (int i = 10; i <= 15; i++) {
            assertEquals("", newer.get(i), "unanswered column " + i + " must be empty");
        }
    }

    @Test
    void csvStatusFilterSelectsMatchingResponsesOnly() {
        Ctx ctx = publishFixture("CSV Status Filter");
        String completedId = newResponse(ctx.publicId(), 1);
        putAnswers(completedId, Map.of("notes", "done"));
        assertEquals(200, post("/public/v1/responses/" + completedId + "/complete", Map.of())
                .getStatusCode().value());
        String inProgressId = newResponse(ctx.publicId(), 1);
        putAnswers(inProgressId, Map.of("notes", "typing"));

        List<List<String>> completed = parseCsv(assertBomAndDecode(
                fetchCsv(ctx.id(), "status=COMPLETED").getBody()));
        assertEquals(2, completed.size());
        assertEquals(completedId, completed.get(1).get(0));

        List<List<String>> inProgress = parseCsv(assertBomAndDecode(
                fetchCsv(ctx.id(), "status=IN_PROGRESS").getBody()));
        assertEquals(2, inProgress.size());
        assertEquals(inProgressId, inProgress.get(1).get(0));

        ResponseEntity<Map<String, Object>> bad = get(
                "/api/v1/questionnaires/" + ctx.id() + "/responses/export.csv?status=BOGUS");
        assertEquals(400, bad.getStatusCode().value());
        assertTrue(((String) bad.getBody().get("message")).contains("invalid status filter"));
    }

    @Test
    void csvIsPerVersionWithLiveVersionAsDefault() {
        Ctx ctx = publishFixture("CSV Versions");
        String v1Response = newResponse(ctx.publicId(), 1);
        putAnswers(v1Response, Map.of("notes", "on v1"));

        // Publish v2 with a completely different single question.
        assertEquals(200, putDraft(ctx.id(),
                Defs.definitionWithQuestions(Defs.textQuestion("id-second", "second"))).getStatusCode().value());
        assertEquals(200, publish(ctx.id(), "v2").getStatusCode().value());
        String v2Response = newResponse(ctx.publicId(), 2);
        putAnswers(v2Response, Map.of("second", "on v2"));

        // Default = current live version (v2): its columns, its rows only.
        List<List<String>> live = parseCsv(assertBomAndDecode(fetchCsv(ctx.id(), null).getBody()));
        assertEquals("responseId,externalRef,status,versionNumber,createdAt,completedAt,second",
                String.join(",", live.get(0)));
        assertEquals(2, live.size(), "only the v2-pinned response");
        assertEquals(v2Response, live.get(1).get(0));
        assertEquals("on v2", live.get(1).get(6));

        // versionNumber=1: v1 columns, v1 rows only (P4-D4 honest column set).
        List<List<String>> v1 = parseCsv(assertBomAndDecode(fetchCsv(ctx.id(), "versionNumber=1").getBody()));
        assertEquals(EXPECTED_V1_HEADER, String.join(",", v1.get(0)));
        assertEquals(2, v1.size(), "only the v1-pinned response");
        assertEquals(v1Response, v1.get(1).get(0));
        assertEquals("on v1", v1.get(1).get(6));
        assertFalse(String.join(",", v1.get(0)).contains("second"),
                "v1 columns must not leak v2 question codes");

        // An unknown version is a 404, mirroring GET /versions/{n}.
        assertEquals(404, get("/api/v1/questionnaires/" + ctx.id()
                + "/responses/export.csv?versionNumber=99").getStatusCode().value());
    }

    @Test
    void csvOfNeverPublishedQuestionnaireIs400() {
        Map<String, Object> detail = createQuestionnaire("CSV Unpublished");
        String id = (String) detail.get("id");
        ResponseEntity<Map<String, Object>> resp = get(
                "/api/v1/questionnaires/" + id + "/responses/export.csv");
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(((String) resp.getBody().get("message")).contains("never been published"),
                "the 400 must say why, got: " + resp.getBody().get("message"));
    }

    @Test
    void csvOfAVersionWithNoResponsesIsHeaderOnly() {
        Ctx ctx = publishFixture("CSV Empty");
        List<List<String>> rows = parseCsv(assertBomAndDecode(fetchCsv(ctx.id(), null).getBody()));
        assertEquals(1, rows.size(), "just the header row");
        assertEquals(EXPECTED_V1_HEADER, String.join(",", rows.get(0)));
    }
}
