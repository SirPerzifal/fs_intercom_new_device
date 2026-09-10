import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IncomingCallPage } from './incoming-call.page';

describe('IncomingCallPage', () => {
  let component: IncomingCallPage;
  let fixture: ComponentFixture<IncomingCallPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(IncomingCallPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
