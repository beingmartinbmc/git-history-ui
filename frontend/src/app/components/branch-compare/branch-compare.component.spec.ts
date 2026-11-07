import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { DiffFile, DiffFileMeta, DiffFilesResponse } from '../../models/git.models';
import { GitService } from '../../services/git.service';
import { UiStateService } from '../../services/ui-state.service';
import { BranchCompareComponent } from './branch-compare.component';

describe('BranchCompareComponent', () => {
  let fixture: ComponentFixture<BranchCompareComponent>;
  let component: BranchCompareComponent;
  let git: {
    getRangeDiffFiles: jasmine.Spy;
    getRangeDiffFile: jasmine.Spy;
    createPortableLink: jasmine.Spy;
    getRangeReportMarkdown: jasmine.Spy;
  };
  let state: UiStateService;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    git = {
      getRangeDiffFiles: jasmine.createSpy('getRangeDiffFiles').and.returnValue(of(listing())),
      getRangeDiffFile: jasmine
        .createSpy('getRangeDiffFile')
        .and.callFake((_from: string, _to: string, path: string) => of(diff(path))),
      createPortableLink: jasmine
        .createSpy('createPortableLink')
        .and.returnValue(of({ url: 'git-history-ui://open', expiresAt: null, mode: 'portable' })),
      getRangeReportMarkdown: jasmine
        .createSpy('getRangeReportMarkdown')
        .and.returnValue(of('# report')),
    };
    params = new BehaviorSubject(convertToParamMap({}));

    await TestBed.configureTestingModule({
      imports: [BranchCompareComponent],
      providers: [
        { provide: GitService, useValue: git },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: params.asObservable(),
            snapshot: { queryParamMap: params.value },
          },
        },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BranchCompareComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(UiStateService);
    state.branches.set(['main']);
    state.tags.set(['v1.0.0']);
  });

  it('compares branch and tag refs without pre-resolving them to hashes', () => {
    fixture.detectChanges();
    const selectors = fixture.nativeElement.querySelectorAll(
      'select',
    ) as NodeListOf<HTMLSelectElement>;
    expect(selectors[0].getAttribute('aria-label')).toBe('Base ref');
    expect(selectors[1].getAttribute('aria-label')).toBe('Head ref');

    component.fromRef = 'v1.0.0';
    component.toRef = 'main';

    component.compare();

    expect(git.getRangeDiffFiles).toHaveBeenCalledWith('v1.0.0', 'main');
    expect(component.compared()).toBeTrue();
  });

  it('ignores a superseded comparison response', () => {
    const first = new Subject<DiffFilesResponse>();
    const second = new Subject<DiffFilesResponse>();
    git.getRangeDiffFiles.and.returnValues(first.asObservable(), second.asObservable());

    component.fromRef = 'main';
    component.toRef = 'feature/old';
    component.compare();
    component.toRef = 'feature/new';
    component.compare();

    first.next(listing('stale.ts'));
    expect(component.files()).toEqual([]);

    second.next(listing('fresh.ts'));
    expect(component.files().map((file) => file.file)).toEqual(['fresh.ts']);
  });

  it('restores from/to deep-link state and automatically compares', () => {
    git.getRangeDiffFiles.and.returnValue(of(listing('a.ts', 'b.ts')));
    params.next(convertToParamMap({ from: 'release/1.x', to: 'main', activeFile: 'b.ts' }));

    expect(component.fromRef).toBe('release/1.x');
    expect(component.toRef).toBe('main');
    expect(git.getRangeDiffFiles).toHaveBeenCalledWith('release/1.x', 'main');
    expect(component.compared()).toBeTrue();
    expect(component.activePath()).toBe('b.ts');
    expect(component.activeFile()?.file).toBe('b.ts');
    expect(git.getRangeDiffFile).toHaveBeenCalledOnceWith('release/1.x', 'main', 'b.ts');
  });

  it('lists files without patches and fetches only the selected file body', () => {
    git.getRangeDiffFiles.and.returnValue(of(listing('a.ts', 'b.ts', 'c.ts')));
    component.fromRef = 'main';
    component.toRef = 'feature';

    component.compare();

    expect(component.files().map((f) => f.file)).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(git.getRangeDiffFile).toHaveBeenCalledOnceWith('main', 'feature', 'a.ts');

    component.selectFile(component.files()[2]);

    expect(git.getRangeDiffFile).toHaveBeenCalledTimes(2);
    expect(git.getRangeDiffFile).toHaveBeenCalledWith('main', 'feature', 'c.ts');
    expect(component.activeFile()?.file).toBe('c.ts');
    expect(component.totalAdditions()).toBe(3);
  });

  it('ignores a superseded file body response', () => {
    git.getRangeDiffFiles.and.returnValue(of(listing('a.ts', 'b.ts')));
    const slow = new Subject<DiffFile>();
    git.getRangeDiffFile.and.returnValues(slow.asObservable(), of(diff('b.ts')));
    component.fromRef = 'main';
    component.toRef = 'feature';
    component.compare();

    component.selectFile(component.files()[1]);
    slow.next(diff('a.ts'));

    expect(component.activeFile()?.file).toBe('b.ts');
    expect(component.loadingFile()).toBeFalse();
  });

  it('shows an error and no stale patch when a file body fails to load', () => {
    git.getRangeDiffFiles.and.returnValue(of(listing('a.ts', 'b.ts')));
    component.fromRef = 'main';
    component.toRef = 'feature';
    component.compare();

    git.getRangeDiffFile.and.returnValue(
      throwError(() => ({ error: { error: 'File not in range' } })),
    );
    component.selectFile(component.files()[1]);

    expect(component.activeFile()).toBeNull();
    expect(component.fileError()).toBe('File not in range');
    expect(component.loadingFile()).toBeFalse();
  });
});

function meta(file: string): DiffFileMeta {
  return { file, status: 'modified', additions: 1, deletions: 0 };
}

function listing(...files: string[]): DiffFilesResponse {
  return { files: files.map(meta), totalLines: files.length, isLarge: false };
}

function diff(file: string): DiffFile {
  return { ...meta(file), changes: '@@ -1 +1 @@\n-old\n+new' };
}
