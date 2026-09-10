import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { Drivers } from '@ionic/storage';
import { IonicStorageModule } from '@ionic/storage-angular';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';

import { CalendarModule, DateAdapter } from 'angular-calendar';
import { adapterFactory } from 'angular-calendar/date-adapters/date-fns';
import { CustomDateFormatter } from 'src/utils/custom-date-formatter';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faMotorcycle, faTaxi } from '@fortawesome/free-solid-svg-icons';
import { PublicMainService } from './service/public-main/public-main.service';

@NgModule({
  declarations: [AppComponent],
  imports: [
    FontAwesomeModule,
    IonicStorageModule.forRoot({
      driverOrder: [Drivers.IndexedDB, Drivers.LocalStorage]
    }),
    BrowserModule, 
    IonicModule.forRoot({innerHTMLTemplatesEnabled:true}), 
    AppRoutingModule, 
    BrowserAnimationsModule,
    FormsModule,
    HttpClientModule,
    CalendarModule.forRoot({
      provide: DateAdapter,
      useFactory: adapterFactory,
      useClass: CustomDateFormatter,
    }),
  ],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: HTTP_INTERCEPTORS, useClass: PublicMainService, multi: true},
  ],
  bootstrap: [AppComponent],
})
export class AppModule {
  constructor() {
    library.add(faMotorcycle, faTaxi)
  }
}