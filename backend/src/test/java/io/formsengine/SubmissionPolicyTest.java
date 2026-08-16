package io.formsengine;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Phase 5: external reference capture (FR5-1/2), submission policy setting
 * (FR5-4), create/complete enforcement with the machine-readable
 * ALREADY_SUBMITTED code (FR5-6), race-safe completion at the database level
 * (FR5-7, P5-D2), policy transport in public payloads (FR5-12), and the
 * management-surface amendments (FR5-3): externalRef filter, export field and
 * CSV meta column.
 */
class SubmissionPolicyTest extends BaseApiTest {

    // ---- helpers -----------------------------------------------------------

    private record Ctx(String id, String publicId) {
    }

    private Ctx published(String name) {
        Map<String, Object> detail = createQuestionnaire(name);
        String id = (String) detail.get("id");
        draftAndPublish(id, "q1");
        return new Ctx(id, (String) detail.get("publicId"));
    }

    private void setPolicy(String id, String policy) {
        ResponseEntity<Map<String, Object>> patched = patch("/api/v1/questionnaires/" + id,
                Map.of("submissionPolicy", policy));
        assertEquals(200, patched.getStatusCode().value());
        assertEquals(policy, patched.getBody().get("submissionPolicy"));
    }

    private ResponseEntity<Map<String, Object>> createWithRef(String publicId, Object externalRef) {
        Map<String, Object> body = new HashMap<>();
        body.put("versionNumber", 1);
        if (externalRef != null) {
            body.put("externalRef", externalRef);
        }
        return post("/public/v1/questionnaires/" + publicId + "/responses", body);
    }

