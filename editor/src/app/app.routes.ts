import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/list/questionnaire-list.page').then((m) => m.QuestionnaireListPage),
  },
  {
    path: 'q/:id',
    loadComponent: () =>
      import('./features/workspace/workspace.page').then((m) => m.WorkspacePage),
  },
  {
    path: 'q/:id/responses',
    loadComponent: () =>
      import('./features/responses/responses.page').then((m) => m.ResponsesPage),
  },
  { path: '**', redirectTo: '' },
];
