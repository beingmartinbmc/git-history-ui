import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommitDetailComponent } from '../commit-detail/commit-detail.component';
import { CommitGraphComponent } from '../commit-graph/commit-graph.component';
import { CommitListComponent } from '../commit-list/commit-list.component';
import { GroupedListComponent } from '../grouped-list/grouped-list.component';
import { UiStateService } from '../../services/ui-state.service';

@Component({
  selector: 'app-home-shell',
  standalone: true,
  imports: [CommonModule, CommitGraphComponent, CommitListComponent, CommitDetailComponent, GroupedListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="layout">
      <aside class="pane graph"><app-commit-graph /></aside>
      <section class="pane list">
        <ng-container *ngIf="state.viewMode() === 'grouped'; else flat">
          <app-grouped-list />
        </ng-container>
        <ng-template #flat><app-commit-list /></ng-template>
      </section>
      <section class="pane detail"><app-commit-detail /></section>
    </main>
  `,
  styles: [`
    :host { display: block; flex: 1; min-height: 0; }
    .layout {
      height: 100%;
      display: grid;
      grid-template-columns: 220px 380px 1fr;
      min-height: 0;
    }
    .pane { min-width: 0; min-height: 0; overflow: hidden; }
    .pane.graph { border-right: 1px solid var(--border-soft); }
    @media (max-width: 1100px) {
      .layout { grid-template-columns: 320px 1fr; }
      .pane.graph { display: none; }
    }
    @media (max-width: 720px) {
      .layout { grid-template-columns: 1fr; }
      .pane.list { display: none; }
    }
  `]
})
export class HomeShellComponent {
  state = inject(UiStateService);
}
