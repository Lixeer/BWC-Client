const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const store = new Store();

let mainWindow;

function createWindow() {
    const win = new BrowserWindow({
        width: 1000,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            devTools: false
        },
        icon: path.join(__dirname, 'assets/icon.ico'),
        title: '灰喵',
        autoHideMenuBar: true
    });

    win.loadFile('login.html');
    return win;
}

app.whenReady().then(() => {
    mainWindow = createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// 处理前端请求
ipcMain.handle('get-servers', () => {
    return store.get('servers') || [];
});

ipcMain.handle('add-server', (event, server) => {
    const servers = store.get('servers') || [];
    servers.push(server);
    store.set('servers', servers);
    return servers;
});

ipcMain.handle('delete-server', (event, serverToDelete) => {
    const servers = store.get('servers') || [];
    const updatedServers = servers.filter(server => 
        !(server.ip === serverToDelete.ip && server.port === serverToDelete.port)
    );
    store.set('servers', updatedServers);
    return updatedServers;
});
