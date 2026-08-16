# Forms-Engine Backend

Spring Boot 3.5 / Java 21 backend for the Forms-Engine questionnaire platform.
Serves two cleanly separated route groups (BRD 9):

- **Management API** — `/api/v1/**`, consumed by the editor (questionnaires, drafts, publish, versions, response export).
- **Public runtime API** — `/public/v1/**`, consumed by embedded questionnaires (live definition, response lifecycle).

Interactive API reference: [`/swagger-ui.html`](http://localhost:8080/swagger-ui.html) once the app is running.

## Running

Requires a reachable MongoDB (defaults to `mongodb://localhost:27017/forms_engine`).

With the Maven wrapper:

```sh
./mvnw spring-boot:run          # Linux/macOS
mvnw.cmd spring-boot:run        # Windows
```

With Docker:

```sh
docker build -t forms-engine-backend .
docker run -p 8080:8080 -e MONGODB_URI=mongodb://host.docker.internal:27017/forms_engine forms-engine-backend
```

Tests (spin up an embedded MongoDB automatically via flapdoodle — no local Mongo needed):

```sh
./mvnw test
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017/forms_engine` | MongoDB connection string |
| `PORT` | `8080` | HTTP port |
| `FORMS_RATE_LIMIT_ENABLED` | `true` | Per-IP token-bucket rate limiting on mutating `/public/v1/**` endpoints (NFR-3) |

Rate-limit tuning (application properties): `forms.rate-limit.capacity` (default 20) and `forms.rate-limit.refill-per-second` (default 10).

## Security posture (NFR-3 — read this before deploying)

There is **no authentication** in v1:

- The **management API (`/api/v1/**`) and the editor must be network-protected by you**, the self-hoster — put them behind a reverse proxy with auth, a VPN, or network policy. CORS on `/api/**` is intentionally wide open because protection happens at the deployment layer.
- The **public API (`/public/v1/**`) is internet-facing** and is protected by unguessable response ids, per-questionnaire allowed-origin enforcement (FR-B-3), server-side input caps (NFR-4: definitions ≤ 1 MB, answers ≤ 256 KB / 500 keys / 10 KB per value), and per-IP rate limiting on mutating endpoints.

## Notes

- Question codes are the developer's contract: they key the flat answers JSON and rule conditions, and are never rewritten in stored responses (BRD 5.3).
- Publishing snapshots the draft into the append-only `questionnaire_versions` collection; in-flight respondents stay pinned to the version they started on (D-5).
- Deleting a questionnaire deletes its versions but **retains responses** (orphaned) per FR-E-1.
