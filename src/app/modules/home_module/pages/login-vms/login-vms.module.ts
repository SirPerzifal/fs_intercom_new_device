import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { LoginVmsPageRoutingModule } from './login-vms-routing.module';

import { LoginVmsPage } from './login-vms.page';
import { ComponentsModule } from 'src/app/shared/components/component.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    LoginVmsPageRoutingModule,
    ComponentsModule,
  ],
  declarations: [LoginVmsPage]
})
export class LoginVmsPageModule {}
