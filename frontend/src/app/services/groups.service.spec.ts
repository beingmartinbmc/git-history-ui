import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GroupsService } from './groups.service';

describe('GroupsService', () => {
  let service: GroupsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(GroupsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('sends branch filters with grouped commit requests', () => {
    service.list({
      since: '2026-01-01',
      until: '2026-02-01',
      author: 'Ada',
      branch: 'feature/ui-refresh'
    }).subscribe((groups) => {
      expect(groups).toEqual([]);
    });

    const req = http.expectOne((request) => request.url === '/api/groups');
    expect(req.request.params.get('since')).toBe('2026-01-01');
    expect(req.request.params.get('until')).toBe('2026-02-01');
    expect(req.request.params.get('author')).toBe('Ada');
    expect(req.request.params.get('branch')).toBe('feature/ui-refresh');
    req.flush([]);
  });
});
