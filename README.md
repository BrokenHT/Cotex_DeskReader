# Cotex

Cotex 是一款支持 Windows 和 macOS 的小说阅读器，采用受 Codex 启发的工作聊天界面。打开一本书，就像打开一段聊天。

- 导入 TXT 和无 DRM 的 EPUB，也可把文件拖入窗口。
- 用目录、章号或标题关键词跳转，添加书签，自动保存章节和段落位置。
- 搜索公版名著和部分中文书源的公开章节。书库和阅读进度保存在本地。

## 下载与使用

前往 [最新版本下载页](https://github.com/BrokenHT/Cotex_DeskReader/releases/latest)。Windows 安装版为 `Cotex-1.0.0-Setup.exe`，免安装版为 `Cotex-1.0.0-Portable.exe`。macOS 打包文件名为 `Cotex-1.0.0-mac-arm64.dmg` / `Cotex-1.0.0-mac-x64.dmg`；发布页未提供时可按下文从源码构建。

启动后点击「新聊天」导入一本书。阅读时可在底部输入框输入章号或标题关键词，按 Enter 跳转。

## 从源码运行

需要 Windows x64 或 macOS（Apple Silicon / Intel），以及 Node.js 22.12 或以上版本。

```powershell
npm ci
npm run build
npm start
```

macOS 从源码打包：

```sh
npm run dist:mac
```

在 Mac 上构建后，`release/` 会生成 arm64（Apple Silicon）和 x64（Intel）各自的 DMG 与 ZIP。打开 DMG，将 Cotex 拖入「应用程序」。`npm run dist` 构建当前系统版本，`npm run dist:win` 构建 Windows 版本。正式分发的 macOS 版本需要配置 Apple Developer 签名与公证；本地构建不代表已经签名或公证。

macOS 使用原生红黄绿窗口按钮和系统菜单，快捷键使用 Command（如 ⌘O 导入、⌘K 书库、⌘D 书签），Option+左右切章。关闭窗口后，点击 Dock 图标可重新打开；⌘Q 退出。数据保存在 `~/Library/Application Support/DeskReader`，可通过设置中的书库备份/恢复在 Windows 和 Mac 之间迁移。

运行 `npm run test:mac` 验证 macOS 窗口、快捷键、导入、进度保存和重新打开（先运行 `npm run build`）。 打包后也可验证实际应用：

```sh
npm run test:mac -- release/mac-arm64/Cotex.app/Contents/MacOS/Cotex
```

Intel 应用路径为 `release/mac/Cotex.app/Contents/MacOS/Cotex`，应在兼容该架构的机器上验证。若 Mac 开发环境安装卡在 Windows Squirrel 工具下载，可使用 `npm ci --omit=peer` 跳过这项未使用的 peer 依赖。

运行 `npm test` 执行单元测试。构建、快捷键和书源说明见 [README.txt](README.txt)。

Cotex 是独立项目。源码采用 [MIT 许可](LICENSE)，内置文本的来源与许可见 [assets/SOURCES.txt](assets/SOURCES.txt)。
