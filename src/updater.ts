import type { AppUpdater } from 'electron-updater';
type Updater = Pick<AppUpdater, 'autoDownload' | 'autoInstallOnAppQuit' | 'on' | 'checkForUpdates' | 'downloadUpdate' | 'quitAndInstall'>;

export class Updates {
  private status = { phase: 'idle', message: 'Click Update to check for new features.', progress: 0 };
  constructor(private supported: boolean, private updater: Updater) {
    if (!supported) {
      this.status = { phase: 'unsupported', message: 'Updates are available in the installed Windows app.', progress: 0 };
      return;
    }
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.on('error', () => this.set('error', 'Update failed. Check your internet connection and try again.'));
    this.updater.on('download-progress', info => {
      this.status = { phase: 'downloading', message: `Downloading update: ${Math.round(info.percent)}%`, progress: info.percent };
    });
    this.updater.on('update-downloaded', info => this.set('ready', `Version ${info.version} is ready. Restart to install.`));
  }
  private set(phase: string, message: string) { this.status = { phase, message, progress: 0 }; }
  state() { return { ...this.status }; }
  async check() {
    if (!this.supported || ['checking', 'downloading', 'ready', 'installing'].includes(this.status.phase)) return;
    this.set('checking', 'Checking for updates…');
    try {
      const result = await this.updater.checkForUpdates();
      if (!result || !result.isUpdateAvailable) {
        this.set('idle', 'You already have the latest version.');
        return;
      }
      this.set('downloading', `Downloading version ${result.updateInfo.version}…`);
      await this.updater.downloadUpdate();
    } catch {
      this.set('error', 'Update failed. Check your internet connection and try again.');
    }
  }
  install(beforeQuit: () => void) {
    if (this.status.phase !== 'ready') throw new Error('Download an update first');
    this.set('installing', 'Restarting to install the update…');
    beforeQuit();
    this.updater.quitAndInstall(true, true);
  }
}
