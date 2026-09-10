import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SplashCallPage } from './splash-call.page';

const routes: Routes = [
  {
    path: '',
    component: SplashCallPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SplashCallPageRoutingModule {}
