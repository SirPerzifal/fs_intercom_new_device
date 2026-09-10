import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  // readonly baseUrl = 'http://localhost:8069'
  // readonly baseUrl = 'http://192.168.1.207:8069'
  // readonly baseUrl = 'https://backend-ifs360.sgeede.com';
  readonly baseUrl = 'https://ifs360-sg.com';
  constructor(protected http: HttpClient) { }
}

