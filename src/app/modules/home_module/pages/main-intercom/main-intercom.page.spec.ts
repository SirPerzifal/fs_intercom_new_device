import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MainIntercomPage } from './main-intercom.page';

describe('MainIntercomPage', () => {
  let component: MainIntercomPage;
  let fixture: ComponentFixture<MainIntercomPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MainIntercomPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
