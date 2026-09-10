import { Component, OnInit, OnDestroy } from '@angular/core';
import { WebRtcService } from 'src/app/service/fs-web-rtc/web-rtc.service';
import { Platform } from '@ionic/angular';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-ongoing-call',
  templateUrl: './ongoing-call.page.html',
  styleUrls: ['./ongoing-call.page.scss'],
})
export class OngoingCallPage implements OnInit {
  isReceiver: boolean = false;
  localstream!: MediaStream;
  onCam: boolean = true;
  onSpeaker: boolean = true;
  onMic: boolean = true;
  timer: number = 0;
  intervalId: any;
  userName: string = '';
  audioStatus!: Observable<string>;
  
  constructor(public webrtc: WebRtcService, private platform: Platform) {
    
  }
  
  ngOnInit() {
      this.audioStatus = this.webrtc.audioStatus.asObservable();
    const navigation = history.state;
    if (navigation && navigation.isReceiver) {
      this.isReceiver = navigation.isReceiver;
      this.userName = navigation.userName;
    }
    // this.webrtc.startLocalStream();
    this.webrtc.regenerateVideo();
    this.startTimer();
  }

  toggleCam(){
    this.onCam = !this.onCam;
    this.webrtc.muteLocalVideo();
  }
  toggleSpeaker(){
    this.onSpeaker = !this.onSpeaker;
    this.webrtc.muteRemoteSpeaker();
  }
  toggleMic(){
    this.onMic = !this.onMic;
    this.webrtc.muteLocalAudio();
  }

  endCall(){
    this.webrtc.endCall();
  }

  startTimer() {
    if (this.intervalId) {
      clearInterval(this.intervalId); // Jika timer sudah berjalan, hentikan terlebih dahulu
    }

    this.intervalId = setInterval(() => {
      this.timer++; // Tambahkan 1 detik setiap interval
    }, 1000); // Interval 1 detik
  }

  // Hentikan timer
  stopTimer() {
    if (this.intervalId) {
      clearInterval(this.intervalId); // Hentikan interval
    }
  }

  // Fungsi untuk format timer menjadi mm:ss
  get formattedTime(): string {
    const minutes = Math.floor(this.timer / 60);
    const seconds = this.timer % 60;
    return `${this.padZero(minutes)}:${this.padZero(seconds)}`;
  }

  // Fungsi untuk menambahkan angka 0 di depan jika kurang dari 10
  private padZero(value: number): string {
    return value < 10 ?  `0${value}` : `${value}`;
  }

  getCallerName(){
    return this.webrtc.getCallerName();
  }
  getReceiverName(){
    return this.webrtc.getReceiverName();
  }

  getSenderProfilePic(){
    return this.webrtc.getSenderProfilePic();
  }
  getReceiverProfilePic(){
    return this.webrtc.getReceiverProfilePic();
  }

  ngOnDestroy() {
    // Pastikan timer dihentikan ketika komponen dihancurkan
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

}
