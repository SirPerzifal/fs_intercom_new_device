import { TestBed } from '@angular/core/testing';

import { ClientMainService } from './client-main.service';

describe('ClientMainService', () => {
  let service: ClientMainService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ClientMainService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
