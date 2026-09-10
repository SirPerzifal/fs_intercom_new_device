import { TestBed } from '@angular/core/testing';

import { PublicMainService } from './public-main.service';

describe('PublicMainService', () => {
  let service: PublicMainService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PublicMainService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
