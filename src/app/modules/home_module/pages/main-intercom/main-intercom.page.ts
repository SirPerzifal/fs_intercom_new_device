import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { faAsterisk, faPhone, faQrcode, faQuestion, faUserTie, faSignOut, faGear, faSync, faSmile } from '@fortawesome/free-solid-svg-icons';
import { Platform } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { FunctionMainService } from 'src/app/service/function/function-main.service';
import { App } from '@capacitor/app'
import { ClientMainService } from 'src/app/service/client-app/client-main.service';
import { WebRtcService } from 'src/app/service/fs-web-rtc/web-rtc.service';
import { trigger, style, animate, transition } from '@angular/animations';
import { Preferences } from '@capacitor/preferences';
import { Plugins } from '@capacitor/core';
import { Router } from '@angular/router';
// import { NativeSettings, AndroidSettings } from 'capacitor-native-settings'

@Component({
  selector: 'app-main-intercom',
  templateUrl: './main-intercom.page.html',
  styleUrls: ['./main-intercom.page.scss'],
  animations: [
    trigger('slideInOut', [
      transition(':enter', [
        style({ opacity: 1, transform: 'translateY(100%)' }),
        animate('500ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('500ms ease-out', style({ opacity: 1, transform: 'translateY(100%)' }))
      ])
    ])
  ]
})
export class MainIntercomPage implements OnInit {

  constructor(
    private ngZone: NgZone,
    private router: Router,
    private cdRef: ChangeDetectorRef,
    public functionMain: FunctionMainService,
    private platform: Platform,
    private clientMainService: ClientMainService,
    private webRtc: WebRtcService,
  ) {
    this.initializeBackButtonHandling();
  }

  version = '(3.1.2-270)'

  ngOnInit() {
    // this.openScanRecognitionModal()
    this.webRtc.initializeSocket()
    this.initializeBackButtonHandling();
    this.startDate()
    console.log("TEST INIT")
    console.log("FS_INTERCOM: Web App successfully initialized with WebRTC updates!")
    this.getCurrentConfig()
    // ADD: Setup face recognition listeners
    this.setupFaceRecognitionListeners();
  }

  // ADD: Face recognition setup
  // Face recognition setup - FIXED with bracket notation
  setupFaceRecognitionListeners() {
    // Listen for face detection
    Plugins['Intercom']['addListener']('faceDetected', (data: any) => {
      this.ngZone.run(() => {
        console.log('Face detected:', data);
        this.faceDetectionCount = data.faceCount;
        this.faceStatus = `Detected ${data.faceCount} face(s)`;
      });
    });

    // Listen for face recognition
    Plugins['Intercom']['addListener']('faceRecognized', (data: any) => {
      this.ngZone.run(() => {
        console.log('Face recognized:', data);

        if (data.recognized) {
          this.isRecognizedSuccess = true;
          this.recognizedUserId = data.userId;
          this.recognizedUserName = data.userName || data.name || '';
          this.recognitionScore = data.score;

          const displayName = this.recognizedUserName || data.userId;
          this.faceStatus = this.is_en ? `Welcome, ${displayName}!` : `欢迎，${displayName}！`;

          // Immediately stop camera preview so the user can clearly see the success modal card!
          this.webRtc.stopScan().catch(err => console.error('Error stopping camera preview:', err));
          this.isFaceRecognitionActive = false;

          // Trigger face recognition handler with accuracy score and full name
          this.handleFaceRecognition(data.userId, data.score, this.recognizedUserName);

          // Auto-close scan recognition modal after showing success state for 4 seconds
          if (this.scanModalTimeout) {
            clearTimeout(this.scanModalTimeout);
          }
          this.scanModalTimeout = setTimeout(() => {
            this.closeScanRecognitionModal();
          }, 4000);
        } else {
          // Failed or low confidence match — keep scanning without showing resident card
          this.isRecognizedSuccess = false;
          this.faceStatus = this.is_en ? 'Face not recognized, aligning...' : '人脸未识别，正在重试...';
        }
      });
    });

    // Listen for face recognition
    Plugins['Intercom']['addListener']('sendToastMessage', (data: any) => {
      this.ngZone.run(() => {
        let message = data.message;
        let is_success = data.is_success;

        if (message) {
          this.functionMain.presentToast(message, is_success ? 'success' : 'danger');
        }
      });
    });

    // Listen for no face
    Plugins['Intercom']['addListener']('noFace', (data: any) => {
      this.ngZone.run(() => {
        this.faceDetectionCount = 0;
        this.faceStatus = 'No face detected';
        this.recognizedUserId = '';
        this.recognizedUserName = '';
        this.recognitionScore = 0;
      });
    });

    // Listen for face nearby (approach detection)
    Plugins['Intercom']['addListener']('faceNearby', (data: any) => {
      this.ngZone.run(() => {
        console.log('Face nearby (approach):', data);
        if (!this.showScanModal && !this.showScanRecognitionModal) {
          this.faceStatus = 'Face approaching...';
        }
      });
    });
  }

  // ADD: Face recognition variables
  isFaceRecognitionActive = false;
  isRecognizedSuccess = false;
  faceDetectionCount = 0;
  recognizedUserId = '';
  recognizedUserName = '';
  recognitionScore = 0;
  faceStatus = 'Ready to scan';


  // ADD: Handle face recognition result
  handleFaceRecognition(userId: string, score: number, userName?: string) {
    console.log('Face recognized:', userId, 'Score:', score, 'UserName:', userName);
    const displayName = userName || this.recognizedUserName || userId;
    this.functionMain.presentToast(this.is_en ? `Face recognized: ${displayName} (${score}%)` : `人脸识别成功: ${displayName} (${score}%)`, 'success');
  }

  valueReturn = '';
  getCurrentConfig() {
    this.is_en = true
    this.functionMain.vmsPreferences().then((value) => {
      this.valueReturn = JSON.stringify(value, null, 2)
      console.log(value)
      this.projectInfo = {
        project_id: value.project_id,
        project_name: value.project_name,
        project_address: value.project_address,
        is_industrial: value.project_type == 'Industrial',
        code: value.login_code,
      }
      this.facilityInfo = value.room
      this.is_gym = value.is_gym
      this.family_id = value.family_id
      if (this.facilityInfo) {
        this.loadBooking()
      }
      this.getIntercomExtraConfig()
    })
  }

  startDate() {
    this.ngZone.runOutsideAngular(() => {
      this.intervalId = setInterval(() => {
        this.currentDate = this.functionMain.formatShortDate(new Date(), this.is_en);
        this.currentTime = this.functionMain.formatHours(new Date())

        let minutes = this.currentTime.split(':')[1].substring(0, 2);
        if (['00', '15', '30', '45'].includes(minutes)) {
          if (this.isCanReload) {
            if (this.facilityInfo) {
              this.loadBooking()
            }
            this.isCanReload = false
          }
        } else {
          this.isCanReload = true
        }

        this.cdRef.detectChanges(); // manually trigger update
      }, 1000);
    });
  }

  isCanReload = true
  private routerSubscription!: Subscription;
  ngOnDestroy() {
    clearInterval(this.intervalId);
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }

    // ADD: Stop face recognition if active
    if (this.isFaceRecognitionActive) {
      Plugins['Intercom']['stopRecognition']();
    }
  }

  extraConfig: any = {}
  getIntercomExtraConfig() {
    this.clientMainService.getApi({}, '/intercom/get/extra_config').subscribe({
      next: (results) => {
        console.log(results)
        console.log(results.result.config)
        if (results.result.status_code === 200) {
          this.extraConfig = results.result.config
        } else {
          this.extraConfig = {}
          this.functionMain.presentToast('An error occurred while trying to get intercom config!', 'danger');
        }
      },
      error: (error) => {
        this.functionMain.presentToast('An error occurred while trying to get intercom config!', 'danger');
        console.error(error);
      }
    });
  }

  currentDate: any = ''
  currentTime: any = ''
  intervalId: any = ''
  family_id: any = false

  faPhone = faPhone
  faQrcode = faQrcode
  faSmile = faSmile
  faUserTie = faUserTie
  faAsterisk = faAsterisk
  faQuestion = faQuestion
  faSignOut = faSignOut
  faGear = faGear
  faSync = faSync

  projectInfo: any = {}
  is_gym = false
  facilityInfo: any = {}

  initializeBackButtonHandling() {
    this.platform.backButton.subscribeWithPriority(10, () => {
      App.exitApp();
    });
  }

  family_code = ''
  isCallModal = false

  openModal() {
    this.family_code = ''
    this.isCallModal = true
    this.isKey = false
    this.loadTimeout()
  }

  startCountdown() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
    }
    this.timeoutId = setTimeout(() => {
      this.closeModal()
    }, 30000)
  }

  closeModal() {
    this.family_code = ''
    this.isCallModal = false
    clearTimeout(this.timeoutId)
  }

  onFamilySearch() {
    if (this.isDisable) {
      return;
    }
    this.loadDisable()

    this.clientMainService.getApi({ family_code: this.family_code }, '/intercom/get/family_code').subscribe({
      next: (results) => {
        console.log(results)
        if (results.result.status_code === 200) {
          this.closeModal()
          if (results.result.result.unit_id) {
            console.log(results.result.result.unit_id)
            this.isDisable = false
            this.webRtc.createOffer(false, false, results.result.result.unit_id, false, this.family_id)
          } else {
            this.isDisable = false
            this.webRtc.createOffer(false, results.result.result.family_id, false, false, this.family_id)
          }
        } else {
          this.isDisable = false
          this.functionMain.presentToast(results.result.status_description, 'danger');
        }
      },
      error: (error) => {
        this.functionMain.presentToast('An error occurred!', 'danger');
        console.error(error);
      }
    });
  }

  triggerFetchData() {
    this.webRtc.fetchDataImages();
  }

  isDisable = false
  loadDisable() {
    this.isDisable = true
    setTimeout(() => {
      this.isDisable = false
    }, 3000)
  }

  async callSecurity() {
    if (this.isDisable) {
      return;
    }
    this.loadDisable()
    console.log("Stopping face recognition camera before video call...");
    try {
      if (Plugins['Intercom']) {
        await Plugins['Intercom']['stopApproachDetection']();
        await Plugins['Intercom']['stopScan']();
        await Plugins['Intercom']['stopRecognition']();
      }
    } catch (e) {
      console.log("Error stopping intercom camera:", e);
    }

    // Delay slightly to ensure hardware camera is fully released by Android
    // setTimeout(() => {
    const project_id = 'Project-' + (this.projectInfo.project_id).toString();
    this.webRtc.createOffer(false, project_id, false, true, this.family_id);
    // }, 500);
  }

  isMain = true
  isCall = false

  onBack() {
    if (this.isCall) {
      this.isCall = false
      setTimeout(() => {
        this.isMain = true
      })
    }
  }

  tempArrayButton = [
    { isCustomIcon: false, text: '1', value: '1' },
    { isCustomIcon: false, text: '2', value: '2' },
    { isCustomIcon: false, text: '3', value: '3' },
    { isCustomIcon: false, text: '4', value: '4' },
    { isCustomIcon: false, text: '5', value: '5' },
    { isCustomIcon: false, text: '6', value: '6' },
    { isCustomIcon: false, text: '7', value: '7' },
    { isCustomIcon: false, text: '8', value: '8' },
    { isCustomIcon: false, text: '9', value: '9' },
    { isCustomIcon: false, text: '#', value: '#' },
    { isCustomIcon: false, text: '0', value: '0' },
    { isCustomIcon: true, text: 'backspace-outline', value: 'pop' },
  ]


  buttonArray = [
    { isCustomIcon: false, text: '7', value: '7' },
    { isCustomIcon: false, text: '8', value: '8' },
    { isCustomIcon: false, text: '9', value: '9' },
    { isCustomIcon: false, text: '4', value: '4' },
    { isCustomIcon: false, text: '5', value: '5' },
    { isCustomIcon: false, text: '6', value: '6' },
    { isCustomIcon: false, text: '1', value: '1' },
    { isCustomIcon: false, text: '2', value: '2' },
    { isCustomIcon: false, text: '3', value: '3' },
    { isCustomIcon: true, text: faAsterisk, value: '*' },
    { isCustomIcon: false, text: '0', value: '0' },
    { isCustomIcon: false, text: '#', value: '#' }
  ]

  buttonKeyArray = [
    { isCustomIcon: false, text: 'A', value: 'A' },
    { isCustomIcon: false, text: 'B', value: 'B' },
    { isCustomIcon: false, text: 'C', value: 'C' },
    { isCustomIcon: false, text: 'D', value: 'D' },
    { isCustomIcon: false, text: 'E', value: 'E' },
    { isCustomIcon: false, text: 'F', value: 'F' },
    { isCustomIcon: false, text: 'G', value: 'G' },
    { isCustomIcon: false, text: 'H', value: 'H' },
    { isCustomIcon: false, text: 'I', value: 'I' },
    { isCustomIcon: false, text: 'J', value: 'J' },
    { isCustomIcon: false, text: 'K', value: 'K' },
    { isCustomIcon: false, text: 'L', value: 'L' },
    { isCustomIcon: false, text: 'M', value: 'M' },
    { isCustomIcon: false, text: 'N', value: 'N' },
    { isCustomIcon: false, text: 'O', value: 'O' },
    { isCustomIcon: false, text: 'P', value: 'P' },
    { isCustomIcon: false, text: 'Q', value: 'Q' },
    { isCustomIcon: false, text: 'R', value: 'R' },
    { isCustomIcon: false, text: 'S', value: 'S' },
    { isCustomIcon: false, text: 'T', value: 'T' },
    { isCustomIcon: false, text: 'U', value: 'U' },
    { isCustomIcon: false, text: 'V', value: 'V' },
    { isCustomIcon: false, text: 'W', value: 'W' },
    { isCustomIcon: false, text: 'X', value: 'X' },
    { isCustomIcon: false, text: 'Y', value: 'Y' },
    { isCustomIcon: false, text: 'Z', value: 'Z' }
  ]

  buttonClicked(value: any) {
    if (value.value == 'pop') {
      this.family_code = this.family_code.slice(0, -1)
    } else {
      this.family_code += value.value
    }
    this.loadTimeout()
  }

  is_en = true

  changeLang(lang: string) {
    if (lang == 'cn') {
      // this.functionMain.presentToast('This feature is currently under development.', 'danger')
      this.is_en = false
    } else {
      this.is_en = true
    }
    clearInterval(this.intervalId)
    this.startDate()
  }

  scanCode() {
    this.clientMainService.getApi({}, '/intercom/post/scan_camera').subscribe({
      next: (results) => {
        console.log(results)
        if (results.result.status_code === 200) {

        } else {
          this.functionMain.presentToast(results.result.status_description, 'danger');
        }
      },
      error: (error) => {
        this.functionMain.presentToast('An error occurred!', 'danger');
        console.error(error);
      }
    });

  }

  handleRefresh(event: any) {
    this.loadConfig()
    setTimeout(() => {
      event.target.complete()
    }, 1000)
  }

  isLoading = false
  loadConfig() {
    this.isLoading = true
    this.clientMainService.getApi({ code: this.projectInfo.code }, '/intercom/post/login').subscribe({
      next: (results) => {
        this.isLoading = false
        console.log(results)
        if (results.result.status_code === 200) {
          Preferences.set({
            key: 'USER_INFO',
            value: results.result.access_token,
          }).then(() => {
            setTimeout(() => {
              this.getCurrentConfig()
            }, 300)
          })
        } else {
          this.functionMain.presentToast('An error occurred while logging into Intercom!', 'danger');
        }
      },
      error: (error) => {
        this.functionMain.presentToast('An error occurred while trying to get current config!', 'danger');
        console.error(error);
        this.isLoading = false
      }
    });
  }

  showScanModal = false
  showScanRecognitionModal = false
  scanModalTimeout: ReturnType<typeof setTimeout> | null = null;


  // Start face recognition scan modal
  async openScanRecognitionModal() {
    this.showScanRecognitionModal = true;
    this.isFaceRecognitionActive = true;
    this.isRecognizedSuccess = false;
    this.recognizedUserId = '';
    this.recognizedUserName = '';
    this.recognitionScore = 0;
    this.faceDetectionCount = 0;
    this.faceStatus = this.is_en ? 'Scanning for faces...' : '正在扫描人脸...';

    try {
      await this.webRtc.startScan();
      console.log('Face recognition started');
      this.functionMain.presentToast(this.is_en ? 'Face recognition started' : '已启动人脸识别', 'success');
    } catch (error) {
      console.error('Error starting face recognition:', error);
      this.functionMain.presentToast(this.is_en ? 'Failed to start face camera' : '启动人脸识别失败', 'danger');
    }

    // Clear existing timeout if any
    if (this.scanModalTimeout) {
      clearTimeout(this.scanModalTimeout);
    }

    // Set new timeout to auto-close the modal after 25s
    this.scanModalTimeout = setTimeout(() => {
      this.closeScanRecognitionModal();
    }, 25000);
  }

  // Stop face recognition and close modal
  async closeScanRecognitionModal() {
    if (this.scanModalTimeout) {
      clearTimeout(this.scanModalTimeout);
      this.scanModalTimeout = null;
    }

    // Stop face recognition camera
    if (this.isFaceRecognitionActive) {
      try {
        await this.webRtc.stopScan();
        console.log('Face recognition stopped');
      } catch (error) {
        console.error('Error stopping face recognition:', error);
      }
      this.isFaceRecognitionActive = false;
    }

    this.showScanRecognitionModal = false;
    this.isRecognizedSuccess = false;
    this.faceStatus = 'Ready to scan';
    this.faceDetectionCount = 0;
    this.recognizedUserId = '';
    this.recognizedUserName = '';
    this.recognitionScore = 0;
  }

  openScanModal() {
    // this.webRtc.startScan();
    this.webRtc.TestScan();
    this.showScanModal = true;

    // Clear existing timeout if any
    if (this.scanModalTimeout) {
      clearTimeout(this.scanModalTimeout);
    }

    // Set new timeout to auto-close the modal
    this.scanModalTimeout = setTimeout(() => {
      this.closeScanModal();
    }, 10000);
    // this.openScanRecognitionModal();
  }

  closeScanModal() {
    if (this.scanModalTimeout) {
      clearTimeout(this.scanModalTimeout);
      this.scanModalTimeout = null;
    }

    this.showScanModal = false;
  }

  currentBook: any = false

  isBookLoading = false
  loadBooking() {
    this.isBookLoading = true
    let params = {
      project_id: this.projectInfo.project_id,
      room_id: this.facilityInfo.room_id
    }
    this.clientMainService.getApi(params, '/intercom/get/booking_list').subscribe({
      next: (results) => {
        this.isBookLoading = false
        console.log(results)
        if (results.result.response_code === 200) {
          this.currentBook = results.result.bookings[0]
        } else {
          this.currentBook = false
          this.functionMain.presentToast('An error occurred while trying to fetch current booking!', 'danger');
        }
      },
      error: (error) => {
        this.currentBook = false
        this.functionMain.presentToast('An error occurred while trying to fetch current booking!', 'danger');
        console.error(error);
        this.isBookLoading = false
      }
    });
  }

  isKey = false
  changeKey() {
    this.isKey = !this.isKey
    this.loadTimeout()
  }

  timeoutId: any = null;
  loadTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(() => {
      this.closeModal();
      this.closeLogoutModal()
    }, 20000);
  }

  shortTimeoutId: any = null;
  loadShortTimeout() {
    if (this.shortTimeoutId) {
      clearTimeout(this.shortTimeoutId);
    }

    this.shortTimeoutId = setTimeout(() => {
      this.closeModal();
      this.closeLogoutModal()
    }, 5000);
  }

  isSetting = false

  logoutCode = ''
  showLogoutModal = false
  onLogoutClick() {
    this.showLogoutModal = true
    this.logoutCode = ''
    this.isSetting = false
    this.isSettingSwitch = false
    this.loadShortTimeout()
  }

  onSettingClick() {
    this.showLogoutModal = true
    this.logoutCode = ''
    this.isSetting = true
    this.isSettingSwitch = false
    this.loadShortTimeout()
  }

  closeLogoutModal() {
    this.showLogoutModal = false
    this.logoutCode = ''
    this.isSetting = false
  }

  onChangeLogoutCode() {
    if (this.isSetting) {
      this.loadShortTimeout()
    } else {
      this.loadShortTimeout()
    }
  }

  async onLogout() {
    if (this.logoutCode) {
      this.clientMainService.getApi({ code: this.logoutCode }, '/intercom/post/logout').subscribe({
        next: (results) => {
          if (results.result.status_code === 200) {
            this.showLogoutModal = false
            if (this.isSetting) {
              this.onOpenSettings()
            } else {
              this.functionMain.logout().then(() => {
                setTimeout(() => {
                  this.router.navigate(['/']);
                }, 300);
              })
            }
            this.closeLogoutModal()
          } else if (results.result.status_code === 401) {
            this.functionMain.presentToast(results.result.status_description, 'danger');
          } else {
            this.functionMain.presentToast('An error occurred while trying to verify the project code!', 'danger');
          }
        },
        error: (error) => {
          this.functionMain.presentToast('An error occurred while trying to verify the project code!', 'danger');
          console.error(error);
        }
      });
    } else {
      this.functionMain.presentToast('Project code is required!', 'warning')
    }
  }

  async onOpenSettings() {
    this.webRtc.onOpenSetting()
  }

  openGreenLed() {
    this.webRtc.openGreenLed()
  }

  openRedLed() {
    this.webRtc.openRedLed()
  }

  openWhiteLed() {
    this.webRtc.openWhiteLed()
  }

  closeLed() {
    this.webRtc.closeLed()
  }

  ringtoneDelay = false
  stopRingtone() {
    if (this.ringtoneDelay) return
    this.loadShortTimeout()
    this.ringtoneDelay = true
    setTimeout(() => {
      this.ringtoneDelay = false
    }, 3000);
    this.loadShortTimeout()
    this.webRtc.stopRingtone()
    this.webRtc.stopOutgoingRingtone()
  }

  startRingtone() {
    this.webRtc.playOutgoingRingtone()
  }

  isSettingSwitch = false
  openSettingSwitch() {
    this.loadShortTimeout()
    this.isSettingSwitch = true
  }

  // async rebootDevice() {
  //   console.log("Rebooting device...");
  //   try {
  //     await this.webRtc.rebootDevice();
  //   } catch (e) {
  //     console.error("Failed to reboot device", e);
  //     this.functionMain.presentToast("Failed to reboot device", "danger");
  //   }
  // }

  faceRefreshDelay = false
  async onRefreshCameraClick() {
    if (this.faceRefreshDelay) return
    this.loadShortTimeout()
    this.faceRefreshDelay = true
    setTimeout(() => {
      this.faceRefreshDelay = false
    }, 3000);
    this.functionMain.presentToast('Refreshing face camera...', 'dark');
    try {
      await this.webRtc.refreshFaceCamera();
      this.functionMain.presentToast('Camera refreshed successfully!', 'success');
    } catch (e) {
      console.error("Failed to refresh camera", e);
      this.functionMain.presentToast('Failed to refresh camera!', 'danger');
    }
  }

  pingTestDelay = false
  pingTest() {
    if (this.pingTestDelay) return
    this.loadShortTimeout()
    this.pingTestDelay = true
    this.clientMainService.getApi({}, '/api/test_connection').subscribe({
      next: (results) => {
        if (results.result) {
          this.functionMain.presentToast('Connection successful!', 'success');
        } else {
          this.functionMain.presentToast('Connection failed!', 'danger');
        }
        this.pingTestDelay = false
      },
      error: (error) => {
        this.functionMain.presentToast('Connection failed!', 'danger');
        this.pingTestDelay = false
        console.error(error);
      }
    });
  }

}
