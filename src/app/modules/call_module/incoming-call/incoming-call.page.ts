import { Component, OnInit } from '@angular/core';
import { WebRtcService } from 'src/app/service/fs-web-rtc/web-rtc.service';

@Component({
  selector: 'app-incoming-call',
  templateUrl: './incoming-call.page.html',
  styleUrls: ['./incoming-call.page.scss'],
})
export class IncomingCallPage implements OnInit {

  offer: any;
  callerName: string = '';
  constructor(private webrtc: WebRtcService) { }

  ngOnInit() {
    this.autoEnd();
    const navigation = history.state;
    if (navigation && navigation.offer) {
      this.offer = navigation.offer;
      this.callerName = navigation.callerName;
    }
  }

  acceptCall(){
    this.webrtc.acceptCall(this.offer);
    clearTimeout(this.timeoutId);
  }

  rejectCall(){
    this.webrtc.rejectCall();
    clearTimeout(this.timeoutId);
  }

  getSenderProfilePic(){
    return this.webrtc.getSenderProfilePic();
  }

  timeoutId: any = false

  autoEnd() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(() => {
      this.rejectCall();
    }, 45000);
  }

  ionViewWillLeave() {
    console.log('\n\nPage is about to leave');
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

}
