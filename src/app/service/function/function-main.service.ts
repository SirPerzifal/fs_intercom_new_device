import { Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Preferences } from '@capacitor/preferences';
import {jwtDecode} from 'jwt-decode';
import { WebRtcService } from '../fs-web-rtc/web-rtc.service';
import { StorageService } from '../storage/storage.service';

@Injectable({
  providedIn: 'root'
})
export class FunctionMainService {

  constructor(
    private toastController: ToastController,
    private webRtcService: WebRtcService,
    private storage: StorageService,
  ) { }

  async presentToast(message: string, color: 'success' | 'danger' | 'warning' | 'dark' = 'success') {
    const toast = await this.toastController.create({
      message: message,
      duration: 4000,
      color: color,
      position: 'top'
    });
    toast.present();
  }

  convertToDDMMYYYY(dateString: string | undefined): string | undefined {
    if (!dateString) return '-'
    // Memisahkan string berdasarkan "-"
    const parts = dateString?.split('-');
    
    // Memastikan bahwa kita memiliki 3 bagian (tahun, bulan, hari)
    if (parts?.length === 3) {
      const [year, month, day] = parts; // Pisahkan menjadi tahun, bulan, dan hari
      return `${day}/${month}/${year}`; // Gabungkan dalam format dd/mm/yyyy
    } else {
      return dateString; // Kembalikan string asli jika format tidak sesuai
    }
  }

  returnNone(params: any) {
    return params ? params : '-'
  }

  convertDateExtend(dateString: string): string {
    if (!dateString) return '-'
    let dateFront = dateString.split(' ')[0]
    const [year, month, day] = dateFront.split('-'); // Pisahkan string berdasarkan "-"
    return `${day}/${month}/${year} ` + dateString.split(' ')[1]; // Gabungkan dalam format dd/mm/yyyy
  }

  isValidBase64(str: string): boolean {
    if (!str || typeof str !== 'string') return false;
  
    const base64Regex = /^(?:[A-Za-z0-9+/]{4})*?(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    return base64Regex.test(str.trim());
  }

  getImage(image: string) {
    if (!image) return 'assets/icon/exc-client/no_image.jpg';
    
    // Jika sudah berupa URL/path, return langsung
    if (image.startsWith('http') || image.startsWith('file://') || image.startsWith('blob:')) {
      return image;
    }
    
    // Jika base64, tambahkan prefix
    if (this.isValidBase64(image)) {
      return `data:image/png;base64,${image}`;
    }
    
    return 'assets/icon/exc-client/no_image.jpg';
  }

  countryCodes = [
    {
      country: 'SG',
      code: '65',
      digit: 8,
    },
    {
      country: 'ID',
      code: '62',
      digit: 12,
    },
    {
      country: 'MY',
      code: '60',
      digit: 9,
    },
  ]

  convertNewDateTZ(date_string: string, isNeedSS: boolean = true) {
    if (!date_string) return '-'
    let tz = new Date().getTimezoneOffset() / -60
    let dateObj = new Date(date_string);

    // Adjust the datetime by adding the timezone offset in hours
    dateObj.setHours(dateObj.getHours() + tz);

    const options: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };
    
    if (isNeedSS) {
      options.second = '2-digit';
    }

    return dateObj.toLocaleString('en-GB', options).replace(',', '');
  }

  preference: any = {}
  vmsPreferences(): Promise<any> {
    return Preferences.get({ key:'USER_INFO' }).then((result) => {
      if (result.value) {
        this.preference = jwtDecode(result.value);
        this.preference['access_token'] = result.value
        
        return this.preference;
      } else {
        return false;
      }
    });
  }
  
  public readonly limitHistory = 15

  getTodayYYYYMMDD() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0'); 
    const dd = String(today.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;

  }

  cn_month: any = {
    'Mon': '星期一',
    'Tue': '星期二',
    'Wed': '星期三',
    'Thu': '星期四',
    'Fri': '星期五',
    'Sat': '星期六',
    'Sun': '星期日',
  }
  
  formatShortDate(dateString: Date, is_en: boolean = true) {
    if (!dateString) return '-'
    const date = new Date(dateString);
    const day = date.getDate();

    const month = new Intl.DateTimeFormat('en', { month: (is_en ? 'short' : 'numeric') }).format(date);
    let weekday = new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date);

    if (!is_en) {
      weekday = this.cn_month[weekday]
    }

    return `${weekday}, ${month + (is_en ? '' : '月')} ${day + (is_en ? '' : '日')}`;
  }

  formatHours(dateString: Date) {
    if (!dateString) return '-'
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    
  }

  async logout() {
    Preferences.clear()
    this.storage.clearAllValueFromStorage()
  }

}
