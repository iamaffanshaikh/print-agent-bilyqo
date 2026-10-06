import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Updates, updateErrorMessage } from '../updater';

function setup(supported = true) {
  const backend = Object.assign(new EventEmitter(), {
    autoDownload: true, autoInstallOnAppQuit: true, checks: 0, downloads: 0, installs: 0,
    available: true, fail: false,
    async checkForUpdates() { this.checks++; if (this.fail) throw new Error('offline'); return { isUpdateAvailable: this.available, updateInfo: { version: '0.2.0' } }; },
    async downloadUpdate() { this.downloads++; backend.emit('download-progress', { percent: 50 }); backend.emit('update-downloaded', { version: '0.2.0' }); return []; },
    quitAndInstall() { this.installs++; }
  });
  const updates = new Updates(supported, backend as unknown as ConstructorParameters<typeof Updates>[1]);
  return { backend, updates };
}
test('updates download only on request and install only after explicit restart', async () => {
  const { backend, updates } = setup();
  assert.equal(backend.autoInstallOnAppQuit, false);
  assert.equal(backend.autoDownload, false);
  assert.throws(() => updates.install(() => {}), /Download/);
  await Promise.all([updates.check(), updates.check()]);
  assert.equal(backend.checks, 1); assert.equal(backend.downloads, 1);
  assert.equal(updates.state().phase, 'ready'); assert.equal(backend.installs, 0);
  let quitting = false;
  updates.install(() => { quitting = true; });
  assert.equal(quitting, true); assert.equal(backend.installs, 1);
});
test('no update, failed checks with retry, and unsupported platforms', async () => {
  const { backend, updates } = setup();
  backend.available = false; await updates.check();
  assert.equal(updates.state().phase, 'idle'); assert.equal(backend.downloads, 0);
  backend.fail = true; await updates.check(); assert.equal(updates.state().phase, 'error');
  backend.fail = false; backend.available = true; await updates.check(); assert.equal(updates.state().phase, 'ready');
  const disabled = setup(false); await disabled.updates.check();
  assert.equal(disabled.backend.checks, 0); assert.equal(disabled.updates.state().phase, 'unsupported');
});
test('update failures distinguish missing release files, connectivity and verification', () => {
  assert.match(updateErrorMessage(new Error('404 Not Found')), /public release/);
  assert.match(updateErrorMessage(new Error('ERR_UPDATER_CHANNEL_FILE_NOT_FOUND')), /latest.yml/);
  assert.match(updateErrorMessage(new Error('getaddrinfo ENOTFOUND github.com')), /firewall/);
  assert.match(updateErrorMessage(new Error('sha512 checksum mismatch')), /verification failed/);
  assert.match(updateErrorMessage(new Error('Unexpected failure')), /Unexpected failure/);
});
