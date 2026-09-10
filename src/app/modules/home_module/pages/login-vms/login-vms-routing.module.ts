import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { LoginVmsPage } from './login-vms.page';

const routes: Routes = [
  {
    path: '',
    component: LoginVmsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class LoginVmsPageRoutingModule {}
