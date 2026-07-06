const { app, BrowserWindow, ipcMain, Menu, globalShortcut, dialog } = require('electron');
const fs = require('fs');
const path = require('path')
const url = require('url')
const sep = path.sep;
const license_module = require('./license_verify.js');
let mainWindow = null;
let receiveWindow = null;
// Menu.setApplicationMenu(null)

ipcMain.handle('select-dicom-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择DICOM文件夹',
    properties: ['openDirectory'],
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  return result.filePaths[0];
});

const Store = require('electron-store');
const store = new Store();
const userDataPath = store.get('address') || app.getPath('userData');
store.set('address', userDataPath);
if (store.get('attempts') === undefined) {
  store.set('attempts', 5);
}
fs.mkdirSync(path.join(userDataPath, 'config', 'error_report'), { recursive: true });

// var portlist = store.get('portlist');
// console.log(portlist)
// for (var i = 0; i < portlist.length; i++) {
//   childprocess.exec("kill $(lsof -i:" + portlist[i] + " | grep LISTEN | awk '{print $2}')");
// }

const os = require("os");
global['os'] = os.platform();

var licFlag = false
var remainingDays = 0
var remainingHours = 0
var remainingMinutes = 0

try {
  let expireDate = license_module.licenseVerify()[2]
  let std_date = expireDate.substr(0, 4) + '-' + expireDate.substr(4, 2) + '-' + expireDate.substr(6, 2)
  let date_expire = new Date(std_date)
  let date_now = new Date()
  if (date_expire.getTime() >= date_now.getTime()) {
    let msecond = date_expire - date_now
    remainingDays = parseInt((msecond) / 86400000)
    remainingHours = parseInt((msecond - remainingDays * 86400000) / 3600000)
    remainingMinutes = parseInt((msecond - remainingDays * 86400000 - remainingHours * 3600000) / 60000)
  }
  let tempFlag = license_module.licenseVerify();
  licFlag = tempFlag[0]
}
catch (error) {
  console.error('license does not exist!')
}
//////////////////////////////////////

app.on('ready', () => {
  // const { screen } = require('electron');
  // var size = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    fullscreen: true,
    // minWidth:1680,
    width: 1680, height: 900,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false
    }
  })
  
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    (details, callback) => {
      callback({ requestHeaders: { Origin: '*', ...details.requestHeaders } });
    },
  );

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        'Access-Control-Allow-Origin': ['*'],
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
        ...details.responseHeaders,
      },
    });
  });

  // 鍔犺浇搴旂敤----閫傜敤浜?react 椤圭洰
  mainWindow.loadURL('http://localhost:3002/');
  // mainWindow.loadURL(url.format({
  //   pathname: path.join(__dirname, './build/index.html'),
  //   protocol: 'file:',
  //   slashes: true
  // }));

  receiveWindow = new BrowserWindow({
    show: true, webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false
    }
  });
  receiveWindow.loadURL(`file://${__dirname}/receive.html`)

  globalShortcut.register('ESC', () => {
    mainWindow.setFullScreen(false)
  })

  // 鍏抽棴window鏃惰Е鍙戜笅鍒椾簨浠?
  mainWindow.on('closed', function () {
    mainWindow = null
    receiveWindow.close()
  })
});
