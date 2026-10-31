import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { DiffFile } from '../../models/git.models';
import { InsightsService } from '../../services/insights.service';
import { DiffViewerComponent } from './diff-viewer.component';

describe('DiffViewerComponent', () => {
  const summaries = new Subject<{ summary: string; provider: string }>();

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DiffViewerComponent],
      providers: [{ provide: InsightsService, useValue: { summarizeDiff: () => summaries } }],
    });
  });

  function create(file: DiffFile | null) {
    const fixture = TestBed.createComponent(DiffViewerComponent);
    fixture.componentInstance.fileInput = file;
    fixture.detectChanges();
    return fixture;
  }

  it('drops the in-flight summarize request when the file changes or the view is destroyed', () => {
    const fixture = create(diffFile('@@ -1 +1 @@\n-a\n+b'));
    fixture.componentInstance.onSummarize();
    expect(summaries.observers.length).toBe(1);

    fixture.componentInstance.fileInput = diffFile('@@ -1 +1 @@\n-c\n+d');
    expect(summaries.observers.length).toBe(0);
    expect(fixture.componentInstance.summarizing()).toBeFalse();

    fixture.componentInstance.onSummarize();
    fixture.destroy();
    expect(summaries.observers.length).toBe(0);
  });

  it('streams large diffs in geometrically growing batches', () => {
    const queue: IdleRequestCallback[] = [];
    spyOn(window, 'requestIdleCallback').and.callFake((cb: IdleRequestCallback) => {
      queue.push(cb);
      return queue.length;
    });
    const body = Array.from({ length: 11999 }, (_, i) => `+line ${i}`).join('\n');
    const fixture = create(diffFile(`@@ -0,0 +1,11999 @@\n${body}`));
    const sizes: number[] = [];
    while (queue.length) {
      queue.shift()!({} as IdleDeadline);
      sizes.push(fixture.componentInstance.parsed().length);
    }
    expect(sizes).toEqual([2000, 6000, 12000]);
    fixture.destroy();
  });

  it('keeps the CSS line-height equal to the virtual-scroll item size', () => {
    const fixture = create(diffFile('@@ -1 +1 @@\n-a\n+b'));
    const viewport = fixture.nativeElement.querySelector('.virtual-pre') as HTMLElement;
    expect(getComputedStyle(viewport).lineHeight).toBe('19px');
  });

  function diffFile(changes: string): DiffFile {
    return { file: 'a.ts', status: 'modified', additions: 1, deletions: 1, changes };
  }
});
