import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { OutgoingCallPageRoutingModule } from './outgoing-call-routing.module';

import { OutgoingCallPage } from './outgoing-call.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    OutgoingCallPageRoutingModule
  ],
  declarations: [OutgoingCallPage]
})
export class OutgoingCallPageModule {}
