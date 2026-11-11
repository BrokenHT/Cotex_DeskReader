# Cotex

Cotex 是一款 Windows 小说阅读器，提供 Codex 和 WorkBuddy 两套工作聊天外观，共用书库与阅读进度。

- 导入 TXT 和无 DRM 的 EPUB，也可把文件拖入窗口。
- 按原文位置显示 EPUB 插图，支持折叠、展开和放大预览。
- 用目录、章号或标题关键词跳转，添加书签，自动保存章节和段落位置。
- 搜索公版名著和部分中文书源的公开章节。书库和阅读进度保存在本地。
- 自定义头像颜色和文字，WorkBuddy 外观还支持上传头像及修改昵称。

## 下载与使用

前往 [最新版本下载页](https://github.com/BrokenHT/Cotex_DeskReader/releases/latest)。安装版为 `Cotex-1.1.1-Setup.exe`，免安装版为 `Cotex-1.1.1-Portable.exe`。

启动后点击「新聊天／新建任务」导入一本书。在「设置 → 界面外观」中切换 Codex / WorkBuddy。阅读时可按空格切换工作摘要，或在底部输入框输入章号或标题关键词，按 Enter 跳转。

## 从源码运行

需要 Windows x64 和 Node.js 22.12 或以上版本。

```powershell
npm ci
npm run build
npm start
```

运行 `npm test` 执行单元测试。构建、快捷键和书源说明见 [README.txt](README.txt)。

Cotex 是独立项目。源码采用 [MIT 许可](LICENSE)，内置文本的来源与许可见 [assets/SOURCES.txt](assets/SOURCES.txt)。
