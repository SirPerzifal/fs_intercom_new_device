import { TestBed } from '@angular/core/testing';

import { MainVmsService } from './main-vms.service';

describe('MainVmsService', () => {
  let service: MainVmsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MainVmsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
