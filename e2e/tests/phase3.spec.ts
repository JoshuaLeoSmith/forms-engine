/**
 * Phase-3 acceptance walkthrough (Phase-3 BRD §9). Requires the compose
 * stack (editor :8081, backend :8080, MinIO storage — the shipped default).
 * §9.7 (filesystem-mode flip) and §9.8 (real S3/R2) are covered by the
 * backend integration suite, which runs the full rejection gauntlet against a
 * filesystem backend and a MinIO testcontainer; the in-flight-upload
 * navigation block (FR3-18) is timing-sensitive and covered deterministically
 * by renderer component tests.
 */
import { expect, test, type Page } from '@playwright/test';
import { openExample } from './plain-html-example';

const BACKEND = process.env['BACKEND_URL'] ?? 'http://localhost:8080';

const NAME = `Phase3 Intake ${Date.now()}`;

const ALWAYS = { mode: 'ALWAYS' };
const NEVER = { mode: 'NEVER' };
const when = (questionCode: string, operator: string, value: unknown) => ({
  mode: 'CONDITIONAL',
  rule: { combinator: 'ALL', conditions: [{ source: 'QUESTION', questionCode, operator, value }] },
});

const q = (code: string, type: string, prompt: string, typeConfig: object, extra: object = {}) => ({
  id: `id-${code}`,
  code,
  sectionTitle: '',
  prompt,
  type,
  width: 'DEFAULT',
  typeConfig,
  visibility: ALWAYS,
  requirement: NEVER,
  ...extra,
});

const definition = {
  schemaVersion: 2,
  steps: [
    {
      id: 'step-1',
      title: 'Documents',
      visibility: ALWAYS,
      requirement: NEVER,
      tabs: [],
      questions: [
        q('resume', 'FILE_UPLOAD', 'Upload your resume', {
          allowedCategories: ['DOCUMENTS'], maxFiles: 2, maxFileSizeMb: 10, helperText: 'PDF preferred, 10 MB max',
        }, { sectionTitle: 'Required documents', requirement: ALWAYS }),
        q('notesFile', 'FILE_UPLOAD', 'Optional notes file', {
          allowedCategories: ['TEXT'], maxFiles: 1, maxFileSizeMb: 5, helperText: '',
        }, { sectionTitle: 'Extras' }),
        q('showMore', 'TOGGLE', 'Attach a cover letter?', { trueLabel: 'Yes', falseLabel: 'No' }, {
          sectionTitle: 'Extras',
        }),
        q('coverLetter', 'FILE_UPLOAD', 'Cover letter', {
          allowedCategories: ['DOCUMENTS'], maxFiles: 1, maxFileSizeMb: 10, helperText: '',
        }, { sectionTitle: 'Extras', visibility: when('showMore', 'EQUALS', true) }),
      ],
    },
    {
      id: 'step-2',
      title: 'Wrap up',
      visibility: ALWAYS,
      requirement: NEVER,
      tabs: [],
      questions: [q('finalNotes', 'TEXT_BOX', 'anything else?', { size: 'MEDIUM', maxLength: null })],
    },
  ],
  tabs: [],
  questions: [],
};

const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\nxref\n0 3\ntrailer<</Size 3/Root 1 0 R>>\n%%EOF\n',
);
const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: PDF_BYTES });

/** A zip that lies about being a PDF — must be rejected server-side (§9.3). */
const ZIP_AS_PDF = {
  name: 'report.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('PK\x03\x04fake-zip-content-for-mismatch-check', 'binary'),
};

/** HTML masquerading as a text file — content sniff must reject it (§9.3). */
const HTML_AS_TXT = {
  name: 'notes.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from('<html><body><script>alert(1)</script></body></html>'),
};

const uploadInput = (page: Page, code: string) =>
  page.locator(`forms-engine [data-code="${code}"] input[type="file"]`);
const uploadRoot = (page: Page, code: string) => page.locator(`forms-engine [data-code="${code}"]`);

