import { Component } from '@angular/core';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
import { fab } from '@fortawesome/free-brands-svg-icons';
import { App } from '@capacitor/app';
// import { Preferences } from '@capacitor/preferences';


@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  constructor(library: FaIconLibrary) {
    library.addIconPacks(fas, far, fab);
    // Preferences.set({ key: 'usePreferredTextZoom', value: 'false' });
    App.addListener('appStateChange', async ({ isActive }) => {
    });
  }

}
