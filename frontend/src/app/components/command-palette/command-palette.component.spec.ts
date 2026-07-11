import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { Commit } from '../../models/git.models';
import { UiStateService } from '../../services/ui-state.service';
import { CommandPaletteComponent } from './command-palette.component';

describe('CommandPaletteComponent', () => {
  let fixture: ComponentFixture<CommandPaletteComponent>;
  let component: CommandPaletteComponent;
  let state: UiStateService;
  let trigger: HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommandPaletteComponent],
    }).compileComponents();

    state = TestBed.inject(UiStateService);
    state.commits.set([commit('a111111'), commit('b222222')]);
    trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    fixture = TestBed.createComponent(CommandPaletteComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => trigger.remove());

  it('has dialog/listbox semantics, focuses search, and restores its trigger', fakeAsync(() => {
    state.paletteOpen.set(true);
    fixture.detectChanges();
    flushMicrotasks();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const options = fixture.nativeElement.querySelectorAll('[role="option"]');
    expect(dialog.getAttribute('aria-labelledby')).toBe('palette-title');
    expect(input.getAttribute('role')).toBe('combobox');
    expect(document.activeElement).toBe(input);
    expect(options.length).toBe(2);
    expect(options[0].getAttribute('aria-selected')).toBe('true');

    component.onKey(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    flushMicrotasks();

    expect(state.paletteOpen()).toBeFalse();
    expect(document.activeElement).toBe(trigger);
  }));

  it('ignores the global shortcut while typing', () => {
    const input = document.createElement('input');
    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    Object.defineProperty(event, 'target', { value: input });
    component.onGlobal(event);
    expect(state.paletteOpen()).toBeFalse();
  });
});

function commit(hash: string): Commit {
  return {
    hash,
    shortHash: hash,
    author: 'Ada',
    authorEmail: 'ada@example.com',
    date: '2026-01-01T00:00:00Z',
    message: hash,
    subject: hash,
    body: '',
    parents: [],
    branches: [],
    tags: [],
    isMerge: false,
  };
}
