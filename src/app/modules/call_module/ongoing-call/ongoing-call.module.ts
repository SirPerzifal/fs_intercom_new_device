import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { OngoingCallPageRoutingModule } from './ongoing-call-routing.module';

import { OngoingCallPage } from './ongoing-call.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    OngoingCallPageRoutingModule
  ],
  declarations: [OngoingCallPage]
})
export class OngoingCallPageModule {}
