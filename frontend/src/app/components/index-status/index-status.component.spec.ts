import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { IndexStatus } from '../../models/git.models';
import { GitService } from '../../services/git.service';
import { IndexStatusComponent } from './index-status.component';

describe('IndexStatusComponent polling', () => {
  let fixture: ComponentFixture<IndexStatusComponent>;
  let component: IndexStatusComponent;
  let git: jasmine.SpyObj<GitService>;

  beforeEach(async () => {
    git = jasmine.createSpyObj<GitService>('GitService', [
      'getIndexStatus',
      'buildIndex',
      'rebuildIndex',
      'cancelIndexBuild',
    ]);
    git.getIndexStatus.and.returnValue(of(status(false)));
    git.buildIndex.and.returnValue(of(status(true)));
    git.rebuildIndex.and.returnValue(of(status(true)));
    git.cancelIndexBuild.and.returnValue(of(status(false)));

    await TestBed.configureTestingModule({
      imports: [IndexStatusComponent],
      providers: [{ provide: GitService, useValue: git }],
    }).compileComponents();
  });

  it('does not poll an idle index and refreshes once after an action', fakeAsync(() => {
    fixture = TestBed.createComponent(IndexStatusComponent);
    component = fixture.componentInstance;
    expect(git.getIndexStatus).toHaveBeenCalledTimes(1);

    tick(10_000);
    expect(git.getIndexStatus).toHaveBeenCalledTimes(1);

    git.getIndexStatus.and.returnValue(of(status(true)));
    component.build();
    expect(git.buildIndex).toHaveBeenCalledTimes(1);
    expect(git.getIndexStatus).toHaveBeenCalledTimes(2);

    tick(1000);
    expect(git.getIndexStatus).toHaveBeenCalledTimes(3);
    fixture.destroy();
  }));

  it('pauses active polling while hidden and refreshes when visible again', fakeAsync(() => {
    let visibility: DocumentVisibilityState = 'visible';
    spyOnProperty(document, 'visibilityState', 'get').and.callFake(() => visibility);
    git.getIndexStatus.and.returnValue(of(status(true)));
    fixture = TestBed.createComponent(IndexStatusComponent);

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    tick(2000);
    expect(git.getIndexStatus).toHaveBeenCalledTimes(1);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(git.getIndexStatus).toHaveBeenCalledTimes(2);
    fixture.destroy();
  }));
});

function status(running: boolean): IndexStatus {
  return {
    available: true,
    total: running ? 5 : 0,
    running,
    progress: {
      phase: running ? 'indexing' : 'idle',
      indexed: running ? 2 : 0,
      startedAt: null,
      updatedAt: null,
    },
  };
}
