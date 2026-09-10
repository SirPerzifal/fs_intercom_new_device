import { Injectable } from '@angular/core';
import { io } from 'socket.io-client';
import { ModalController, Platform, ToastController, LoadingController } from '@ionic/angular';
import { Router } from '@angular/router'; // Import Router
import { Capacitor } from '@capacitor/core';
import { WebView } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { jwtDecode } from 'jwt-decode';
import { OutgoingCallPage } from 'src/app/modules/call_module/outgoing-call/outgoing-call.page';
import { IncomingCallPage } from 'src/app/modules/call_module/incoming-call/incoming-call.page';
import { OngoingCallPage } from 'src/app/modules/call_module/ongoing-call/ongoing-call.page';
import { SplashCallPage } from 'src/app/modules/call_module/splash-call/splash-call.page';
import { ApiService } from '../api.service';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../resident/authenticate/authenticate.service';
import { StorageService } from '../storage/storage.service';
import { PushNotifications, Token } from '@capacitor/push-notifications';
import { BehaviorSubject } from 'rxjs';
import { registerPlugin } from '@capacitor/core';
import { AlertController } from '@ionic/angular';
import { MainVmsService } from '../vms/main-vms.service';

interface RingtonePlugin {
  play(): Promise<void>;
  stop(): Promise<void>;
  playOutgoing(): Promise<void>;
  stopOutgoing(): Promise<void>;
}

interface IntercomPlugin {
  openGateNative(): Promise<void>;
  closeGateNative(): Promise<void>;
  fetchDataImages(options: { id: string }): Promise<void>;
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  TestScan(): Promise<void>;
  startRecognition(): Promise<void>;
  stopRecognition(): Promise<void>;
  startApproachDetection(): Promise<void>;
  stopApproachDetection(): Promise<void>;
  openSettings(): Promise<void>;
  openGreenLed(): Promise<void>;
  openRedLed(): Promise<void>;
  openWhiteLed(): Promise<void>;
  closeLed(): Promise<void>;
  rebootDevice(): Promise<void>;
  refreshFaceCamera(): Promise<void>;
  restartApp(): Promise<void>;
}

const Ringtone = registerPlugin<RingtonePlugin>('Ringtone', {
  android: {
    pkg: 'io.ionic.starter.intercom.plugin',
    class: 'RingtonePlugin'
  }
});

const Intercom = registerPlugin<IntercomPlugin>('Intercom', {
  android: {
    pkg: 'io.ionic.starter.intercom.plugin',
    class: 'IntercomPlugin'
  }
});


@Injectable({
  providedIn: 'root'
})
export class WebRtcService extends ApiService {
  private socket: any;
  private peerConnection!: RTCPeerConnection;
  private localStream!: MediaStream;
  private remoteStream!: MediaStream;
  // private iceServers: RTCIceServer[] = [
  //   { urls: 'stun:stun.l.google.com:19302'},
  // ];
  private iceServers: RTCIceServer[] = [
    {
      "urls": "stun:relay17.expressturn.com:3478"
    },
    {
      "urls": "turn:relay17.expressturn.com:3478?transport=tcp",
      "username": "000000002072154862",
      "credential": "IUtn4d1i+sMuTM1lagsqrzsOBzI="
    }
  ]

  private activeModal: HTMLIonModalElement | null = null;
  private callerName: string = '';
  private receiverName: string = '';
  private hostCode: string = '';
  private unitId: string = '';
  private callerSocketId: any;
  private receiverSocketId: any;
  private nativeOffer: any;
  private targetSocketIds: any;
  private project_id: any;
  private callAction: string = '';
  private callerId: number = 0;
  private receiverId: number = 0;
  private userName: string = '';
  private userId: number = 0;
  // Stores the socket uniqueId (e.g. 'Intercom-36') set at connection time.
  // Used as a reliable callerId fallback when the page-level family_id isn't loaded yet.
  private intercomUniqueId: string = '';
  private modalLock = false;
  private pendingCandidates: RTCIceCandidate[] = [];
  private callerpendingCandidates: RTCIceCandidate[] = [];
  private remoteDescriptionSet = false;
  audioStatus = new BehaviorSubject<string>('');
  callActionStatus = new BehaviorSubject<string>('');
  private loadingElement: HTMLIonLoadingElement | null = null;

  constructor(http: HttpClient, private storage: StorageService, private toastController: ToastController, private modalController: ModalController,
    private router: Router, private platform: Platform, private alertController: AlertController, private mainVms: MainVmsService, private loadingController: LoadingController) {
    super(http);
    this.initializeSocket();
  }

  private listenForNativeEvents() {
    const storedAction = localStorage.getItem('callData');
    if (storedAction) {
      const parsedAction = JSON.parse(storedAction);
      if (Array.isArray(parsedAction) && parsedAction.length > 0) {
        const actionData = parsedAction[0];
        this.callerName = actionData.callerName;
        this.receiverName = actionData.receiverName;
        this.callerSocketId = actionData.callerSocketId;
        this.callAction = actionData.callAction;
        this.callActionStatus.next(actionData.callAction);
        // if (actionData.callAction === 'rejectCall'){
        //   this.rejectCall();
        // }
      }
      localStorage.removeItem('callData');
    }
  }

  async presentSingletonModal(component: any, componentProps: any = {}) {
    if (this.modalLock) return;
    this.modalLock = true;

    try {
      // Tutup semua modal aktif terlebih dahulu
      console.log("tututututp modallllllllllll===")
      let topModal = await this.modalController.getTop();
      while (topModal) {
        try {
          await topModal.dismiss();
        } catch (e) {
          console.warn('Gagal dismiss modal:', e);
        }
        topModal = await this.modalController.getTop();
      }

      const modal = await this.modalController.create({
        component,
        componentProps,
        backdropDismiss: false,
      });

      modal.onDidDismiss().then(() => {
        this.modalLock = false;
      });

      await modal.present();
    } catch (e) {
      console.error('Gagal membuka modal:', e);
      this.modalLock = false;
    }
    this.callActionStatus.next('');
  }

