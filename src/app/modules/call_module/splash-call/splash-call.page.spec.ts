import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SplashCallPage } from './splash-call.page';

describe('SplashCallPage', () => {
  let component: SplashCallPage;
  let fixture: ComponentFixture<SplashCallPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SplashCallPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