test.describe.serial('Phase-3 acceptance walkthrough (§9)', () => {
  let questionnaireId: string;
  let publicId: string;
  let responseId: string;
  const fileIds: Record<string, string> = {};

  test('1. editor: FILE_UPLOAD config panel, inert preview, rule-builder exclusion', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New questionnaire' }).click();
    await page.getByRole('dialog').getByLabel('Name').fill(NAME);
    await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
    await page.waitForURL(/\/q\//);
    questionnaireId = page.url().split('/q/')[1];

    // FR3-15: category checkboxes, maxFiles, size input with the system cap shown.
    await page.getByRole('button', { name: 'Add question' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Unique Question Code').fill('resume');
    await dialog.getByLabel('Prompt').fill('Upload your resume');
    await dialog.getByLabel('Question Type').click();
    await page.getByRole('option', { name: 'File upload' }).click();
    await expect(dialog.getByRole('checkbox', { name: /Documents \(PDF/ })).toBeChecked();
    await expect(dialog.getByText(/System cap: \d+ MB/)).toBeVisible();
    await dialog.getByLabel('Max files').fill('2');
    await dialog.getByLabel('Helper text (optional)').fill('PDF preferred, 10 MB max');
    await dialog.getByRole('button', { name: 'Add question' }).click();
    await expect(dialog).toBeHidden();

    // FR3-16: inert dropzone preview with the constraint summary.
    await expect(page.getByText('PDF, DOC, DOCX · up to 2 files · 10 MB each')).toBeVisible();
    await expect(page.getByText('PDF preferred, 10 MB max')).toBeVisible();

    // P3-D6: a FILE_UPLOAD question is not offered as a rule target.
    await page.getByRole('button', { name: 'Add question' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Unique Question Code').fill('depends');
    await dialog.getByLabel('Prompt').fill('depends on something');
    const vis = dialog.locator('app-rule-builder[aspect="visibility"]');
    await vis.getByRole('checkbox', { name: 'Always visible' }).uncheck();
    await vis.getByRole('button', { name: 'Add condition' }).click();
    await vis.getByLabel('Question', { exact: true }).click();
    await expect(page.getByRole('option', { name: 'resume' })).toBeHidden();
    await page.keyboard.press('Escape'); // close the (empty) target dropdown
    await page.keyboard.press('Escape'); // discard the half-built question dialog
    await expect(dialog).toBeHidden();
  });

  test('2. draft-replace with the §9 definition, publish v1', async () => {
    const put = await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(definition),
    });
    expect(put.ok).toBeTruthy();
    const publish = await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'phase-3 walkthrough' }),
    });
    expect(publish.ok).toBeTruthy();
    const detail = await (await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}`)).json();
    publicId = detail.publicId;
    expect(detail.currentVersion).toBe(1);
  });

  test('3. respondent: upload flow, server rejections, maxFiles, removal, rule-driven clearing', async ({ page }) => {
    await openExample(page, publicId);
    const engine = page.locator('forms-engine');
    await expect(engine.getByText('Upload your resume')).toBeVisible();

    // Gating: required upload blocks Next while empty (FR3-18).
    await engine.getByRole('button', { name: 'Next' }).click();
    await expect(engine.getByText('This question is required.')).toBeVisible();

    // Happy path (§9.2): PDF uploads immediately on selection; a response is
    // created before the transfer (FR3-8); a row with name + size appears.
    const uploadResponse = page.waitForResponse(
      (r) => r.url().includes('/files') && r.request().method() === 'POST',
    );
    const createResponse = page.waitForResponse(
      (r) => r.url().endsWith('/responses') && r.request().method() === 'POST',
    );
    await uploadInput(page, 'resume').setInputFiles(pdf('Josh_Resume.pdf'));
    responseId = ((await (await createResponse).json()) as { responseId: string }).responseId;
    const ref = (await (await uploadResponse).json()) as { fileId: string };
    fileIds['resume1'] = ref.fileId;
    await expect(uploadRoot(page, 'resume').getByText('Josh_Resume.pdf')).toBeVisible();

    // §9.3 rejections with correct inline errors and no answer entry:
    // a zip renamed .pdf (content/extension mismatch)…
    await uploadInput(page, 'resume').setInputFiles(ZIP_AS_PDF);
    await expect(uploadRoot(page, 'resume').getByRole('button', { name: 'Retry' })).toBeVisible();
    await uploadRoot(page, 'resume').getByRole('button', { name: /Dismiss report.pdf/ }).click();
    // …and HTML masquerading as .txt (content sniff).
    await uploadInput(page, 'notesFile').setInputFiles(HTML_AS_TXT);
    await expect(uploadRoot(page, 'notesFile').getByRole('button', { name: 'Retry' })).toBeVisible();
    await uploadRoot(page, 'notesFile').getByRole('button', { name: /Dismiss notes.txt/ }).click();
    // Client pre-check: a disallowed extension never even transmits (FR3-17).
    await uploadInput(page, 'resume').setInputFiles({
      name: 'script.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZfake'),
    });
    await expect(uploadRoot(page, 'resume').getByText(/isn't accepted/)).toBeVisible();
    await uploadRoot(page, 'resume').getByRole('button', { name: /Dismiss script.exe/ }).click();

    // §9.4: second PDF reaches maxFiles → dropzone disables…
    const second = page.waitForResponse((r) => r.url().includes('/files') && r.request().method() === 'POST');
    await uploadInput(page, 'resume').setInputFiles(pdf('Addendum.pdf'));
    fileIds['resume2'] = ((await (await second).json()) as { fileId: string }).fileId;
    await expect(uploadRoot(page, 'resume').getByText('File limit reached')).toBeVisible();
    // …then removing one (×) frees the slot again.
    await uploadRoot(page, 'resume').getByRole('button', { name: 'Remove Addendum.pdf' }).click();
    await expect(uploadRoot(page, 'resume').getByText('Addendum.pdf')).toBeHidden();
    await expect(uploadRoot(page, 'resume').getByText('Drag & drop or click to browse')).toBeVisible();

    // §9.5: rule-driven hiding clears the answer and best-effort-deletes files.
    await uploadRoot(page, 'showMore').getByRole('button', { name: 'Yes' }).click();
    const cover = page.waitForResponse((r) => r.url().includes('/files') && r.request().method() === 'POST');
    await uploadInput(page, 'coverLetter').setInputFiles(pdf('Cover_Letter.pdf'));
    fileIds['cover'] = ((await (await cover).json()) as { fileId: string }).fileId;
    await expect(uploadRoot(page, 'coverLetter').getByText('Cover_Letter.pdf')).toBeVisible();
    const coverDelete = page.waitForResponse(
      (r) => r.url().includes(`/files/${fileIds['cover']}`) && r.request().method() === 'DELETE',
    );
    await page.locator('forms-engine [data-code="showMore"]').getByRole('button', { name: 'No' }).click();
    expect((await coverDelete).status()).toBeLessThan(300);
    await expect(page.locator('forms-engine [data-code="coverLetter"]')).toBeHidden();

    // §9.6 (first half): finish the response.
    await engine.getByRole('button', { name: 'Next' }).click();
    await engine.getByRole('button', { name: 'Finish' }).click();
    await expect(engine.getByText('Thank you!')).toBeVisible();
  });

  test('4. stored shapes, completion lock, management download, tombstones', async () => {
    // FR3-9: the answer is an array of exactly-four-key reference objects.
    const exportPage = await (
      await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}/responses`)
    ).json();
    const stored = exportPage.items.find((r: { responseId: string }) => r.responseId === responseId);
    expect(stored.status).toBe('COMPLETED');
    expect(stored.answers.resume).toHaveLength(1);
    expect(stored.answers.resume[0]).toEqual({
      fileId: fileIds['resume1'],
      fileName: 'Josh_Resume.pdf',
      size: expect.any(Number),
      contentType: 'application/pdf',
    });
    expect(stored.answers.coverLetter).toBeUndefined();

    // §9.6: upload/delete on a completed response are rejected.
    const form = new FormData();
    form.append('questionCode', 'resume');
    form.append('file', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'late.pdf');
    const lateUpload = await fetch(`${BACKEND}/public/v1/responses/${responseId}/files`, {
      method: 'POST',
      body: form,
    });
    expect(lateUpload.status).toBe(409);
    const lateDelete = await fetch(
      `${BACKEND}/public/v1/responses/${responseId}/files/${fileIds['resume1']}`,
      { method: 'DELETE' },
    );
    expect(lateDelete.status).toBe(409);

    // FR3-23: management download streams as attachment with nosniff and the
    // verified content type; removed/cleared files 404 (tombstoned).
    const download = await fetch(
      `${BACKEND}/api/v1/questionnaires/${questionnaireId}/responses/${responseId}/files/${fileIds['resume1']}`,
    );
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toContain('attachment');
    expect(download.headers.get('content-disposition')).toContain('Josh_Resume.pdf');
    expect(download.headers.get('x-content-type-options')).toBe('nosniff');
    expect(download.headers.get('content-type')).toContain('application/pdf');
    expect(Buffer.from(await download.arrayBuffer()).equals(PDF_BYTES)).toBeTruthy();

    for (const gone of [fileIds['resume2'], fileIds['cover']]) {
      const res = await fetch(
        `${BACKEND}/api/v1/questionnaires/${questionnaireId}/responses/${responseId}/files/${gone}`,
      );
      expect(res.status).toBe(404);
    }

    // FR3-13: the deletion dialog's numbers come from the file-stats endpoint.
    const stats = await (
      await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}/files/stats`)
    ).json();
    expect(stats.fileCount).toBeGreaterThanOrEqual(1);
    expect(stats.totalBytes).toBeGreaterThan(0);
  });
});
