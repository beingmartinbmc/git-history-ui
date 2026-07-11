import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { UiStateService } from '../../services/ui-state.service';
import { ShortcutsModalComponent } from './shortcuts-modal.component';

describe('ShortcutsModalComponent', () => {
  let fixture: ComponentFixture<ShortcutsModalComponent>;
  let component: ShortcutsModalComponent;
  let state: UiStateService;
  let trigger: HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShortcutsModalComponent],
    }).compileComponents();

    state = TestBed.inject(UiStateService);
    trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    fixture = TestBed.createComponent(ShortcutsModalComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => trigger.remove());

  it('traps initial focus in a named dialog and restores the trigger on Escape', fakeAsync(() => {
    state.shortcutsOpen.set(true);
    fixture.detectChanges();
    flushMicrotasks();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const close = fixture.nativeElement.querySelector('[aria-label="Close keyboard shortcuts"]');
    expect(dialog.getAttribute('aria-labelledby')).toBe('shortcuts-title');
    expect(document.activeElement).toBe(close);

    component.onKey(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    flushMicrotasks();

    expect(state.shortcutsOpen()).toBeFalse();
    expect(document.activeElement).toBe(trigger);
  }));
});
