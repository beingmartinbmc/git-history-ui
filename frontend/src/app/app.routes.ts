import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/home-shell/home-shell.component').then((m) => m.HomeShellComponent),
    pathMatch: 'full',
  },
  {
    path: 'timeline',
    loadComponent: () =>
      import('./components/timeline/timeline.component').then((m) => m.TimelineComponent),
  },
  {
    path: 'file/:path',
    loadComponent: () =>
      import('./components/file-history/file-history.component').then(
        (m) => m.FileHistoryComponent,
      ),
  },
  {
    path: 'insights',
    loadComponent: () =>
      import('./components/insights/insights.component').then((m) => m.InsightsComponent),
  },
  {
    path: 'wrapped',
    loadComponent: () =>
      import('./components/wrapped/wrapped.component').then((m) => m.WrappedComponent),
  },
  {
    path: 'compare',
    loadComponent: () =>
      import('./components/branch-compare/branch-compare.component').then(
        (m) => m.BranchCompareComponent,
      ),
  },
  {
    path: 'stash',
    loadComponent: () =>
      import('./components/stash-reflog/stash-reflog.component').then(
        (m) => m.StashReflogComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
