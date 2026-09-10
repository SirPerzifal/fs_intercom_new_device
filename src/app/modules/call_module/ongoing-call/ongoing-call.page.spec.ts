import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OngoingCallPage } from './ongoing-call.page';

describe('OngoingCallPage', () => {
  let component: OngoingCallPage;
  let fixture: ComponentFixture<OngoingCallPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(OngoingCallPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
