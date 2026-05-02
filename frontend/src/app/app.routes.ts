import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/home-shell/home-shell.component').then((m) => m.HomeShellComponent),
    pathMatch: 'full'
  },
  {
    path: 'timeline',
    loadComponent: () =>
      import('./components/timeline/timeline.component').then((m) => m.TimelineComponent)
  },
  {
    path: 'file/:path',
    loadComponent: () =>
      import('./components/file-history/file-history.component').then((m) => m.FileHistoryComponent)
  },
  {
    path: 'insights',
    loadComponent: () =>
      import('./components/insights/insights.component').then((m) => m.InsightsComponent)
  },
  { path: '**', redirectTo: '' }
];
