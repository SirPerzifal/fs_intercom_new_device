import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { M2mSelectionComponent } from './m2m-selection/m2m-selection.component';
import { ModalLoadingComponent } from './modal-loading/modal-loading.component';
import { TextInputComponent } from './text-input/text-input.component';
import { LoadingAnimationComponent } from './loading-animation/loading-animation.component';
@NgModule({
  declarations: [
    M2mSelectionComponent,
    ModalLoadingComponent,
    TextInputComponent,
    LoadingAnimationComponent,
  ],
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    FontAwesomeModule,
  ],
  exports: [
    FontAwesomeModule,
    M2mSelectionComponent,
    ModalLoadingComponent,
    TextInputComponent,
    LoadingAnimationComponent,
  ],
  schemas: [],
  providers: []
})
export class ComponentsModule { }
