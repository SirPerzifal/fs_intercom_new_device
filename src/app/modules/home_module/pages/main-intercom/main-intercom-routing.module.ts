import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MainIntercomPage } from './main-intercom.page';

const routes: Routes = [
  {
    path: '',
    component: MainIntercomPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MainIntercomPageRoutingModule {}
