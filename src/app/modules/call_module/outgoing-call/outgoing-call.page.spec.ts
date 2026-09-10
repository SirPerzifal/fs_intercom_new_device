import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OutgoingCallPage } from './outgoing-call.page';

describe('OutgoingCallPage', () => {
  let component: OutgoingCallPage;
  let fixture: ComponentFixture<OutgoingCallPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(OutgoingCallPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
