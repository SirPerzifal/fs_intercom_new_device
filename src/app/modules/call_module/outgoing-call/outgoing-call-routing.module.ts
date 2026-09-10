import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { OutgoingCallPage } from './outgoing-call.page';

const routes: Routes = [
  {
    path: '',
    component: OutgoingCallPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OutgoingCallPageRoutingModule {}
