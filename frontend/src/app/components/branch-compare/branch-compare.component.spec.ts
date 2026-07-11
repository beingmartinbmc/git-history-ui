import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { DiffFile } from '../../models/git.models';
import { GitService } from '../../services/git.service';
import { UiStateService } from '../../services/ui-state.service';
import { BranchCompareComponent } from './branch-compare.component';

describe('BranchCompareComponent', () => {
  let fixture: ComponentFixture<BranchCompareComponent>;
  let component: BranchCompareComponent;
  let git: {
    getRangeDiff: jasmine.Spy;
    createPortableLink: jasmine.Spy;
    getRangeReportMarkdown: jasmine.Spy;
  };
  let state: UiStateService;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    git = {
      getRangeDiff: jasmine.createSpy('getRangeDiff').and.returnValue(of([])),
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
    component.fromRef = 'v1.0.0';
    component.toRef = 'main';

    component.compare();

    expect(git.getRangeDiff).toHaveBeenCalledWith('v1.0.0', 'main');
    expect(component.compared()).toBeTrue();
  });

  it('ignores a superseded comparison response', () => {
    const first = new Subject<DiffFile[]>();
    const second = new Subject<DiffFile[]>();
    git.getRangeDiff.and.returnValues(first.asObservable(), second.asObservable());

    component.fromRef = 'main';
    component.toRef = 'feature/old';
    component.compare();
    component.toRef = 'feature/new';
    component.compare();

    first.next([diff('stale.ts')]);
    expect(component.files()).toEqual([]);

    second.next([diff('fresh.ts')]);
    expect(component.files().map((file) => file.file)).toEqual(['fresh.ts']);
  });

  it('restores from/to deep-link state and automatically compares', () => {
    git.getRangeDiff.and.returnValue(of([diff('a.ts'), diff('b.ts')]));
    params.next(convertToParamMap({ from: 'release/1.x', to: 'main', activeFile: 'b.ts' }));

    expect(component.fromRef).toBe('release/1.x');
    expect(component.toRef).toBe('main');
    expect(git.getRangeDiff).toHaveBeenCalledWith('release/1.x', 'main');
    expect(component.compared()).toBeTrue();
    expect(component.activeFile()?.file).toBe('b.ts');
  });
});

function diff(file: string): DiffFile {
  return { file, status: 'modified', additions: 1, deletions: 0, changes: '' };
}
