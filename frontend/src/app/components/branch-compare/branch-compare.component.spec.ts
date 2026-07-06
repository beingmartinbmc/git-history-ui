import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { GitService } from '../../services/git.service';
import { UiStateService } from '../../services/ui-state.service';
import { BranchCompareComponent } from './branch-compare.component';

describe('BranchCompareComponent', () => {
  let fixture: ComponentFixture<BranchCompareComponent>;
  let component: BranchCompareComponent;
  let git: { getRangeDiff: jasmine.Spy };
  let state: UiStateService;

  beforeEach(async () => {
    git = {
      getRangeDiff: jasmine.createSpy('getRangeDiff').and.returnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [BranchCompareComponent],
      providers: [{ provide: GitService, useValue: git }],
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
});
