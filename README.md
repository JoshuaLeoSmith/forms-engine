# Forms-Engine

An open-source dynamic questionnaire platform. Build complex, multi-level
questionnaires (steps → tabs → sections → questions) with conditional logic in
a visual **Editor**, publish them with version history, and embed the live
questionnaire into any website via a framework-agnostic **web component**
(with thin React and Angular wrappers). Responses land as flat JSON in a
MongoDB you own.

## See it in 60 seconds

**1. Build a rule in the editor**


https://github.com/user-attachments/assets/f79771ec-fe82-4078-b7d5-28875a090e97



*Unchecking "Always visible" and adding a `color1 not equals black` condition to the follow-up question — no code, saved as an unpublished draft until you hit Publish.*

**2. Watch it fire in the embed**

https://github.com/user-attachments/assets/ba42577c-3804-44bc-b685-e6b8474a2bd8



*The "do you like the color black?" question exists only while the rule matches — type `black` as your favorite color and it disappears (and its answer is cleared).*

- **Complex structure without code** — four hierarchy levels, any upper level optional.
- **Conditional logic** — visibility & requirement rules on steps, tabs, and questions,
  with type-aware operators (`CONTAINS`, `GREATER_THAN`, `BEFORE`, address sub-field
  targeting, …).
- **Twelve question types** — text box, radio, checkboxes, dropdown (searchable), date
  (popup calendar), number, email, phone, yes/no toggle, address (with geocoding
  autocomplete), display text (sanitized rich content), and file upload (content-verified,
  pluggable storage).
- **Safe iteration** — draft/publish workflow; in-flight respondents are never disrupted.
  A **draft preview** in the editor mounts the real embed component fully in-memory, so
  rules and gating are testable without publishing or polluting data.
- **Own your data** — responses keyed by question code with typed values (strings,
  numbers, booleans, arrays, address objects, file references), pinned to the version
  they started on; uploaded files live on your disk or S3-compatible bucket.
- **Launch-ready plumbing** — refresh-resilient respondent sessions, a responses browser
  with hard delete (data-subject erasure) and per-version **CSV export**
  (formula-injection-guarded), questionnaire **export/import** across environments, a
  per-embed strings override for non-English sites, and an optional completion redirect.
- **External references & submission policy** — pass an `external-ref` (your user id,
  order number, invite code) on the embed to correlate responses with your own records,
  filter and export by it, and optionally enforce **one completed submission per
  reference** (honor-system deduplication for cooperative users, race-safe at the
  database level).

## Repository layout

```
forms-engine/
├── backend/            # Spring Boot 3 / Java 21 API (management + public runtime)
├── editor/             # Angular editor SPA
├── packages/
│   ├── renderer/       # @forms-engine/renderer — the <forms-engine> web component (Lit)
│   ├── react/          # @forms-engine/react — thin React wrapper
│   └── angular/        # @forms-engine/angular — thin Angular wrapper
├── shared/rule-fixtures/  # JSON conformance tests for the rule engine
├── examples/           # minimal plain-html / react / angular embeds + seed script
├── docs/               # adding-a-question-type.md, renderer-labels.md
└── docker-compose.yml  # mongo + minio + backend + editor, one command
```

## Quick start (self-hosting)

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Editor | http://localhost:8081 |
| Backend API | http://localhost:8080 (OpenAPI at `/swagger-ui.html`) |
| MongoDB | mongodb://localhost:27017/forms_engine |
| MinIO console | http://localhost:9001 (default login `minioadmin` / `minioadmin`) |

Then:

1. Open the editor, create a questionnaire, add steps/tabs/questions and rules
   — or skip the clicking: `node examples/seed/seed.mjs` imports and publishes
   a ready-made demo questionnaire and prints its `publicId`.
2. Click **Publish changes** (creates immutable version 1).
3. Click **Embed**, copy the plain-HTML snippet into a page — or paste your
   questionnaire's `publicId` into
   [`examples/plain-html/index.html`](examples/plain-html/index.html).
4. Fill in the form; watch the response appear:

   ```bash
   docker compose exec mongo mongosh forms_engine --eval 'db.responses.find().pretty()'
   ```

