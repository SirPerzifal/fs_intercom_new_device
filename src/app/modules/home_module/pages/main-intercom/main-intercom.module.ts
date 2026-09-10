import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MainIntercomPageRoutingModule } from './main-intercom-routing.module';

import { MainIntercomPage } from './main-intercom.page';
import { ComponentsModule } from 'src/app/shared/components/component.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MainIntercomPageRoutingModule,
    ComponentsModule,
  ],
  declarations: [MainIntercomPage]
})
export class MainIntercomPageModule {}