    private ResponseEntity<Map<String, Object>> complete(String responseId) {
        return post("/public/v1/responses/" + responseId + "/complete", Map.of());
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> listResponses(String id, String query) {
        ResponseEntity<Map<String, Object>> resp = get(
                "/api/v1/questionnaires/" + id + "/responses" + (query.isEmpty() ? "" : "?" + query));
        assertEquals(200, resp.getStatusCode().value());
        return (List<Map<String, Object>>) resp.getBody().get("items");
    }

    // ---- FR5-1/2: capture, trim, caps, default policy ----------------------

    @Test
    void externalRefIsCapturedTrimmedAndSurfacedInExports() {
        Ctx ctx = published("Ref Capture");

        String responseId = (String) createWithRef(ctx.publicId(), "  user-4821  ").getBody().get("responseId");
        assertNotNull(responseId);

        List<Map<String, Object>> items = listResponses(ctx.id(), "externalRef=user-4821");
        assertEquals(1, items.size(), "the trimmed ref must be stored and filterable");
        assertEquals("user-4821", items.get(0).get("externalRef"));
        assertEquals(responseId, items.get(0).get("responseId"));

        // A response created without a ref has none.
        String plain = (String) createWithRef(ctx.publicId(), null).getBody().get("responseId");
        List<Map<String, Object>> all = listResponses(ctx.id(), "");
        Map<String, Object> plainRow = all.stream()
                .filter(r -> plain.equals(r.get("responseId"))).findFirst().orElseThrow();
        assertNull(plainRow.get("externalRef"));
    }

    @Test
    void externalRefOverLengthCapIs400AndBlankIsIgnored() {
        Ctx ctx = published("Ref Caps");
        assertEquals(400, createWithRef(ctx.publicId(), "x".repeat(129)).getStatusCode().value());
        assertEquals(201, createWithRef(ctx.publicId(), "x".repeat(128)).getStatusCode().value());
        // Blank = absent under MULTIPLE: fine, stored as no ref.
        assertEquals(201, createWithRef(ctx.publicId(), "   ").getStatusCode().value());
    }

    @Test
    void multiplePolicyAllowsRepeatCompletionsWithTheSameRef() {
        Ctx ctx = published("Multiple");
        // Default policy is MULTIPLE and appears in the detail + live payloads.
        ResponseEntity<Map<String, Object>> detail = get("/api/v1/questionnaires/" + ctx.id());
        assertEquals("MULTIPLE", detail.getBody().get("submissionPolicy"));
        ResponseEntity<Map<String, Object>> live = get("/public/v1/questionnaires/" + ctx.publicId() + "/live");
        assertEquals("MULTIPLE", live.getBody().get("submissionPolicy"));

        // Walkthrough 1: two full submissions with the same ref both succeed.
        for (int i = 0; i < 2; i++) {
            String responseId = (String) createWithRef(ctx.publicId(), "user-4821").getBody().get("responseId");
            assertEquals(200, complete(responseId).getStatusCode().value());
        }
        List<Map<String, Object>> completed = listResponses(ctx.id(), "externalRef=user-4821&status=COMPLETED");
        assertEquals(2, completed.size());
    }

    // ---- FR5-4: setting validation -----------------------------------------

    @Test
    void submissionPolicyPatchValidatesValues() {
        Ctx ctx = published("Policy Patch");
        setPolicy(ctx.id(), "ONE_PER_REF");
        setPolicy(ctx.id(), "MULTIPLE");
        assertEquals(400, patch("/api/v1/questionnaires/" + ctx.id(),
                Map.of("submissionPolicy", "ALWAYS")).getStatusCode().value());
    }

    // ---- FR5-6a: create enforcement ----------------------------------------

    @Test
    void onePerRefCreateRequiresARefAndRejectsCompletedRefs() {
        Ctx ctx = published("One Per Ref Create");
        setPolicy(ctx.id(), "ONE_PER_REF");

        // Missing and blank refs → 400 (FR5-6).
        assertEquals(400, createWithRef(ctx.publicId(), null).getStatusCode().value());
        assertEquals(400, createWithRef(ctx.publicId(), "   ").getStatusCode().value());

        // First session: creation and completion succeed.
        String first = (String) createWithRef(ctx.publicId(), "invite-1").getBody().get("responseId");
        assertEquals(200, complete(first).getStatusCode().value());

        // Same ref again → 409 with the machine-readable code.
        ResponseEntity<Map<String, Object>> blocked = createWithRef(ctx.publicId(), "invite-1");
        assertEquals(409, blocked.getStatusCode().value());
        assertEquals("ALREADY_SUBMITTED", blocked.getBody().get("code"));

        // A different ref is unaffected.
        assertEquals(201, createWithRef(ctx.publicId(), "invite-2").getStatusCode().value());
    }

    @Test
    void inProgressResponsesNeverBlockAnything() {
        // P5-D2: abandoned drafts must not lock a person out.
        Ctx ctx = published("In Progress Never Blocks");
        setPolicy(ctx.id(), "ONE_PER_REF");

        assertEquals(201, createWithRef(ctx.publicId(), "user-1").getStatusCode().value());
        assertEquals(201, createWithRef(ctx.publicId(), "user-1").getStatusCode().value());
        String third = (String) createWithRef(ctx.publicId(), "user-1").getBody().get("responseId");

        // Any of the concurrent in-progress responses may complete.
        assertEquals(200, complete(third).getStatusCode().value());
    }

    // ---- FR5-6b/7: completion enforcement ----------------------------------

    @Test
    void completionRaceLeavesExactlyOneCompleted() throws Exception {
        Ctx ctx = published("Complete Race");
        setPolicy(ctx.id(), "ONE_PER_REF");

        // Walkthrough 3: two sessions, same ref, both filled; exactly one may win.
        String a = (String) createWithRef(ctx.publicId(), "race-1").getBody().get("responseId");
        String b = (String) createWithRef(ctx.publicId(), "race-1").getBody().get("responseId");

        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (String responseId : List.of(a, b)) {
                results.add(pool.submit(() -> {
                    start.await();
                    return complete(responseId).getStatusCode().value();
                }));
            }
            start.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> f : results) {
                statuses.add(f.get());
            }
            statuses.sort(Integer::compareTo);
            assertEquals(List.of(200, 409), statuses,
                    "exactly one completion must win; the loser gets 409");
        } finally {
            pool.shutdownNow();
        }

