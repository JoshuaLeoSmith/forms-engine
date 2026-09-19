import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import type { QuestionnaireDetail } from '../../core/models';
import { EmbedDialogComponent } from './embed-dialog.component';

const detail = {
  id: 'questionnaire-1',
  name: 'Example',
  publicId: 'public-1',
  allowedOrigins: [],
  submissionPolicy: 'MULTIPLE',
} as unknown as QuestionnaireDetail;

describe('EmbedDialogComponent clipboard feedback', () => {
  const snackBar = { open: vi.fn() };

  beforeEach(() => {
    snackBar.open.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { detail } },
        { provide: MatDialogRef, useValue: {} },
        { provide: ApiService, useValue: {} },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });
  });

  it('shows visible feedback when the Clipboard API is unavailable', () => {
    const component = TestBed.runInInjectionContext(() => new EmbedDialogComponent());
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });

    try {
      (component as unknown as { copy(code: string): void }).copy('snippet');
    } finally {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      });
    }

    expect(snackBar.open).toHaveBeenCalledWith('Clipboard access is unavailable', 'Dismiss');
  });

  it('keeps the success feedback when copying succeeds', async () => {
    const component = TestBed.runInInjectionContext(() => new EmbedDialogComponent());
    const originalClipboard = navigator.clipboard;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    try {
      (component as unknown as { copy(code: string): void }).copy('snippet');
      await Promise.resolve();
    } finally {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      });
    }

    expect(writeText).toHaveBeenCalledWith('snippet');
    expect(snackBar.open).toHaveBeenCalledWith('Copied to clipboard', undefined, {
      duration: 1500,
    });
  });

  it('shows an error when the Clipboard API rejects the copy', async () => {
    const component = TestBed.runInInjectionContext(() => new EmbedDialogComponent());
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    try {
      (component as unknown as { copy(code: string): void }).copy('snippet');
      await Promise.resolve();
    } finally {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      });
    }

    expect(snackBar.open).toHaveBeenCalledWith('Could not copy to clipboard', 'Dismiss');
  });
});
