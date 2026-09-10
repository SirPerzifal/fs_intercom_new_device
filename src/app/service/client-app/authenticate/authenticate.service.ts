import { Injectable } from '@angular/core';
import { ApiService } from '../../api.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import {jwtDecode} from 'jwt-decode';
import { catchError } from 'rxjs/operators';
import { ToastController } from '@ionic/angular';
@Injectable({
  providedIn: 'root'
})
export class AuthService extends ApiService{

  constructor(http: HttpClient, private toastController : ToastController) { super(http) }

  postLoginAuthenticate(
    login: string, 
    password: string, 
  ): Observable<any> {

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    });

    const res = this.http.post<any>(
      `${this.baseUrl}/client/post/login`, 
      {
        jsonrpc: '2.0', 
        params: {
          login,
          password
        }
      },
      {headers}
    );
    
    console.log(res)
    return res.pipe(
      catchError(this.handleError)
  );
  }

    parseJWTParams(token:string){
      return jwtDecode(token) as {user_id:string, name:string, email:string, project_id:string, exp:Number}
    }
  
    isTokenValid(token: string): boolean {
      try {
        const decoded: any = jwtDecode(token);
        return decoded.exp * 1000 > Date.now(); // Check if token is expired
      } catch (error) {
        return false;
      }
    }


  changePassword(newPassword: string, userId: number): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    });

    const body = {
        jsonrpc: '2.0',
        params: {
          new_password: newPassword,
          family_id: userId,
        },
    };
  
    return this.http.post(this.baseUrl + '/residential/post/update_password', body, { headers }).pipe(
        catchError(this.handleError)
    );
  }

  private handleError(error: any) {
    console.error('An error occurred:', error);
    
    if (error.error instanceof ErrorEvent) {
      console.error('Client-side error:', error.error.message);
      this.presentToast(error.error.message,'danger')
    } else {
      console.error(
        `Backend returned code ${error.status}, ` +
        `body was: ${error.error}`
      );
      this.presentToast(error.error.message,'danger')

    }

    return throwError(() => new Error('Something went wrong; please try again later.'));
  }

  async presentToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastController.create({
      message: message,
      duration: 4000,
      color: color
    });
    toast.present().then(() => {
    });;
  }
}