  // async showSplashScreen(){
  //   if (this.activeModal) {
  //     await this.activeModal.dismiss();
  //     this.activeModal = null;
  //   }
  //   this.activeModal = await this.modalController.create({
  //     component: SplashCallPage,
  //     backdropDismiss: false,
  //   });
  //   return await this.activeModal.present();
  // }

  //  async showOutgoingCallModal() {
  //   if (this.activeModal) {
  //     await this.activeModal.dismiss();
  //     this.activeModal = null;
  //   }
  //   this.activeModal = await this.modalController.create({
  //     component: OutgoingCallPage,
  //     componentProps: { receiverName: this.receiverName },
  //     backdropDismiss: false,
  //   });
  //   return await this.activeModal.present();
  // }

  // async showIncomingCallModal(offer: any) {
  //   if (this.activeModal) {
  //     await this.activeModal.dismiss();
  //     this.activeModal = null;
  //   }
  //   await this.playRingtone();
  //   this.activeModal = await this.modalController.create({
  //     component: IncomingCallPage,
  //     componentProps: { offer: offer, callerName: this.callerName },
  //     backdropDismiss: false,
  //   });
  //   return await this.activeModal.present();
  // }

  // async showOngoingCallModal(isReceiver: boolean) {
  //   if (this.activeModal) {
  //     await this.activeModal.dismiss();
  //     this.activeModal = null;
  //   }
  //   this.activeModal = await this.modalController.create({
  //     component: OngoingCallPage,
  //     componentProps: { isReceiver: isReceiver },
  //     backdropDismiss: false,
  //   });
  //   return await this.activeModal.present();
  // }

  async showIncomingCallModal(offer: any) {
    console.log("SHOW INCOMING MODAL", this.callerName)
    if (this.callerName) {
      await this.playRingtone();
      return this.presentSingletonModal(IncomingCallPage, {
        offer: offer,
        callerName: this.callerName,
      });
    }
  }

  async showOutgoingCallModal() {
    return this.presentSingletonModal(OutgoingCallPage, {
      receiverName: this.receiverName,
    });
  }

  async showOngoingCallModal(isReceiver: boolean) {
    const topModal = await this.modalController.getTop();
    if (topModal) {
      try {
        await topModal.dismiss();
      } catch (e) {
        console.warn('Gagal dismiss modal lama:', e);
      }
    }
    return this.presentSingletonModal(OngoingCallPage, {
      isReceiver,
    });
  }

  async showSplashScreen() {
    return this.presentSingletonModal(SplashCallPage);
  }

