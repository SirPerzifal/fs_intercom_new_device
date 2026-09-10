import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { OngoingCallPage } from './ongoing-call.page';

const routes: Routes = [
  {
    path: '',
    component: OngoingCallPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OngoingCallPageRoutingModule {}
