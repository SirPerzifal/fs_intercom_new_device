import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';

type key = 'USESATE_DATA' | 'STAY_LOGGED_IN';

@Injectable({
  providedIn: 'root'
})
export class StorageService {

  constructor(
    private storage: Storage
  ) {
    this.storage.create();
  }

  async setValueToStorage(key: string, value: any) {
    console.log('keoanggil bang', key, value);
    
    this.storage.set(`${key}`, value);
  }

  async getValueFromStorage(key: key) {
    const response = await this.storage.get(`${key}`);
    if (response) {
      return response;
    } else {
      return null;
    }
  }

  removeValueFromStorage(key: key) {
    this.storage.remove(`${key}`);
  }

  clearAllValueFromStorage() {
    this.storage.clear();
  }

  async encodeData(data: any) {
    const encodedEstate = await btoa(unescape(encodeURIComponent(data)));
    return encodedEstate
  }

  async decodeData(data: any) {
    const decodedEstateString = await decodeURIComponent(escape(atob(data)));
    return decodedEstateString
  }
}
