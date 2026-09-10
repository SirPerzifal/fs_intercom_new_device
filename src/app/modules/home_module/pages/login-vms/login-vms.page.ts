import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Platform } from '@ionic/angular';
import { ClientMainService } from 'src/app/service/client-app/client-main.service';
import { FunctionMainService } from 'src/app/service/function/function-main.service';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app'
import { WebRtcService } from 'src/app/service/fs-web-rtc/web-rtc.service';

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
  ) {

  }

  videoDevices: any = false

  async getCameraList() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log(devices)
    this.videoDevices = devices.filter(d => d.kind === 'videoinput');
  }

  ngOnInit() {
    this.initializeBackButtonHandling()
    // this.getCameraList()
  }

  private routerSubscription!: Subscription;
  ngOnDestroy() {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
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
}
