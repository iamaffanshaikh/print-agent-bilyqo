import type { AppUpdater } from 'electron-updater';
type Updater = Pick<AppUpdater, 'autoDownload' | 'autoInstallOnAppQuit' | 'on' | 'checkForUpdates' | 'downloadUpdate' | 'quitAndInstall'>;

export function updateErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (/404|ERR_UPDATER_NO_PUBLISHED_VERSIONS|ERR_UPDATER_LATEST_VERSION_NOT_FOUND|ERR_UPDATER_CHANNEL_FILE_NOT_FOUND/i.test(detail)) {
    return 'Update source unavailable. Ask Bilyqo support to publish a public release with the installer and latest.yml. A private or missing GitHub repository cannot supply updates.';
  }
  if (/sha512|checksum|signature|ERR_UPDATER_INVALID/i.test(detail)) {
    return 'Update verification failed. Ask Bilyqo support to check the published installer and update files.';
  }
  if (/ENOTFOUND|ETIMEDOUT|ECONN|certificate|ERR_CERT/i.test(detail)) {
    return 'Cannot connect to the update server. Check access to GitHub and its downloads, your firewall, or proxy, then try again.';
  }
  return `Update failed: ${detail.slice(0, 600)}`;
}

export class Updates {
  private status = { phase: 'idle', message: 'Click Update to check for new features.', progress: 0 };
  constructor(private supported: boolean, private updater: Updater) {
    if (!supported) {
      this.status = { phase: 'unsupported', message: 'Updates are available in the installed Windows app.', progress: 0 };
      return;
    }
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.on('error', error => this.set('error', updateErrorMessage(error)));
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
    } catch (error) {
      this.set('error', updateErrorMessage(error));
    }
  }
  install(beforeQuit: () => void) {
    if (this.status.phase !== 'ready') throw new Error('Download an update first');
    this.set('installing', 'Restarting to install the update…');
    beforeQuit();
    this.updater.quitAndInstall(true, true);
  }
}