  private async resetCallData() {
    try {
      if (this.activeModal) {
        await this.activeModal.dismiss();
        this.activeModal = null;
      }

      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null!;
      }

      this.remoteStream = null!;

      if (this.peerConnection) {
        this.peerConnection.onicecandidate = null;
        this.peerConnection.ontrack = null;
        this.peerConnection.onconnectionstatechange = null;
        this.peerConnection.close();
        this.peerConnection = null!;
      }

      this.callerName = '';
      this.receiverName = '';
      this.unitId = '';
      this.callerSocketId = null;
      this.receiverSocketId = null;
      this.nativeOffer = null;
      this.targetSocketIds = null;
      this.project_id = null;
      this.callAction = '';
      this.pendingCandidates = [];
      this.callerpendingCandidates = [];
      this.remoteDescriptionSet = false;
      this.callActionStatus.next('');
      localStorage.removeItem('callData');

      // Approach detection disabled per client requirement (on-demand button is used instead)
    } catch (error) {
      console.error("Error during clearCallData:", error);
    }
  }


  // initializeSocket() {

  //   this.storage.getValueFromStorage('USESATE_DATA').then((value: any) => {
  //     this.storage.decodeData(value).then(async (value: any) => {

  //       if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
  //         this.socket.close();
  //       }

  //       let userInfo = {
  //         family_mobile_number: 'Public-User',
  //         family_id: '',
  //         family_name: 'Security',
  //         email: 'admin@example.com',
  //       }

  //       let clientInfo;

  //       if (value) {
  //         userInfo = JSON.parse(value);
  //         console.log("userInfo", userInfo)
  //       }

  //       if (!userInfo.family_id){
  //         console.log("masukk kesini");
  //         const clientData = await Preferences.get({ key: 'USER_INFO' });
  //         if (clientData.value) {
  //           let parsedClient = jwtDecode(clientData.value) as {name:string, family_id:number};
  //           userInfo.family_name = parsedClient.name;
  //           userInfo.family_id = parsedClient.family_id ? parsedClient.family_id.toString() : '';
  //         }
  //       }

  //       // this.presentToast(JSON.stringify(userInfo), 'danger');
  //       console.log("hereeee -->", userInfo);
  //       this.userName = userInfo.family_name ? userInfo.family_name : 'Security';
  //       this.userId = userInfo.family_id ? parseInt(userInfo.family_id, 10) || 0 : 0;
  //       this.socket.on('offer', (offer: any) => this.handleOffer(offer));
  //       this.socket.on('answer', (answer: any) => this.handleAnswer(answer));
  //       this.socket.on('ice-candidate', (candidate: any) => this.handleICECandidate(candidate));
  //       this.socket.on('end-call', () => this.handleEndCall());
  //       this.socket.on('reject-call', () => this.handleRejectCall());
  //       this.socket.on('user-not-found', (data: any) => this.handleUserNotFound(data));
  //       this.socket.on('receiver-info', (data: any) => this.handleReceiverInfo(data));
  //       this.socket.on('receiver-pending-call', (data: any) => this.handleReceiverPendingCall(data));
  //       this.socket.on('sender-pending-call', (data: any) => this.handleSenderPendingCall(data));
  //       this.listenForNativeEvents();
  //     }).catch(error => {
  //       console.error('Error fetching phone info:', error);
  //     });
  //   });
  // }

  async initializeSocket() {
    console.log("RUN INITIAL SOCKET")
    try {
      let userInfo = {
        family_mobile_number: 'Public-User',
        family_id: '',
        family_name: 'Security',
        email: 'admin@example.com',
      };

      // Coba ambil dari USESTATE_DATA
      // if (this.callAction){
      //   this.showSplashScreen();
      // }
      const storedValue = await this.storage.getValueFromStorage('USESATE_DATA');
      console.log(storedValue)
      if (storedValue) {
        try {
          const decoded = await this.storage.decodeData(storedValue);
          if (decoded) {
            const parsedResident = JSON.parse(decoded);
            if (parsedResident.family_id) {
              userInfo = parsedResident;
              console.log("Got userInfo from USESTATE_DATA", userInfo);
            }
          }
        } catch {
        }
      }

      if (!userInfo.family_id) {
        const clientData = await Preferences.get({ key: 'USER_INFO' });
        if (clientData.value) {
          const parsedClient = jwtDecode(clientData.value) as { intercom_name?: string; intercom_id?: number; family_id?: number; project_name?: string };
          const targetId = parsedClient.intercom_id || parsedClient.family_id;
          if (targetId) {
            userInfo.family_name = (parsedClient.intercom_name ? parsedClient.intercom_name + ' - ' : '') + (parsedClient.project_name || '');
            userInfo.family_id = 'Intercom-' + targetId.toString();
            console.log("Got userInfo from USER_INFO for Intercom", userInfo);
          }
        }
      }

      if (!userInfo.family_id) {
        const vmsData = await Preferences.get({ key: 'USER_INFO' }).then((result) => {
          if (result.value) {
            const parsedVMS = jwtDecode(result.value) as { project_name: string; project_id: number };
            if (parsedVMS.project_id && parsedVMS.project_name) {
              userInfo.family_name = parsedVMS.project_name;
              userInfo.family_id = 'Project-' + parsedVMS.project_id.toString();
            }
          }
        });
      }

      // Set default kalau tetap kosong
      if (!userInfo.family_id) {
        userInfo.family_mobile_number = 'Public-User';
        userInfo.family_id = 'Public-User';
        userInfo.family_name = 'Security';
        console.log("Fallback to default userInfo", userInfo);
      }

      // Tutup socket lama jika ada
      // Guard: skip re-init if already connected with a real identity.
      // But if we are connected with the fallback 'Public-User' identity (set before
      // the JWT was stored, e.g. when the service is created on APK cold-start) and
      // we now have a real intercom identity, disconnect and reconnect with the correct ID.
      const hasRealIdentity = this.intercomUniqueId && this.intercomUniqueId !== 'Public-User';
      const newIdentityIsReal = userInfo.family_id && userInfo.family_id !== 'Public-User';

      if (this.socket?.connected) {
        if (hasRealIdentity || !newIdentityIsReal) {
          // Already connected with a real identity, or the new identity is also a fallback → skip
          console.log('Socket already connected with real identity — skipping re-initialization');
          this.listenForNativeEvents();
          return;
        }
        // Connected as 'Public-User' but now we have real JWT data → reconnect
        console.log('[Socket] Reconnecting with real intercom identity:', userInfo.family_id);
        this.socket.disconnect();
      }
      if (this.socket && !this.socket.connected) {
        this.socket.disconnect();
      }

      // Setup user
      this.userName = userInfo.family_name || 'Security';
      this.userId = userInfo.family_id ? parseInt(userInfo.family_id, 10) || 0 : 0;
      // Always store the raw family_id string (e.g. 'Intercom-36') so createOffer
      // can use it as callerId even before page-level vmsPreferences() returns.
      this.intercomUniqueId = userInfo.family_id || 'Public-User';

      // Connect ke WebSocket
      console.log("hellooo hereeeee --->", userInfo.family_id);
      console.log(userInfo);
      // this.socket = io('http://192.168.1.146:8091', {
      this.socket = io('wss://ws.sgeede.com', {
        query: { uniqueId: userInfo.family_id || 'Public-User' },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        transports: ['websocket', 'polling'],
      });

      // Register event handlers
      this.socket.on('offer', (offer: any) => this.handleOffer(offer));
      this.socket.on('answer', (answer: any) => this.handleAnswer(answer));
      this.socket.on('ice-candidate', (candidate: any) => this.handleICECandidate(candidate));
      this.socket.on('end-call', () => this.handleEndCall());
      this.socket.on('reject-call', () => this.handleRejectCall());
      this.socket.on('call-timeout', () => this.handleRejectCall());
      this.socket.on('user-not-found', (data: any) => this.handleUserNotFound(data));
      this.socket.on('receiver-info', (data: any) => this.handleReceiverInfo(data));
      this.socket.on('receiver-pending-call', (data: any) => this.handleReceiverPendingCall(data));
      this.socket.on('sender-pending-call', (data: any) => this.handleSenderPendingCall(data));
      this.socket.on('open-modal-call', (data: any) => this.handleOngoingCallModal());
      this.socket.on('kick-user', (data: any) => this.handleKickUser(data));
      this.socket.on('intercom-open-gate', (data: any) => this.handleOpenGate(data));
      this.socket.on('intercom-close-gate', (data: any) => this.handleCloseGate(data));
      this.socket.on('intercom-stop-ringtone', (data: any) => this.stopRingtoneRtc(true));
      this.socket.on('intercom-refresh-camera', (data: any) => this.refreshFaceCamera(true));
      this.socket.on('intercom-restart-app', (data: any) => this.restartApp(true));

      // Listen for native events
      this.listenForNativeEvents();

    } catch (error) {
      console.error('Error during socket initialization:', error);
    }
  }

  async handleOpenGate(data: any) {
    try {
      await Intercom.openGateNative().then(() => {
        console.log("AFTER OPEN", data)
        console.log(this.receiverSocketId, this.callerSocketId)
        if (this.receiverSocketId && this.callerSocketId) {
          let family_id = 0
          let is_vms = false
          const is_rgg = (data && (data.opened_by === 'rgg' || data.opened_by === 'RGG')) ||
                         (this.callerId && this.callerId.toString().includes('RGG')) ||
                         (this.receiverId && this.receiverId.toString().includes('RGG'));

          if (this.callerId.toString().includes('Intercom')) {
            family_id = this.receiverId
            is_vms = false
            if (!family_id && !is_rgg) {
              is_vms = true
            }
          } else {
            family_id = this.callerId
            is_vms = false
            if (!family_id && !is_rgg) {
              is_vms = true
            }
          }
          this.mainVms.getApi({ family_id: (is_vms || is_rgg) ? false : parseInt(String(family_id)), is_vms: is_vms }, '/api/in_app_call_open_barrier').subscribe({
            next: (res) => console.log(res),
            error: (err) => console.error(err)
          });
          this.endCall()
          this.openSuccessAlert()
        }
      });
    } catch (error) {
      this.presentToast(('Error on opening gate' + String(error)), 'danger')
    }
  }

  async openSuccessAlert() {
    const alert = await this.alertController.create({
      cssClass: 'checkout-alert',
      message: 'Gate opened!',
    })
    await alert.present();

    setTimeout(() => {
      alert.dismiss();
    }, 5000);
  }

  async handleCloseGate(data: any) {
    await Intercom.closeGateNative();
  }

  async fetchDataImages() {
    await Intercom.fetchDataImages({
      id: "12345"
    });
  }

  async startScan() {
    await Intercom.startScan();
  }

  async stopScan() {
    await Intercom.stopScan();
  }

  async TestScan() {
    await Intercom.TestScan();
  }

  async refreshFaceCamera(is_remote: boolean = false) {
    if (is_remote) {
      this.presentToast('Remote: Refresh Camera.')
    }
    await Intercom.refreshFaceCamera();
  }

  async restartApp(is_remote: boolean = false) {
    if (is_remote) {
      this.presentToast('Remote: Restart app.')
    }
    await Intercom.restartApp();
  }

  async stopRingtoneRtc(is_remote: boolean = false) {
    if (is_remote) {
      this.presentToast('Remote: Stop ringtone.')
    }
    await this.stopRingtone();
    await this.stopOutgoingRingtone();
  }

  closeSocket() {
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      this.socket.close();
    }
  }

  async playRingtone() {
    if (Capacitor.getPlatform() === 'android') {
      try {
        await Ringtone.stop();
        await Ringtone.play();
      } catch (err) {
        console.error('Ringtone error:', err);
      }
    } else {
      console.log('Ringtone not supported on this platform.');
    }
  }

  async playOutgoingRingtone() {
    if (Capacitor.getPlatform() === 'android') {
      try {
        await Ringtone.stopOutgoing();
        await Ringtone.playOutgoing();
      } catch (err) {
        console.error('Ringtone Outgoing error:', err);
      }
    } else {
      console.log('Ringtone not supported on this platform.');
    }
  }

  async stopRingtone() {
    if (Capacitor.getPlatform() === 'android') {
      try {
        await Ringtone.stop();
      } catch (err) {
        console.error('Ringtone error:', err);
      }
    } else {
      console.log('Ringtone not supported on this platform.');
    }
  }

  async stopOutgoingRingtone() {
    if (Capacitor.getPlatform() === 'android') {
      try {
        await Ringtone.stopOutgoing();
      } catch (err) {
        console.error('Ringtone outgoing error:', err);
      }
    } else {
      console.log('Ringtone not supported on this platform.');
    }
  }

  cameraList: any = false

  // async startLocalStream(): Promise<boolean> {
  //   await this.showLoading('Call on process...')
  //   try {
  //     console.log(navigator)
  //     const devices = await navigator.mediaDevices.enumerateDevices();
  //     const videoDevices = devices.filter(d => d.kind === 'videoinput');

  //     this.cameraList = videoDevices

  //     // const preferredCamera = videoDevices[videoDevices.length - 1];
  //     const preferredCamera = videoDevices[0];


  //     const constraints = {
  //       video: (preferredCamera && preferredCamera.deviceId) ? { deviceId: { ideal: preferredCamera.deviceId } } : true,
  //       audio: true
  //     };

  //     console.log('Requesting media permissions...');

  //     // Stop Intercom Activities to release Camera hardware
  //     try {
  //       console.log("Stopping Intercom activities for video call...");
  //       await Intercom.stopApproachDetection();
  //       await Intercom.stopScan();
  //       await Intercom.stopRecognition();
  //     } catch (e) {
  //       console.error("Error stopping Intercom:", e);
  //     }

  //     // 3. Request stream dengan error handling yang lebih detail
  //     this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

  //     if (!this.localStream) {
  //       console.error('Failed to get media stream');
  //       return false;
  //     }

  //     console.log('Media stream obtained successfully');

  //     // 4. Handle video element dengan iOS-specific considerations
  //     const videoElement: HTMLVideoElement = document.getElementById('local-video') as HTMLVideoElement;
  //     if (videoElement) {
  //       // iOS Safari memerlukan properti tambahan
  //       videoElement.srcObject = this.localStream;
  //       videoElement.muted = true; // Penting untuk iOS - hindari feedback
  //       videoElement.playsInline = true; // Crucial untuk iOS - hindari fullscreen
  //       videoElement.autoplay = true; // iOS Safari memerlukan autoplay

  //       // iOS Safari kadang memerlukan user interaction untuk play
  //       try {
  //         await videoElement.play();
  //         console.log('Video element playing successfully');
  //       } catch (playError) {
  //         console.warn('Auto-play failed, might need user interaction:', playError);
  //         // Untuk iOS, kadang perlu user click untuk trigger play
  //         // Anda bisa show button "Tap to start" jika auto-play gagal
  //       }
  //     } else {
  //       console.warn('Video element not found');
  //     }

  //     return true;
  //   } catch (error) {
  //     console.error('Error starting local stream:', error);

  //     let errMsg = 'Unknown error';
  //     if (error instanceof Error) {
  //       errMsg = `${error.name}: ${error.message}`;
  //       if (error.name === 'NotAllowedError') {
  //         console.error('Permission denied by user');
  //       } else if (error.name === 'NotFoundError') {
  //         console.error('No audio input device found');
  //       } else if (error.name === 'NotReadableError') {
  //         console.error('Audio device is already in use');
  //       } else if (error.name === 'OverconstrainedError') {
  //         console.error('Constraints cannot be satisfied');
  //       } else if (error.name === 'SecurityError') {
  //         console.error('Security error - HTTPS required');
  //       }
  //     } else {
  //       errMsg = JSON.stringify(error);
  //       console.error('Unknown error type:', error);
  //     }

  //     this.alertController.create({
  //       header: 'Camera/Mic Error',
  //       message: 'Detail: ' + errMsg,
  //       buttons: ['OK']
  //     }).then(alert => alert.present());

  //     return false;
  //   } finally {
  //     await this.dismissLoading();
  //   }
  // }

  async showLoading(message: string) {
    try {
      await this.dismissLoading();
      this.loadingElement = await this.loadingController.create({
        // message: message,
        cssClass: 'transparent-loading',
        backdropDismiss: false,
        spinner: 'crescent'
      });
      await this.loadingElement.present();
    } catch (e) {
      console.error("Error showing loading spinner:", e);
    }
  }

  async dismissLoading() {
    try {
      if (this.loadingElement) {
        await this.loadingElement.dismiss();
        this.loadingElement = null;
      }
    } catch (e) {
      console.error("Error dismissing loading spinner:", e);
    }
  }

  // ------------------------- NEW INTERCOM TEST
  // async startLocalStream(): Promise<boolean> {
  //   await this.showLoading('Call on process...')
  //   try {
  //     console.log(navigator);
  //     console.log('Stopping Intercom activities to release camera hardware...');

  //     let audio = {
  //       echoCancellation: true,
  //       noiseSuppression: true,
  //       autoGainControl: true,
  //       sampleRate: 44100,
  //       channelCount: 1
  //     }
  //     console.log('Get audio constraint...');

  //     try {
  //       await Intercom.stopApproachDetection();
  //       await Intercom.stopScan();
  //       await Intercom.stopRecognition();
  //       console.log('Stopping intercom scan and recog...');
  //     } catch (e) {
  //       console.error("Error stopping Intercom:", e);
  //     }
  //     // Jeda 1 detik agar driver kamera native benar-benar selesai menutup
  //     // await new Promise(resolve => setTimeout(resolve, 1500));

  //     // Trigger dummy getUserMedia jika label/id kamera kosong (indikasi WebView belum terotorisasi)
  //     console.log('Generate dummy camera...');
  //     try {
  //       const initialDevices = await navigator.mediaDevices.enumerateDevices();
  //       console.log('Check 1...');
  //       const needsPermissionTrigger = initialDevices.length === 0 ||
  //         initialDevices.some(d => d.kind === 'videoinput' && d.label === '');
  //       console.log('Check 2...');
  //       if (needsPermissionTrigger) {
  //         console.log('Camera labels are empty. Requesting camera/mic access via dummy getUserMedia to authorize WebView...');
  //         const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  //         console.log('Check 3...');
  //         tempStream.getTracks().forEach(track => track.stop());
  //         console.log('Dummy getUserMedia success: WebView now authorized.');

  //         // Jeda 1.5 detik agar driver kamera Rockchip sempat melepas hardware sepenuhnya
  //       }
  //       console.log('Check 4...');
  //     } catch (permError) {
  //       console.warn('Failed or bypassed dummy getUserMedia:', permError);
  //     }

  //     // this.presentToast('Checking camera list...', 'dark');
  //     console.log('Checking available media devices...');
  //     let videoDevices: MediaDeviceInfo[] = [];

  //     // Deteksi kamera
  //     for (let attempt = 1; attempt <= 3; attempt++) {
  //       const devices = await navigator.mediaDevices.enumerateDevices();
  //       videoDevices = devices.filter(d => d.kind === 'videoinput' && d.label !== '');

  //       // Fallback jika tidak ada kamera yang terdeteksi dengan label
  //       if (videoDevices.length === 0) {
  //         videoDevices = devices.filter(d => d.kind === 'videoinput');
  //       }

  //       console.log(`[Camera Query] Attempt ${attempt}: found ${videoDevices.length} video devices`);

  //       // Jika sudah menemukan kamera asli dengan label, langsung selesai
  //       if (videoDevices.length > 0 && videoDevices[0].label !== '') {
  //         break;
  //       }
  //       if (attempt < 3) {
  //         await new Promise(resolve => setTimeout(resolve, 500));
  //       }
  //     }
  //     this.cameraList = videoDevices;
  //     let constraints: MediaStreamConstraints;
  //     if (videoDevices.length > 0) {
  //       const preferredCamera = videoDevices[videoDevices.length - 1];
  //       // Cek jika deviceId valid (bukan string kosong) untuk menghindari crash NullPointerException di Chromium
  //       if (preferredCamera.deviceId && preferredCamera.deviceId !== '') {
  //         constraints = {
  //           video: { deviceId: { ideal: preferredCamera.deviceId } },
  //           audio: audio
  //         };
  //       } else {
  //         constraints = {
  //           video: true,
  //           audio: audio
  //         };
  //       }

  //       // Tampilkan toast bahwa kamera terdeteksi dan video dimulai
  //       // this.presentToast(`Camera detected: ${preferredCamera.label || 'Main Cam'}...`, 'success');
  //       console.log('Requesting video stream using device:', preferredCamera.label || preferredCamera.deviceId);
  //     } else {
  //       constraints = {
  //         video: false,
  //         audio: audio
  //       };

  //       // Tampilkan toast peringatan bahwa kamera tidak terdeteksi (fallback ke suara)
  //       // this.presentToast('Camera not detected! voice only call.', 'warning');
  //       console.warn('WARNING: No video input devices found. Falling back to audio-only stream to prevent Chromium NullPointerException crash.');
  //     }
  //     console.log('Requesting media permissions with constraints:', constraints);
  //     this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
  //     if (!this.localStream) {
  //       // this.presentToast('Failed to proess audio/video media stream.', 'danger');
  //       console.error('Failed to get media stream');
  //       return false;
  //     }
  //     console.log('Media stream obtained successfully');
  //     return true;
  //   } catch (error) {
  //     let errMsg = 'Unknown error';
  //     if (error instanceof Error) {
  //       errMsg = `${error.name}: ${error.message}`;
  //     }
  //     return false;
  //   } finally {
  //     await this.dismissLoading();
  //   }
  // }

  async startLocalStream(): Promise<boolean> {
    await this.showLoading('Call on process...')
    try {
      console.log(navigator);
      console.log('Stopping Intercom activities to release camera hardware...');

      let audio = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 44100,
        channelCount: 1
      }
      console.log('Get audio constraint...');

      try {
        await Intercom.stopApproachDetection();
        await Intercom.stopScan();
        await Intercom.stopRecognition();
        console.log('Stopping intercom scan and recog...');
      } catch (e) {
        console.error("Error stopping Intercom:", e);
      }

      // this.presentToast('Checking camera list...', 'dark');
      console.log('Checking available media devices...');
      let constraints = {
        audio: audio
      };

      console.log('Requesting media permissions with constraints:', constraints);
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!this.localStream) {
        // this.presentToast('Failed to proess audio/video media stream.', 'danger');
        console.error('Failed to get media stream');
        return false;
      }
      console.log('Media stream obtained successfully');
      return true;
    } catch (error) {
      let errMsg = 'Unknown error';
      if (error instanceof Error) {
        errMsg = `${error.name}: ${error.message}`;
      }
      return false;
    } finally {
      await this.dismissLoading();
    }
  }

  async regenerateVideo() {
    if (!navigator.mediaDevices) {
      return;
    }
    console.log("REGENERATE VIDEO")
    const videoElement: HTMLVideoElement = document.getElementById('local-video') as HTMLVideoElement;
    if (videoElement) {
      console.log("SET VIDEO ELEMENT")
      videoElement.srcObject = this.localStream;
      await videoElement.play();
      videoElement.muted = true;
    }
    const remoteVideo: HTMLVideoElement = document.getElementById('remote-video') as HTMLVideoElement;
    if (remoteVideo) {
      console.log("SET VIDEO ELEMENT2222")
      remoteVideo.srcObject = this.remoteStream;
      await remoteVideo.play();
    }
  }

  async createOffer(receiverPhone: any = false, receiverId: any = false, unit_id: any = false, isResident: any = false, family_id: any = false) {
    if (!receiverId && !receiverPhone && !unit_id) {
      return;
    }

    await this.startLocalStream();

    this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers, iceTransportPolicy: 'all' });

    console.log('this.localStreamthis.localStreamthis.localStream', this.localStream)
    this.localStream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, this.localStream);
    });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('ice-candidate', event.candidate);
        this.callerpendingCandidates.push(event.candidate);
      }
    };
    console.log("this perrrrrrr==========");
    console.log(this.peerConnection);

    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      const remoteVideo: HTMLVideoElement = document.getElementById('remote-video') as HTMLVideoElement;
      if (remoteVideo) {
        remoteVideo.srcObject = this.remoteStream;
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection.iceConnectionState;

      switch (state) {
        case "checking":
          this.updateAudioStatus("Connecting audio...");
          break;
        case "connected":
        case "completed":
          this.updateAudioStatus("Audio connected");
          break;
      }
    };

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    this.unitId = unit_id
    this.callerName = this.userName;

    this.callerId = this.userId;
    // ✅ FIX: Use the socket uniqueId as the reliable callerId fallback.
    // In the APK build, 'family_id' (passed from the page component via getCurrentConfig)
    // is sometimes undefined at call time because vmsPreferences() hasn't returned yet.
    // this.intercomUniqueId is set once at socket connection time from the JWT and is
    // always correct (e.g. 'Intercom-36'), preventing 'Public-User' from being sent.
    const reliableCallerId = family_id || this.intercomUniqueId;
    this.socket.emit('offer', {
      offerObj: offer,
      receiverPhone: receiverPhone,
      receiverId: receiverId,
      callerName: this.callerName,
      callerId: reliableCallerId,
      unitId: unit_id,
      isResident: isResident,
      isIntercomToUnit: unit_id ? true : false,
    });

  }

  async receiverConnected() {
    this.socket.emit('receiver-connected', {});
  }

  async handleOffer(offer: any) {
    await this.startLocalStream();
    if (!this.peerConnection) {
      this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers, iceTransportPolicy: 'all' });

      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit('ice-candidate', event.candidate);
        }
      };

      this.peerConnection.ontrack = (event) => {
        this.remoteStream = event.streams[0];
        const remoteVideo: HTMLVideoElement = document.getElementById('remote-video') as HTMLVideoElement;
        if (remoteVideo) {
          remoteVideo.srcObject = this.remoteStream;
        }
      };
      this.peerConnection.oniceconnectionstatechange = () => {
        const state = this.peerConnection.iceConnectionState;

        switch (state) {
          case "checking":
            this.updateAudioStatus("Connecting audio...");
            break;
          case "connected":
          case "completed":
            this.updateAudioStatus("Audio connected");
            break;
        }
      };
    } else {
    }
    this.callerName = offer.callerName;
    this.callerId = offer.callerId;
    this.receiverId = offer.receiverId;
    this.receiverName = offer.receiverName;
    this.callerSocketId = offer.callerSocketId;
    this.receiverSocketId = offer.receiverSocketId;
    this.targetSocketIds = offer.targetSocketIds;
    this.project_id = offer.project_id;

    // Default Accept call: show incoming modal
    // await this.showIncomingCallModal(offer.offerObj);

    // Auto Accept Call instead of showing incoming modal
    this.acceptCall(offer.offerObj);
  }




  async handleAnswer(answer: any) {
    await this.stopOutgoingRingtone();
    await this.stopRingtone();

    this.callerName = answer.callerName;
    this.unitId = ''
    this.receiverName = this.checkIfSecurity(answer.receiverName) ? answer.receiverName : answer.hostCode;
    this.receiverSocketId = answer.receiverSocketId;

    console.log(this.peerConnection);
    console.log("this perrrrrrr========== handle answerrrrr here1111111");
    const description = new RTCSessionDescription(answer.answerObj);
    await this.peerConnection.setRemoteDescription(description);
    console.log(this.peerConnection);
    console.log("this perrrrrrr========== handle answerrrrr here1111111");
    this.remoteDescriptionSet = true;
    for (const candidate of this.pendingCandidates) {
      await this.peerConnection.addIceCandidate(candidate);
    }
    console.log(this.peerConnection);
    console.log("this perrrrrrr========== handle answerrrrr here11111112222");

    console.log('Before modal:', this.peerConnection);
    await this.showOngoingCallModal(false);
    // await new Promise(resolve => setTimeout(resolve, 500));
    console.log(this.peerConnection);
    console.log("this perrrrrrr========== handle answerrrrr here2222333");
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      if (!this.remoteStream) {
        const remoteVideo: HTMLVideoElement = document.getElementById('remote-video') as HTMLVideoElement;
        if (remoteVideo) {
          remoteVideo.srcObject = this.remoteStream;
        }
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection.iceConnectionState;

      switch (state) {
        case "checking":
          this.updateAudioStatus("Connecting audio...");
          break;
        case "connected":
        case "completed":
          this.updateAudioStatus("Audio connected");
          break;
      }
    };
  }

  async handleICECandidate(candidate: RTCIceCandidate): Promise<void> {
    const iceCandidate = new RTCIceCandidate(candidate);
    console.log("ICE CANDIDATE RECEIVED called kah?", iceCandidate);
    if (this.remoteDescriptionSet) {
      await this.peerConnection.addIceCandidate(iceCandidate);
    } else {
      this.pendingCandidates.push(iceCandidate);
    }
  }

  async handleSenderPendingCall(data: any) {
    this.receiverSocketId = data.receiverSocketId;
    this.receiverId = data.receiverId;
    console.log("handleSenderPendingCall================", data)

    for (const candidate of this.callerpendingCandidates) {
      this.socket.emit('ice-candidate', candidate);
    }
  }

  family_id: any = false
  decoded: any = {}
  async handleKickUser(data: any) {
    // this.family_id = false
    // this.decoded = {}
    // const clientData = (await Preferences.get({ key: 'USER_INFO' })).value;
    // const storedValue = await this.storage.getValueFromStorage('USESATE_DATA');
    // if (clientData) {
    //   try {
    //     console.log("THING 1")
    //     this.decoded = jwtDecode(clientData)
    //     this.family_id = this.decoded.family_id
    //     console.log(this.decoded)
    //   } catch (error) {
    //     this.decoded = JSON.parse(await this.storage.decodeData(storedValue));
    //     console.log(this.decoded)
    //     this.family_id = this.decoded.family_id
    //   }
    // } else if (storedValue) {
    //   try {
    //     this.decoded = JSON.parse(await this.storage.decodeData(storedValue));
    //     console.log(this.decoded)
    //     this.family_id = this.decoded.family_id
    //   } catch (error) {
    //     console.log(error)
    //     this.decoded ={}
    //     this.family_id = false
    //   }
    // } else {
    //   this.decoded ={}
    //   this.family_id = false
    // }
    // if (this.family_id) {
    //   this.http.post<any>(`${this.baseUrl}/get/fcm_token`, {jsonrpc: '2.0', params: {family_id: this.family_id}}).subscribe(
    //     res => {
    //       console.log(res)
    //       if (res.result['status_code'] == 200) {
    //         var fcm_token = res.result['status_desc'];
    //         this.getFCMToken().then(token => {
    //           if(token != fcm_token){
    //             console.log(this.platform.platforms(), this.platform.platforms().join(', '));

    //             const isDesktop = this.platform.is('mobileweb') || this.platform.is('desktop');
    //             console.log("Is Dekstop", isDesktop);

    //             if (isDesktop) {
    //               console.log("Your in desktop device", isDesktop);
    //             } else {
    //               this.presentToast('Your about to get kick out from application in 3 second because your account has been login on another device.', 'warning')
    //               console.log('Your about to get kick out from application in 3 second because your account has been login on another device.', 'warning');
    //               setTimeout(()=>{
    //                 this.closeSocket();
    //                 this.storage.clearAllValueFromStorage();
    //                 Preferences.clear();
    //                 this.router.navigate(['']);
    //               }, 3000)
    //             }
    //           }else{
    //           }
    //         });
    //       } else {
    //         console.log("ERROR OVER HEY")
    //       }
    //     },
    //     error => {
    //       console.log(error)
    //     }
    //   )          
    // }
  }

  async getFCMToken(): Promise<string | null> {
    try {
      if (!Capacitor.isNativePlatform()) {
        return null;
      }

      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== 'granted') {
        return null;
      }

      return new Promise((resolve, reject) => {
        PushNotifications.addListener('registration', (token) => {
          resolve(token.value);
        });

        PushNotifications.addListener('registrationError', (error) => {
          reject(null);
        });

        PushNotifications.register();
      });
    } catch (error) {
      return null;
    }
  }

  async handleReceiverPendingCall(data: any) {
    console.log("handleReceiverPendingCall================", data)
    this.nativeOffer = data.offerObj;
    this.callerId = data.callerId;
    this.callerSocketId = data.callerSocketId;
    this.receiverSocketId = data.receiverSocketId;
    this.targetSocketIds = data.targetSocketIds;
    this.project_id = data.project_id;
    if (this.callAction === 'acceptCall') {
      await this.startLocalStream();
      if (!this.peerConnection) {
        // Inisialisasi peerConnection untuk User 2
        this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers, iceTransportPolicy: 'all' });

        // Pastikan remote stream belum ada
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }

        // Set up ICE candidate handler
        this.peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            this.socket.emit('ice-candidate', event.candidate);
          }
        };

        // Set up track handler untuk remote video
        this.peerConnection.ontrack = (event) => {
          this.remoteStream = event.streams[0];
          const remoteVideo: HTMLVideoElement = document.getElementById('remote-video') as HTMLVideoElement;
          if (remoteVideo) {
            remoteVideo.srcObject = this.remoteStream;
          }
        };
        this.peerConnection.oniceconnectionstatechange = () => {
          const state = this.peerConnection.iceConnectionState;

          switch (state) {
            case "checking":
              this.updateAudioStatus("Connecting audio...");
              break;
            case "connected":
            case "completed":
              this.updateAudioStatus("Audio connected");
              break;
          }
        };
      } else {
      }

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(this.nativeOffer));
      this.remoteDescriptionSet = true;
      for (const candidate of this.pendingCandidates) {
        await this.peerConnection.addIceCandidate(candidate);
      }

      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.socket.emit('answer', {
        answerObj: answer,
        receiverName: this.receiverName,
        callerName: this.callerName,
        callerSocketId: this.callerSocketId,
        receiverSocketId: data.receiverSocketId,
      });

      await this.showOngoingCallModal(true);
    } else if (this.callAction === 'rejectCall') {
      this.rejectCall();
      // }else if(this.callAction === 'openDialogCall'){
    } else {
      await this.startLocalStream();
      if (!this.peerConnection) {
        this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers, iceTransportPolicy: 'all' });

        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }

        this.peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            this.socket.emit('ice-candidate', event.candidate);
          }
        };

        this.peerConnection.ontrack = (event) => {
          this.remoteStream = event.streams[0];
          const remoteVideo: HTMLVideoElement = document.getElementById('remote-video') as HTMLVideoElement;
          if (remoteVideo) {
            remoteVideo.srcObject = this.remoteStream;
          }
        };
        this.peerConnection.oniceconnectionstatechange = () => {
          const state = this.peerConnection.iceConnectionState;

          switch (state) {
            case "checking":
              this.updateAudioStatus("Connecting audio...");
              break;
            case "connected":
            case "completed":
              this.updateAudioStatus("Audio connected");
              break;
          }
        };
      }

      await this.showIncomingCallModal(this.nativeOffer);
    }
  }


  async acceptCall(offer: any) {
    await this.stopRingtone();
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    this.remoteDescriptionSet = true;
    for (const candidate of this.pendingCandidates) {
      await this.peerConnection.addIceCandidate(candidate);
    }

    this.localStream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, this.localStream);
    });

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.socket.emit('answer', {
      answerObj: answer,
      receiverName: this.receiverName,
      callerName: this.callerName,
      callerSocketId: this.callerSocketId,
      receiverSocketId: this.receiverSocketId
    });
  }

  async handleOngoingCallModal() {
    if (this.targetSocketIds) {
      let newTargetSocketIds = this.targetSocketIds.filter((target: any) => target != this.receiverSocketId);
      this.socket.emit('reject-call', {
        targetSocketIds: newTargetSocketIds,
        project_id: this.project_id,
        unitId: this.unitId
      });
    }
    await this.showOngoingCallModal(true);
  }

  async endCall() {
    console.log("END CALL CALLED ===================???")
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null!;
    }

    if (this.socket) {
      this.socket.emit('end-call', {
        receiverSocketId: this.receiverSocketId,
        callerSocketId: this.callerSocketId
      });
    }
    await this.closeModal();
    this.resetCallData();
  }

  async handleEndCall() {
    console.log("END CALL CALLED ===================??? hereee")
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null!;
    }
    await this.closeModal();
    this.resetCallData();
  }

  async handleRejectCall() {
    await this.stopOutgoingRingtone();
    await this.stopRingtone();
    await this.closeModal();
    this.resetCallData();
  }

  async rejectCall() {
    await this.stopOutgoingRingtone();
    await this.stopRingtone();
    this.socket.emit('reject-call', {
      callerSocketId: this.callerSocketId,
      receiverSocketId: this.receiverSocketId,
      targetSocketIds: this.targetSocketIds,
      project_id: this.project_id,
      receiverId: this.receiverId,
      callerId: this.callerId,
      callerName: this.callerName,
      unitId: this.unitId
    });
    await this.closeModal();
    this.resetCallData();
  }

  muteLocalAudio() {
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
    }
  }

  muteLocalVideo() {
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
    }
  }

  muteRemoteSpeaker() {
    const videoElement: HTMLVideoElement = document.getElementById('remote-video') as HTMLVideoElement;
    if (videoElement) {
      videoElement.muted = !videoElement.muted;
    }
  }

  async handleReceiverInfo(data: any) {
    this.callerId = data.callerId;
    this.receiverId = data.receiverId;
    this.callerName = data.callerName;
    this.receiverName = this.checkIfSecurity(data.receiverName) ? data.receiverName : data.hostCode;
    this.callerSocketId = data.callerSocketId;
    this.receiverSocketId = data.receiverSocketId;
    this.targetSocketIds = data.targetSocketIds;
    this.project_id = data.project_id;
    await this.playOutgoingRingtone();
    await this.showOutgoingCallModal();
  }

  async handleUserNotFound(data: any) {
    await this.rejectCall();
    this.presentToast(data.message, 'danger');
  }

  async presentToast(message: string, color: 'success' | 'danger' | 'warning' | 'dark' = 'success') {
    const toast = await this.toastController.create({
      message: message,
      duration: 4000,
      color: color
    });
    toast.present();
  }


  async closeModal() {
    const topModal = await this.modalController.getTop();
    if (topModal) {
      try {
        await topModal.dismiss();
      } catch (e) {
        console.warn('Gagal dismiss modal aktif:', e);
      }
    }
  }

  getCallerName() {
    return this.callerName;
  }
  getReceiverName() {
    return this.receiverName;
  }

  getSenderProfilePic() {
    return this.checkIfSecurity(this.callerName, true) ? `${this.baseUrl}/web/image/fs.residential.family/${this.callerId}/image_profile` : false;
  }
  getReceiverProfilePic() {
    return this.checkIfSecurity(this.receiverName, true) ? `${this.baseUrl}/web/image/fs.residential.family/${this.receiverId}/image_profile` : false;
  }

  checkIfSecurity(name: any, is_pic: boolean = false) {
    if (!name) return false
    if (name.includes('Security') || name.includes('Command Center') || this.unitId) {
      if (is_pic) {
        if (name.includes('Security') || name.includes('Command Center')) {
          return true
        } else {
          return false
        }
      } else {
        return true
      }
    } else {
      return false
    }
  }

  updateAudioStatus(status: string) {
    this.audioStatus.next(status);
  }

  async onOpenSetting() {
    try {
      await Intercom.openSettings();
      console.log('Settings opened successfully');
    } catch (error) {
      console.error('Error opening settings:', error);
      this.presentToast(('ERROR IN HERE' + String(error)), 'danger')
      // Show error toast if needed
    }
  }

  openGreenLed() {
    Intercom.openGreenLed()
  }

  openRedLed() {
    Intercom.openRedLed()
  }

  openWhiteLed() {
    Intercom.openWhiteLed()
  }

  closeLed() {
    Intercom.closeLed()
  }


}
