import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpInterceptor,
  HttpHandler,
  HttpRequest,
  HttpErrorResponse,
  HttpResponse,
} from '@angular/common/http';
import { from, Observable, throwError } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { AuthService } from '../resident/authenticate/authenticate.service';
import { FunctionMainService } from '../function/function-main.service';

@Injectable({
  providedIn: 'root'
})
export class PublicMainService implements HttpInterceptor {

  constructor(private authService: AuthService, private functionMain: FunctionMainService) { }

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    // console.log("PING IS LOG ON HERE")
    return from(this.authService.getToken()).pipe(
      switchMap((token) => {
        // console.log(`Token Received: ${token}`);
        if (token) {
          req = req.clone({
            setHeaders: {
              Authorization: `Bearer ${token}`,
            },
          });
        }
        return next.handle(req).pipe(
          tap((res) => {
            if (res instanceof HttpResponse) {
              // console.log('Response received:', res);
              if (res.body?.result?.status_code === 403) {
                // console.log('Token expired, refreshing token...');
                throw new HttpErrorResponse({ status: 401, error: 'Token expired' });
              }
              if (res.body?.result?.status_code === 408) {
                // console.log('Token expired, refreshing token...');
                this.functionMain.logout()
                throw new HttpErrorResponse({ status: 401, error: 'Token expired' });
              }
            }
          }),
          catchError((error: HttpErrorResponse) => {
            // console.log('Catched Error...', error)
            if (error.status === 401) {
              // return throwError(error)
              return this.authService.refreshToken().pipe(
                switchMap((newToken) => {
                  if (newToken) {
                    // console.log("tge bew= tijeb", newToken)
                    req = req.clone({
                      setHeaders: {
                        Authorization: `Bearer ${newToken}`,
                      },
                    });
                    return next.handle(req);
                  } else {
                    // console.log('Token not received in Interceptor')
                    this.functionMain.logout();
                    return throwError(error);
                  }
                }),
                catchError(refreshError => {
                  // console.log('Refresh token failed, logging out.');
                  this.functionMain.logout();
                  return throwError(refreshError);
                })
              );
            } else {
              return throwError(error);
            }
          })
        );
      })
    );
  }


}
