import { Component, OnInit } from '@angular/core';
import { WebRtcService } from 'src/app/service/fs-web-rtc/web-rtc.service';

@Component({
  selector: 'app-outgoing-call',
  templateUrl: './outgoing-call.page.html',
  styleUrls: ['./outgoing-call.page.scss'],
})
export class OutgoingCallPage implements OnInit {

  receiverName: string = '';
  constructor(public webrtc: WebRtcService) { }

  ngOnInit() {
    const navigation = history.state;
    this.autoEnd();
    if (navigation && navigation.offer) {
      this.receiverName = navigation.receiverName;
    }
  }

  rejectCall() {
    this.webrtc.rejectCall();
  }

  getReceiverProfilePic() {
    return this.webrtc.getReceiverProfilePic();
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
