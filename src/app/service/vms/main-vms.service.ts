import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ApiService } from '../api.service';
import { catchError, from, Observable, switchMap, throwError } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import { jwtDecode } from 'jwt-decode';

@Injectable({
  providedIn: 'root'
})
export class MainVmsService extends ApiService {

  constructor(http: HttpClient) { super(http) }

  project_id = 0
  preference: any = {}

  async loadProjectName() {
    return Preferences.get({ key:'USER_INFO' }).then((result) => {
      if (result.value) {
        this.preference = jwtDecode(result.value);
        console.log(this.preference)
        return this.preference;
      } else {
        return false;
      }
    });
  }

  getApi(params: any, apiUrl: string): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
  
    return from(this.prepareParams(params)).pipe(
      switchMap((finalParams) =>
        this.http.post(
          this.baseUrl + apiUrl,
          { jsonrpc: '2.0', params: finalParams },
          { headers }
        )
      ),
      catchError(this.handleError)
    );
  }
  
  private async prepareParams(params: any): Promise<any> {
    const info: any = await this.loadProjectName();
    if (info) {
      params['project_id'] = info.project_id;
      params['intercom_id'] = info.intercom_id;
    }
    console.log(params);
    return params;
  }
  

  private handleError(error: any) {
    console.error('An error occurred:', error);
    
    if (error.error instanceof ErrorEvent) {
      console.error('Client-side error:', error.error.message);
    } else {
      console.error(
        `Backend returned code ${error.status}, ` +
        `body was: ${error.error}`
      );
    }

    return throwError(() => new Error('Something went wrong; please try again later.'));
  }
}
