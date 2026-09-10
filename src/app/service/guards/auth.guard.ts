import { CanActivateFn, Router } from '@angular/router';
import { Injectable,inject } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { AuthService } from '../resident/authenticate/authenticate.service';
import { FunctionMainService } from '../function/function-main.service';


export const authGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const functionMain = inject(FunctionMainService) 

  const tokenData = await Preferences.get({ key: 'USER_INFO' });
  console.log(tokenData.value)
  
  let currentUrl = (state.url).split('?')[0]
  console.log(currentUrl)
  
  if (!tokenData.value) {
    if (currentUrl == '/'){
      return true;
    } else if (currentUrl == '/main-intercom'){
      router.navigate(['/']);
      return false;
    } 
  } else {
    if (currentUrl == '/') {
      router.navigate(['/main-intercom']);
    }
  }

  return true;
};