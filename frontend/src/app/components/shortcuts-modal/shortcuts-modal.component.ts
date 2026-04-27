import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject
} from '@angular/core';
import { UiStateService } from '../../services/ui-state.service';

interface Binding {
  keys: string[];
  description: string;
}

const GROUPS: { title: string; bindings: Binding[] }[] = [
  {
    title: 'Navigation',
    bindings: [
      { keys: ['j'], description: 'Next commit' },
      { keys: ['k'], description: 'Previous commit' },
      { keys: ['g'], description: 'Jump to newest commit' },
      { keys: ['G'], description: 'Jump to oldest commit' }
    ]
  },
  {
    title: 'Search & overlays',
    bindings: [
      { keys: ['/'], description: 'Focus search' },
      { keys: ['⌘', 'K'], description: 'Open command palette' },
      { keys: ['?'], description: 'Show this help' },
      { keys: ['Esc'], description: 'Close overlays' }
    ]
  }
];

@Component({
  selector: 'app-shortcuts-modal',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="state.shortcutsOpen()">
      <div class="backdrop" (click)="close()"></div>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <div class="head">
          <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          <button class="btn btn-ghost btn-icon" (click)="close()" aria-label="Close">✕</button>
        </div>
        <div class="body">
          <section *ngFor="let g of groups">
            <h3>{{ g.title }}</h3>
            <ul>
              <li *ngFor="let b of g.bindings">
                <span class="desc">{{ b.description }}</span>
                <span class="keys">
                  <kbd class="kbd" *ngFor="let k of b.keys">{{ k }}</kbd>
                </span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </ng-container>
  `,
  styles: [`
    .backdrop {
      position: fixed; inset: 0;
      background: var(--bg-overlay);
      backdrop-filter: blur(2px);
      z-index: 90;
    }
    .modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: min(560px, calc(100vw - 32px));
      max-height: 80vh;
      overflow: auto;
      background: var(--bg-elevated);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      z-index: 100;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border-soft);
    }
    .head h2 { margin: 0; font-size: 16px; }
    .body { padding: 0.75rem 1rem 1rem; }
    h3 { margin: 1rem 0 0.4rem; font-size: 12px; color: var(--fg-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    h3:first-child { margin-top: 0; }
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.45rem 0.25rem;
      border-bottom: 1px dashed var(--border-soft);
    }
    li:last-child { border-bottom: 0; }
    .desc { color: var(--fg-secondary); font-size: 13px; }
    .keys { display: flex; gap: 4px; }
  `]
})
export class ShortcutsModalComponent {
  state = inject(UiStateService);
  groups = GROUPS;

  close() {
    this.state.shortcutsOpen.set(false);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(ev: KeyboardEvent) {
    if (ev.key === '?' && !this.isTyping(ev.target)) {
      ev.preventDefault();
      this.state.shortcutsOpen.set(true);
    }
    if (ev.key === 'Escape') {
      this.state.shortcutsOpen.set(false);
      this.state.paletteOpen.set(false);
    }
  }

  private isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
      target.isContentEditable;
  }
}
