import { TestBed } from '@angular/core/testing';

import { FunctionMainService } from './function-main.service';

describe('FunctionMainService', () => {
  let service: FunctionMainService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FunctionMainService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