Configuration is environment-driven (see `docker-compose.yml`): `FE_API_BASE`
(browser-facing backend URL baked into the editor's runtime config),
`BACKEND_PORT`, `EDITOR_PORT`, `MONGO_PORT`, the backend's `MONGODB_URI`, and
`PHOTON_BASE_URL` (geocoder, below).

## ⚠️ Address autocomplete & Photon (geocoding)

ADDRESS questions offer search-as-you-type autocomplete. The backend proxies
all geocoding through `GET /public/v1/geocode` (the embed never talks to the
geocoder directly), backed by [Photon](https://github.com/komoot/photon) —
komoot's OpenStreetMap-based autocomplete geocoder.

The default `PHOTON_BASE_URL` is Photon's public instance,
`https://photon.komoot.io`. **That is a fair-use community service — fine for
evaluation, but self-host Photon for production traffic:**

```yaml
# add to docker-compose.yml
photon:
  image: rtuszik/photon-docker:latest   # community image; see Photon's README
  environment:
    - COUNTRY_CODE=us                   # downloads a country extract on first start
  volumes:
    - photon_data:/photon/photon_data
```

and set `PHOTON_BASE_URL=http://photon:2322` on the backend service. If the
geocoder is down or unreachable, autocomplete silently degrades — manual
address entry always works.

## File uploads & storage

`FILE_UPLOAD` questions accept respondent files. Files never live in MongoDB —
they go to a pluggable storage backend behind one interface; a Mongo
`uploaded_files` collection is the index.

```
STORAGE_MODE=filesystem | s3     # default: filesystem (bare runs); the compose stack sets s3 + MinIO
FS_STORAGE_PATH=./data/uploads   # filesystem mode: created if absent; startup fails loudly if unwritable
S3_ENDPOINT=http://minio:9000    # omit/empty for real AWS (SDK derives from region)
S3_BUCKET=forms-engine-uploads
S3_ACCESS_KEY=…
S3_SECRET_KEY=…
S3_REGION=us-east-1
S3_PATH_STYLE=true               # ⚠️ true for MinIO and most S3-compatibles; false/omit for AWS
```

> **`S3_PATH_STYLE` is the classic silent-failure knob.** MinIO, Cloudflare R2
> (custom domains aside), Backblaze B2 and most compatibles want **path-style**
> addressing (`endpoint/bucket/key`); real AWS wants **virtual-hosted style**
> (`bucket.endpoint/key`). If uploads fail with cryptic DNS or 403 errors,
> check this flag first. Smoke-tested: MinIO (in the compose stack and tests),
> AWS S3; expected-compatible per protocol: R2, B2, DigitalOcean Spaces, GCS
> interoperability mode.

On boot the backend performs a put/get/delete round-trip with a canary object
and **fails startup** if storage is unreachable — misconfiguration surfaces at
deploy time, not at the first respondent's upload.

**What's accepted** — the editor offers categories, the server owns the
extension ↔ content mapping and verifies file *content* (magic bytes), never
trusting the filename or the client's `Content-Type`:

| Category | Extensions |
|---|---|
| Documents | pdf, doc, docx |
| Images | jpg, jpeg, png, gif, webp |
| Spreadsheets | xls, xlsx, csv |
| Text | txt, md |
| Archives | zip |

Executables, scripts, HTML, and SVG are not offerable in any category, ever
(SVG is scriptable and therefore an attack format, not an image, for upload
purposes). A `.pdf` that is actually a zip, or an "image" that is actually
HTML, is rejected. Downloads exist **only on the management API**
(`GET /api/v1/questionnaires/{id}/responses/{responseId}/files/{fileId}`),
always as `Content-Disposition: attachment` with `X-Content-Type-Options:
nosniff` — files are never served inline and never from a public endpoint.

**Caps & lifecycle** (all env-tunable): per-file size from the question's
config, bounded by `MAX_FILE_SIZE_MB` (default 50); per-response
`MAX_FILES_PER_RESPONSE` (20) and `MAX_BYTES_PER_RESPONSE_MB` (200); upload
rate limit 30 uploads / 10 min / IP. An hourly orphan-cleanup job
(`FILE_CLEANUP_CRON`) deletes `ACTIVE` files older than
`FILE_ORPHAN_GRACE_HOURS` (24) that no response's answers reference — covering
abandoned sessions and failed deletes. Files referenced by a completed
response are permanent.

**Malware scanning hook** — a no-op `FileScanner` interface is invoked
post-verification, pre-storage (`backend/src/main/java/io/formsengine/service/FileScanner.java`).
If you need virus scanning, implement it against [ClamAV](https://www.clamav.net/)
(e.g. clamd's INSTREAM protocol) and register your bean; nothing else changes.

## Embedding

```html
<script type="module" src="https://unpkg.com/@forms-engine/renderer/dist/forms-engine.esm.js"></script>
<forms-engine public-id="q_8f3k2m" api-base="https://forms.your-domain.com"></forms-engine>
```

Events: `fe-loaded`, `fe-screen-changed`, `fe-completed` (`{ responseId }`),
`fe-error`, `fe-resumed` (`{ responseId, screenId }` — fired when a refreshed
session picks up where it left off), `fe-already-submitted`
(`{ externalRef }` — fired instead of rendering the form when the supplied
reference has already completed it). Theme via CSS custom properties
(`--fe-color-primary`, `--fe-font-family`, …) — styles are
shadow-DOM-encapsulated, host styles never leak in. React:
`@forms-engine/react` (`<FormsEngine publicId apiBase …/>`). Angular:
`@forms-engine/angular` (`<forms-engine-embed [publicId] [apiBase]/>`).

Runnable examples for all three surfaces live in
[`examples/`](examples/README.md) —
[plain HTML](examples/plain-html/index.html),
[React](examples/react/), and [Angular](examples/angular/) — each a
minimal mount-and-log-events app, seeded with one command
(`node examples/seed/seed.mjs`). They build against the current source in CI,
and the Playwright suite runs against the plain-HTML one, so they cannot
silently drift from the shipped packages. StackBlitz links arrive with the
public demo instance (see `examples/README.md`).

Optional attributes (Phases 4–5):

| Attribute | Default | Purpose |
|---|---|---|
| `persist-session` | `true` | Stores `{responseId}` in **sessionStorage** so a page refresh resumes the in-progress response (against its pinned version). Set `"false"` to disable. Survives refresh/same-tab navigation only — not browser restarts. |
| `completion-redirect` | — | Absolute `http(s)` URL to navigate to after a successful completion. Fires **after** `fe-completed`, so host handlers always run. Non-http(s) schemes are ignored with a console warning. |
| `labels` | — | JSON object overriding built-in strings per key, with English fallback for every key not supplied — e.g. `labels='{"finish":"Enviar","requiredError":"Este campo es obligatorio"}'`. Full key list: [docs/renderer-labels.md](docs/renderer-labels.md). |
| `external-ref` | — | Opaque string (1–128 chars) identifying the respondent **in your own terms** — a user id, order number, invite code. Stored on the response, filterable in the responses browser/CSV, and required when the questionnaire's submission policy is `ONE_PER_REF`. Captured at mount; mid-session changes are ignored. See [External references](#external-references--submission-policy). |

## External references & submission policy

Forms-Engine never authenticates respondents — `external-ref` is a label your
application vouches for, passed from your page's markup. Per questionnaire you
can set a **submission policy** (editor → Embed panel, next to allowed
origins):

- **`MULTIPLE`** (default) — exactly the previous behavior; the ref is stored
  for correlation only.
- **`ONE_PER_REF`** — one **completed** response per reference: creating a new
  session or completing one is rejected with `409 ALREADY_SUBMITTED` once a
  completed same-ref response exists (the embed then shows an
  "already submitted" state and emits `fe-already-submitted`). In-progress
  responses never block anything — abandoned drafts can't lock someone out.
  Completion is enforced race-safely at the database level; embedding without
  an `external-ref` renders a loud configuration error by design.

The renderer checks `GET /public/v1/questionnaires/{publicId}/ref-status?ref=…`
on mount; it returns **only** `{"status":"NONE"|"COMPLETED"}` — never a
`responseId`, answers, or an in-progress signal — so a guessable ref (a
sequential user id, an email) can never be escalated into reading someone's
answers.

**⚠️ Honor-system deduplication:** `ONE_PER_REF` deduplicates cooperative
users; anyone editing the page can change the ref. Not suitable for contests,
votes, or any adversarial setting until signed references exist. Two further
consequences to know about: `ref-status` necessarily reveals *whether a given
ref has completed* to anyone who queries it (it is rate-limited separately and
stricter; pass opaque random tokens rather than meaningful ids where that
matters), and **cross-device resume deliberately does not exist yet** — a ref
alone must never unlock a session, so resume stays same-device (sessionStorage)
until signed references ship.

## ⚠️ Security posture (v1)

There is **no authentication** (BRD NFR-3). The split is:

- `/api/v1/**` (management) and the editor UI **must be network-protected by
  you** — reverse proxy with auth, VPN, or network policy. Anyone who can
  reach them can edit and read everything.
- `/public/v1/**` is designed to be internet-facing: unguessable response ids,
  per-questionnaire allowed-origin enforcement, input size caps, and per-IP
  rate limiting on mutating endpoints.
- **File uploads:** the `responseId` is the only credential a respondent
  session holds (BRD FR3-26). Anyone holding a responseId can upload to that
  response — within the category allowlist, content verification, and the size
  / count / rate caps above — until the response is completed. This is the
  accepted posture, consistent with the rest of the public API; the ids are
  UUIDv4-unguessable and never enumerable.

## ⚠️ Question codes are load-bearing

The question **code** (e.g. `food2`) is the key in submitted answers, the
reference in rule conditions, and your downstream join key. Renaming a code
updates rule references in the draft, but **historical responses keep the old
key** — each response is pinned to a `versionNumber` so it stays
interpretable. Migrating historical responses after a rename is your
responsibility in v1 (BRD §5.3).

## Development

TypeScript packages (npm workspaces at the repo root):

```bash
npm install
npm run build            # renderer (tsc + single-file bundle), react, angular wrappers
npm test                 # rule-engine conformance fixtures + renderer component tests
```

Editor (own package.json, depends on the built renderer package):

```bash
cd editor && npm install && npx ng serve   # http://localhost:4200, backend at :8080
```

Backend:

```bash
cd backend && ./mvnw spring-boot:run       # needs Java 21; Mongo at localhost:27017
./mvnw test                                # integration tests on embedded MongoDB
```

The rule engine's semantics are pinned by `shared/rule-fixtures/*.json` — the
TypeScript suite loads them, and a future server-side (Java) engine must pass
the same files. To add a question type, see
[docs/adding-a-question-type.md](docs/adding-a-question-type.md).

## Limitations & roadmap

Declared plainly so they read as roadmap, not surprises:

1. **Bot/spam submissions** — public endpoints are rate-limited and
   origin-checked but have **no CAPTCHA or proof-of-work**. Self-hosted
   single-tenant deployments are a modest target; a pluggable challenge is a
   fast-follow candidate.
2. **Response retention** — `IN_PROGRESS` responses accumulate indefinitely
   (orphaned *files* are collected hourly; the answer documents are not). A
   retention setting is roadmapped. Until then, a Mongo one-liner covers it,
   e.g. delete abandoned drafts older than 90 days:

   ```bash
   docker compose exec mongo mongosh forms_engine --eval \
     'db.responses.deleteMany({status:"IN_PROGRESS",updatedAt:{$lt:new Date(Date.now()-90*864e5)}})'
   ```
3. **Editor undo** — destructive editor actions rely on confirmation dialogs
   and version restore, not undo.
4. **Multi-language questionnaires** — the `labels` override localizes the
   renderer's chrome only; question content is single-language per
   questionnaire.
5. **Analytics** — raw browse + CSV export only at launch; a drop-off /
   analytics tab is the planned first post-launch release.
6. **Webhooks, server-side rule re-validation, resume across browser
   restarts** — roadmapped (the rule-engine conformance fixtures and the
   sessionStorage design respectively keep the doors open).
7. **Honor-system deduplication** — `ONE_PER_REF` deduplicates cooperative
   users; anyone editing the page can change the ref. Not suitable for
   contests, votes, or any adversarial setting until signed references exist.
8. **Completion-status enumeration** — `ref-status` exposes completed-yes/no
   per reference (rate-limited, boolean-only). Use opaque random refs where
   that boolean is sensitive.
9. **No cross-device resume** — deliberate: with plain (unsigned) refs, a
   guessable reference must never unlock a session. Arrives with signed
   references.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). In short:
comment on the issue before opening a pull request, keep changes small and
tested, and every pull request needs a human author who can discuss it in
review (pull requests from autonomous agents are closed without review).

## AI Disclaimer

I designed and specified Forms-Engine, and used [Claude Code](https://claude.com/claude-code) to write much of the implementation from those specs. Design decisions, code review, and maintenance are mine.

## License

[MIT](LICENSE). No telemetry, no phone-home.