        List<Map<String, Object>> completed = listResponses(ctx.id(), "externalRef=race-1&status=COMPLETED");
        assertEquals(1, completed.size(), "the database-level guard must leave exactly one COMPLETED response");
    }

    @Test
    void completeLoserGets409WithCodeAndSequentialSecondCompleteIsBlocked() {
        Ctx ctx = published("Complete Sequential");
        setPolicy(ctx.id(), "ONE_PER_REF");

        String winner = (String) createWithRef(ctx.publicId(), "seq-1").getBody().get("responseId");
        String loser = (String) createWithRef(ctx.publicId(), "seq-1").getBody().get("responseId");

        assertEquals(200, complete(winner).getStatusCode().value());
        ResponseEntity<Map<String, Object>> blocked = complete(loser);
        assertEquals(409, blocked.getStatusCode().value());
        assertEquals("ALREADY_SUBMITTED", blocked.getBody().get("code"));

        // Idempotency survives the policy: re-completing the WINNER is 200.
        assertEquals(200, complete(winner).getStatusCode().value());
    }

    @Test
    void policyFlipRespectsCompletionsFromTheMultipleEra() {
        // Responses completed under MULTIPLE carry no completion key; the
        // complete-time and create-time pre-checks must still see them.
        Ctx ctx = published("Policy Flip");
        String earlier = (String) createWithRef(ctx.publicId(), "flip-1").getBody().get("responseId");
        assertEquals(200, complete(earlier).getStatusCode().value());

        setPolicy(ctx.id(), "ONE_PER_REF");
        ResponseEntity<Map<String, Object>> blockedCreate = createWithRef(ctx.publicId(), "flip-1");
        assertEquals(409, blockedCreate.getStatusCode().value());
        assertEquals("ALREADY_SUBMITTED", blockedCreate.getBody().get("code"));
    }

    @Test
    void refLessResponseCompletesNormallyEvenUnderOnePerRef() {
        // A session created under MULTIPLE (no ref) must still complete after
        // the policy flips — there is no ref to deduplicate on.
        Ctx ctx = published("Refless Complete");
        String responseId = (String) createWithRef(ctx.publicId(), null).getBody().get("responseId");
        setPolicy(ctx.id(), "ONE_PER_REF");
        assertEquals(200, complete(responseId).getStatusCode().value());
    }

    // ---- FR5-12: policy transport ------------------------------------------

    @Test
    void livePayloadAndRehydrationCarryTheCurrentPolicy() {
        Ctx ctx = published("Policy Transport");
        String responseId = (String) createWithRef(ctx.publicId(), "transport-1").getBody().get("responseId");

        setPolicy(ctx.id(), "ONE_PER_REF");
        ResponseEntity<Map<String, Object>> live = get("/public/v1/questionnaires/" + ctx.publicId() + "/live");
        assertEquals("ONE_PER_REF", live.getBody().get("submissionPolicy"));

        // Rehydration reports the CURRENT policy, not anything pinned.
        ResponseEntity<Map<String, Object>> rehydrated = get("/public/v1/responses/" + responseId);
        assertEquals(200, rehydrated.getStatusCode().value());
        assertEquals("ONE_PER_REF", rehydrated.getBody().get("submissionPolicy"));
    }

    // ---- FR5-3: CSV meta column --------------------------------------------

    @Test
    void csvCarriesExternalRefColumnWithFormulaGuardAndRefFilter() {
        Ctx ctx = published("Ref Csv");
        String guarded = (String) createWithRef(ctx.publicId(), "=cmd()").getBody().get("responseId");
        assertEquals(200, complete(guarded).getStatusCode().value());
        String other = (String) createWithRef(ctx.publicId(), "safe-ref").getBody().get("responseId");
        assertEquals(200, complete(other).getStatusCode().value());

        ResponseEntity<String> csv = rest.getForEntity(
                "/api/v1/questionnaires/" + ctx.id() + "/responses/export.csv", String.class);
        assertEquals(200, csv.getStatusCode().value());
        String body = csv.getBody();
        assertNotNull(body);
        String[] lines = body.replace("\uFEFF", "").split("\r\n");
        assertTrue(lines[0].startsWith("responseId,externalRef,status,versionNumber,createdAt,completedAt"),
                "externalRef must sit between responseId and status; got header: " + lines[0]);
        assertTrue(body.contains(",'=cmd(),"),
                "a formula-shaped ref must arrive with the FR4-17 single-quote guard");

        // The CSV endpoint honors the externalRef filter (FR5-3).
        ResponseEntity<String> filtered = rest.getForEntity(
                "/api/v1/questionnaires/" + ctx.id() + "/responses/export.csv?externalRef=safe-ref", String.class);
        String filteredBody = filtered.getBody();
        assertNotNull(filteredBody);
        assertTrue(filteredBody.contains("safe-ref"));
        assertEquals(2, filteredBody.trim().split("\r\n").length, "header + exactly one matching row");
    }
}
