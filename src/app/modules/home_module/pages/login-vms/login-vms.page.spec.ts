import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoginVmsPage } from './login-vms.page';

describe('LoginVmsPage', () => {
  let component: LoginVmsPage;
  let fixture: ComponentFixture<LoginVmsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(LoginVmsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
