import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, clipboard, dialog } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { Store } from './store';
import { Printer } from './printer';
import { Queue } from './queue';
import { createApi, PORT } from './api';
import { settingsSchema, example } from './model';
import { receiptText, cutBytes } from './receipt';
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let win:BrowserWindow|null=null; let quitting=false; let tray:Tray;
  const show = () => { win?.show(); win?.focus(); };
  app.on('second-instance',show);
  app.on('before-quit',()=> {quitting=true;});
  app.whenReady().then(async()=> {
    const directory = app.getPath('userData'); mkdirSync(directory,{recursive:true});
    const store = new Store(join(directory,'agent.sqlite'));
    const preview = process.platform!=='win32' || process.argv.includes('--preview');
    const helper = app.isPackaged ? join(process.resourcesPath,'native','print.ps1') : join(app.getAppPath(),'native','print.ps1');
    const printer = new Printer(helper,preview); const queue = new Queue(store,printer); const api = createApi(store,queue,preview);
    let apiError:string|null=null;
    try { await api.listen({host:'127.0.0.1',port:PORT}); } catch(error) { apiError=error instanceof Error?error.message:'Local API unavailable'; }
    win = new BrowserWindow({width:1040,height:780,minWidth:640,minHeight:620,backgroundColor:'#f5f5f0',title:'Bilyqo Print Agent',webPreferences:{preload:join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',event=>event.preventDefault());
    win.on('close',event=>{if(!quitting){event.preventDefault();win?.hide();}});
    const register = (name:string,fn:(...args:unknown[])=>unknown) => ipcMain.handle(name,(event,...args)=> {
      if(event.sender!==win?.webContents || event.senderFrame!==win.webContents.mainFrame) throw new Error('Untrusted sender');
      return fn(...args);
    });
    register('state',async()=>({settings:store.settings(),printers:await printer.list(),jobs:store.list(),preview,apiError,endpoint:`http://127.0.0.1:${PORT}`,receipt:receiptText(example(),store.settings())}));
    register('save',(value)=>{const profile=settingsSchema.parse(value);store.saveSettings(profile);if(process.platform==='win32') app.setLoginItemSettings({openAtLogin:profile.autoStart,path:process.execPath,args:['--background']});return true;});
    register('test',()=>{const settings=store.settings();if(!settings.printer)throw new Error('Choose and save a printer first');const result=store.enqueue(example(),settings);void queue.drain();return result;});
    register('cut',async()=>{
      const profile=store.settings();if(!profile.printer || profile.cut==='none')throw new Error('Save a printer and select a cutting mode first');
      const choice=await dialog.showMessageBox(win!,{type:'question',buttons:['Cancel','Test cutter'],defaultId:0,cancelId:0,message:'Feed paper and test the selected cutter?',detail:'Use this only on an ESC/POS printer with an automatic cutter. Ensure the printer is idle.'});
      if(choice.response!==1)return false;
      const active=store.list().some(job=>job.state==='queued'||job.state==='sending');if(active)throw new Error('Wait for queued receipts to finish');
      await printer.send(profile.printer,Buffer.concat([Buffer.from([0x1b,0x40]),Buffer.from('\n'.repeat(profile.feedLines)),cutBytes(profile.cut)]));return true;
    });
    register('rotate',()=>{store.rotateToken();return true;});
    register('copy-token',()=>{clipboard.writeText(store.token());return true;});
    tray=new Tray(nativeImage.createFromPath(join(__dirname,'ui','icon.png')));
    tray.setToolTip('Bilyqo Print Agent');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open printer settings',click:show},{type:'separator'},{label:'Quit agent',click:()=>app.quit()}]));tray.on('double-click',show);
    await win.loadFile(join(__dirname,'ui','index.html'));
    if(process.argv.includes('--background'))win.hide();
    void queue.drain();
    app.on('activate',show);
    app.on('will-quit',()=>{void api.close();store.close();});
  }).catch(error=> {dialog.showErrorBox('Could not start print agent',String(error));app.quit();});
}
