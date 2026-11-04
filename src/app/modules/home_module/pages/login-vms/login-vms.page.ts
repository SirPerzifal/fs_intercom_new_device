import { Component, HostListener, OnInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Platform } from '@ionic/angular';
import { ClientMainService } from 'src/app/service/client-app/client-main.service';
import { FunctionMainService } from 'src/app/service/function/function-main.service';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app'
import { WebRtcService } from 'src/app/service/fs-web-rtc/web-rtc.service';
import { faWifi } from '@fortawesome/free-solid-svg-icons';

@Component({
  selector: 'app-login-vms',
  templateUrl: './login-vms.page.html',
  styleUrls: ['./login-vms.page.scss'],
})
export class LoginVmsPage implements OnInit {

  constructor(
    private router: Router,
    private platform: Platform,
    private clientMainService: ClientMainService,
    public functionMain: FunctionMainService,
    public webRtc: WebRtcService,
    private ngZone: NgZone,    
    private cdRef: ChangeDetectorRef,
    
  ) {

  }

  videoDevices: any = false
  faWifi = faWifi;
  networkStatus: 'connected' | 'connecting' | 'disconnected' = 'connecting';
  private networkSub!: Subscription;
  private secretTapCount = 0;
  private secretTapTimeout: any = null;
  isAppLocked = true;

  async getCameraList() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log(devices)
    this.videoDevices = devices.filter(d => d.kind === 'videoinput');
  }

  ngOnInit() {
    this.initializeBackButtonHandling()
    this.webRtc.initializeSocket();
    this.networkSub = this.webRtc.networkStatus$.subscribe(status => {
      this.ngZone.run(() => {
        this.networkStatus = status;
        this.cdRef.detectChanges();
      });
    });
    // this.getCameraList()
  }

  private routerSubscription!: Subscription;
  ngOnDestroy() {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
    if (this.networkSub) {
      this.networkSub.unsubscribe();
    }
  }


  code = ''

  async login() {
    if (this.code) {
      Preferences.clear()
      this.clientMainService.getApi({ code: this.code }, '/intercom/post/login').subscribe({
        next: (results) => {
          console.log(results.result.project_info)
          if (results.result.status_code === 200) {
            this.code = ''
            Preferences.set({
              key: 'USER_INFO',
              value: results.result.access_token,
            }).then(() => {
              setTimeout(() => {
                this.router.navigate(['/main-intercom']);
              }, 300)
            });
          } else if (results.result.status_code === 401) {
            this.functionMain.presentToast(results.result.status_description, 'danger');
          } else {
            this.functionMain.presentToast('An error occurred while logging into Intercom!', 'danger');
          }
        },
        error: (error) => {
          this.functionMain.presentToast('An error occurred while logging into Intercom!', 'danger');
          console.error(error);
        }
      });
    } else {
      this.functionMain.presentToast('Project code is required!', 'warning')
    }

  }

  initializeBackButtonHandling() {
    console.log("tes");
    this.platform.backButton.subscribeWithPriority(10, () => {
      App.exitApp();
    });
  }

  async checkAppLockStatus() {
    try {
      const res = await this.webRtc.getHomeAppLockStatus();
      this.isAppLocked = res?.isLocked ?? true;
    } catch (e) {
      this.isAppLocked = true;
    }
  }

  onSecretCornerTap() {
    this.secretTapCount++;
    if (this.secretTapTimeout) {
      clearTimeout(this.secretTapTimeout);
    }
    this.secretTapTimeout = setTimeout(() => {
      this.secretTapCount = 0;
    }, 2000);

    if (this.secretTapCount >= 6) {
      this.secretTapCount = 0;
      clearTimeout(this.secretTapTimeout);
      // this.toggleAppLock();
      this.webRtc.onOpenSetting()
    }
  }

  async toggleAppLock() {
    try {
      const res = await this.webRtc.toggleHomeAppLock();
      this.isAppLocked = res?.isLocked ?? true;
      if (this.isAppLocked) {
        this.functionMain.presentToast('Kiosk LOCKED — Select "IFS360 Intercom" as Home App in the dialog', 'warning', 'bottom');
      } else {
        this.functionMain.presentToast('Kiosk UNLOCKED — Select another launcher in the dialog', 'success', 'bottom');
      }
    } catch (e) {
      console.error('Error toggling app lock:', e);
      this.functionMain.presentToast('Failed to toggle Kiosk Mode', 'danger', 'bottom');
    }
  }

  onNetworkIconClick() {
    if (this.networkStatus === 'connected') {
      this.functionMain.presentToast('Network Connected: Online (Server Ready)', 'success', 'bottom');
    } else if (this.networkStatus === 'connecting') {
      this.functionMain.presentToast('Connecting to server, please wait...', 'warning', 'bottom');
    } else {
      this.functionMain.presentToast('Network Disconnected! Reconnecting...', 'danger', 'bottom');
      this.webRtc.reconnectSocket();
    }
  }
}
