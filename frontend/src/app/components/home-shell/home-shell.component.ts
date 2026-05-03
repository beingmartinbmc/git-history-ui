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
  imports: [
    CommonModule,
    CommitGraphComponent,
    CommitListComponent,
    CommitDetailComponent,
    GroupedListComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="layout">
      <aside class="pane graph">
        <app-commit-graph />
      </aside>
      <section class="pane list">
        <div class="pane-shell">
          <ng-container *ngIf="state.viewMode() === 'grouped'; else flat">
            <app-grouped-list />
          </ng-container>
          <ng-template #flat><app-commit-list /></ng-template>
        </div>
      </section>
      <section class="pane detail">
        <div class="pane-shell detail-shell">
          <app-commit-detail />
        </div>
      </section>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        flex: 1;
        min-height: 0;
      }
      .layout {
        height: 100%;
        display: grid;
        grid-template-columns: minmax(240px, 320px) minmax(340px, 430px) minmax(0, 1fr);
        gap: 0.75rem;
        padding: 0.75rem;
        min-height: 0;
        background: transparent;
      }
      .pane {
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        border-radius: var(--radius-lg);
        background: var(--bg-panel);
        border: 1px solid color-mix(in oklab, var(--border-soft) 86%, transparent);
        box-shadow: var(--shadow-md);
      }
      .pane.graph {
        background: color-mix(in oklab, var(--bg-panel) 86%, transparent);
      }
      .pane-shell {
        height: 100%;
        min-height: 0;
        overflow: hidden;
        border-radius: inherit;
      }
      .detail-shell {
        background: color-mix(in oklab, var(--bg-surface) 82%, transparent);
      }
      @media (max-width: 1100px) {
        .layout {
          grid-template-columns: 320px 1fr;
        }
        .pane.graph {
          display: none;
        }
      }
      @media (max-width: 720px) {
        .layout {
          grid-template-columns: 1fr;
        }
        .pane.list {
          display: none;
        }
      }
    `,
  ],
})
export class HomeShellComponent {
  state = inject(UiStateService);
}
