const { app, BrowserWindow } = require("electron");
const path = require("path");

// 開発モードかどうか
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    title: "Transport Sim",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // メニューバーを非表示にする（F11でフルスクリーン可能）
  win.setMenuBarVisibility(false);

  if (isDev) {
    // 開発時はVite dev serverに接続
    win.loadURL("http://localhost:5173");
  } else {
    // 本番時はビルド済みファイルを読み込む
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
