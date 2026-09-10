import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { authGuard } from './service/guards/auth.guard';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./modules/home_module/pages/login-vms/login-vms.module').then(m => m.LoginVmsPageModule),
    canActivate: [authGuard]
  },
  {
    path: 'incoming-call',
    loadChildren: () => import('./modules/call_module/incoming-call/incoming-call.module').then(m => m.IncomingCallPageModule)
  },
  {
    path: 'ongoing-call',
    loadChildren: () => import('./modules/call_module/ongoing-call/ongoing-call.module').then(m => m.OngoingCallPageModule)
  },
  {
    path: 'outgoing-call',
    loadChildren: () => import('./modules/call_module/outgoing-call/outgoing-call.module').then(m => m.OutgoingCallPageModule)
  },
  {
    path: 'splash-call',
    loadChildren: () => import('./modules/call_module/splash-call/splash-call.module').then(m => m.SplashCallPageModule)
  },
  {
    path: 'main-intercom',
    loadChildren: () => import('./modules/home_module/pages/main-intercom/main-intercom.module').then(m => m.MainIntercomPageModule),
    canActivate: [authGuard]
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
