/**
 * Editor-side half of the question-type registry (BRD §5.4, NFR-6): per type,
 * the Add/Edit-Question config panel and the inert canvas preview. Adding a
 * new question type to the editor = one registerEditorQuestionType call (see
 * docs/adding-a-question-type.md); nothing in the modal, canvas, or store
 * changes.
 *
 * Panel components implement inputs { config, onChange }; preview components
 * implement input { question } — both instantiated via NgComponentOutlet.
 */
import type { Type } from '@angular/core';
import { getQuestionType } from '@forms-engine/renderer/core';
import { AddressConfigComponent, AddressPreviewComponent } from './address-type';
import {
  CheckboxConfigComponent,
  CheckboxPreviewComponent,
  DropdownConfigComponent,
  DropdownPreviewComponent,
} from './choice-types';
import { DateConfigComponent, DatePreviewComponent } from './date-type';
import { DisplayBlockConfigComponent, DisplayBlockPreviewComponent } from './display-block-type';
import { NumberConfigComponent, NumberPreviewComponent } from './number-type';
import { RadioConfigComponent, RadioPreviewComponent } from './radio-type';
import { EmailPreviewComponent, NoConfigComponent, PhonePreviewComponent } from './simple-text-types';
import { TextBoxConfigComponent, TextBoxPreviewComponent } from './text-box-type';
import { ToggleConfigComponent, TogglePreviewComponent } from './toggle-type';
import { FileUploadConfigComponent, FileUploadPreviewComponent } from './upload-type';

export interface EditorQuestionType {
  type: string;
  label: string;
  panel: Type<unknown>;
  preview: Type<unknown>;
  defaultConfig(): Record<string, unknown>;
  /** Human-readable config problems blocking the modal's Save (FR-E-7). */
  validateConfig(config: Record<string, unknown>): string[];
}

const registry = new Map<string, EditorQuestionType>();

export function registerEditorQuestionType(entry: EditorQuestionType): void {
  registry.set(entry.type, entry);
}

export function getEditorQuestionType(type: string): EditorQuestionType | undefined {
  return registry.get(type);
}

export function listEditorQuestionTypes(): EditorQuestionType[] {
  return [...registry.values()];
}

function coreDelegate(type: string): Pick<EditorQuestionType, 'defaultConfig' | 'validateConfig'> {
  return {
    defaultConfig: () => getQuestionType(type)?.defaultConfig() ?? {},
    validateConfig: (config) => getQuestionType(type)?.validateConfig(config) ?? [],
  };
}

registerEditorQuestionType({
  type: 'TEXT_BOX',
  label: 'Text Box',
  panel: TextBoxConfigComponent,
  preview: TextBoxPreviewComponent,
  ...coreDelegate('TEXT_BOX'),
});

registerEditorQuestionType({
  type: 'RADIO',
  label: 'Radio',
  panel: RadioConfigComponent,
  preview: RadioPreviewComponent,
  ...coreDelegate('RADIO'),
});

registerEditorQuestionType({
  type: 'CHECKBOX',
  label: 'Checkboxes',
  panel: CheckboxConfigComponent,
  preview: CheckboxPreviewComponent,
  ...coreDelegate('CHECKBOX'),
});

registerEditorQuestionType({
  type: 'DROPDOWN',
  label: 'Dropdown',
  panel: DropdownConfigComponent,
  preview: DropdownPreviewComponent,
  ...coreDelegate('DROPDOWN'),
});

registerEditorQuestionType({
  type: 'DATE',
  label: 'Date',
  panel: DateConfigComponent,
  preview: DatePreviewComponent,
  ...coreDelegate('DATE'),
});

registerEditorQuestionType({
  type: 'NUMBER',
  label: 'Number',
  panel: NumberConfigComponent,
  preview: NumberPreviewComponent,
  ...coreDelegate('NUMBER'),
});

registerEditorQuestionType({
  type: 'EMAIL',
  label: 'Email',
  panel: NoConfigComponent,
  preview: EmailPreviewComponent,
  ...coreDelegate('EMAIL'),
});

registerEditorQuestionType({
  type: 'PHONE',
  label: 'Phone',
  panel: NoConfigComponent,
  preview: PhonePreviewComponent,
  ...coreDelegate('PHONE'),
});

registerEditorQuestionType({
  type: 'TOGGLE',
  label: 'Toggle (Yes/No)',
  panel: ToggleConfigComponent,
  preview: TogglePreviewComponent,
  ...coreDelegate('TOGGLE'),
});

registerEditorQuestionType({
  type: 'ADDRESS',
  label: 'Address',
  panel: AddressConfigComponent,
  preview: AddressPreviewComponent,
  ...coreDelegate('ADDRESS'),
});

registerEditorQuestionType({
  type: 'FILE_UPLOAD',
  label: 'File upload',
  panel: FileUploadConfigComponent,
  preview: FileUploadPreviewComponent,
  ...coreDelegate('FILE_UPLOAD'),
});

registerEditorQuestionType({
  type: 'DISPLAY_BLOCK',
  label: 'Display text',
  panel: DisplayBlockConfigComponent,
  preview: DisplayBlockPreviewComponent,
  ...coreDelegate('DISPLAY_BLOCK'),
});
