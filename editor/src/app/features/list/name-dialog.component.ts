import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface NameDialogData {
  title: string;
  label: string;
  confirmLabel: string;
  initial?: string;
}

/** Shared name prompt for create / rename (FR-E-1/2). */
@Component({
  selector: 'app-name-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" style="width: 100%; margin-top: 8px;">
        <mat-label>{{ data.label }}</mat-label>
        <input matInput [(ngModel)]="value" (keyup.enter)="submit()" cdkFocusInitial />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancel</button>
      <button matButton="filled" [disabled]="!value.trim()" (click)="submit()">
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
})
export class NameDialogComponent {
  protected readonly data = inject<NameDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<NameDialogComponent>);
  protected value = this.data.initial ?? '';

  protected submit(): void {
    const name = this.value.trim();
    if (name) {
      this.ref.close(name);
    }
  }
}
