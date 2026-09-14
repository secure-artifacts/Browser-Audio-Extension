# 浏览器拉线助手

当前版本：1.2.1（远端回声抑制修复）。

适用于支持 remote-only 音频约束的桌面 Chromium 系浏览器的 Manifest V3 扩展（最低版本 151）。安装后默认开启，在普通网页申请麦克风时启用远端回声抑制，关闭自动增益和降噪，用于 VoiceMeeter／立体声混音传入通话的场景。

1.2.1 将 echoCancellation 从 false 修正为 { exact: "remote-only" }，不再强制关闭所有回声消除。用户已反馈修复后的实际通话测试正常；通话数量、时长和设备覆盖未单独记录，因此不承诺任意数量通话均无回音。此模式不保证对每个标签页单独消除自身声音。不支持此约束时报告采集失败，不静默退回 false 或 true。

它调整的是网页采集约束，不修改浏览器 flags 或启动参数，不保证所有网站有效，也不保证对方收到双声道。

## 下载与安装

1. 打开本仓库的 [Releases](https://github.com/secure-artifacts/Browser-Audio-Extension/releases)，下载 `Browser-Audio-Extension-v版本号.zip`，不要误选 GitHub 自动生成的 Source code 压缩包。
2. 完整解压到一个长期保留的文件夹；该文件夹根目录应直接包含 `manifest.json`。
3. 打开 `chrome://extensions`（Edge 为 `edge://extensions`，Brave 为 `brave://extensions`）。
4. 开启开发者模式，点击「加载已解压的扩展程序」，选择上一步文件夹。
5. 保存网页内容、结束当前通话，然后刷新通话网页，重新发起通话。
6. 在网站中选择 VoiceMeeter 虚拟输出／立体声混音作为麦克风。插件不会替你选择设备。

首次安装默认开启；切换开关后需要刷新网页。各浏览器与各个人资料需要分别安装。开发者模式提示属于本地加载方式的正常限制，不通过本工具关闭安全提示。

## 状态与风险

面板能区分等待采集、等待刷新、采集失败、静音、无法确认、远端回声抑制已启用。
最后一种状态仅代表已检查的音轨原生设置回报 remote-only 且自动增益和降噪为 false，不证明对方已收到声音或实际无回音，也不保证网站没有后续处理。

远端回声抑制并非完整的音频路由隔离，仍可能出现回声、啸叫；建议戴耳机，先低音量测试。
如果无法使用麦克风，可关闭插件、刷新网页后重试。禁用或卸载后也需要刷新已打开的页面。

## 隐私与权限

- 仅使用 `scripting`、`storage`，以及 HTTP/HTTPS 全网站访问权限；未加入网站例外开关。
- 全网站权限用于在页面最早阶段修改音频采集请求，不读取聊天、密码、Cookie，不录音、不上传数据。
- 只保存一个全局开关。打开面板时检查当前标签页的音轨设置摘要；关闭面板后停止轮询，不保存诊断日志。
- 不获取 GitHub 凭据、不联网下载远程代码、没有运行时第三方依赖。
- 内部页面、扩展商店等受保护页面不能注入；无痕模式需要用户自行授权。

## 测试范围

基础逻辑、错误提示、状态判定、构建清单由仓库自动测试覆盖。此前独立 Chrome for Testing 153 环境验证了完整插件；Chrome、Beta、Edge 的补充测试是模拟设备下的脚本级验证，不应解读为全部安装场景都已通过。Brave 和数小时真实通话尚待实测，详情见 [测试记录](测试记录.txt)。

## 本地开发与更新

需要 Node.js 24。执行：

```sh
npm ci --ignore-scripts
npm test
npm run build
```

`dist/` 是只含运行文件的安装目录。源码中的图标已是最终 PNG，无需再生成。
更新时将新版运行文件覆盖到原安装目录，在扩展管理页点击重新加载，再刷新通话网页；不要同时启用两份副本。保留旧文件备份便于恢复。

## 发布状态说明

GitHub Actions 负责生成 ZIP、构建来源证明（Attestation）并上传 Release。来源证明不是杀毒认证，也不是 Chrome Web Store 审核。
本流程不包含商店上架、CRX 签名或自动更新；平台是否通过审核以实际审核结果为准。

## 如何发布新版本

发布只通过推送 `v*` 标签触发。以下以未来修复版本 `v1.2.2` 为例，发布前须完成对应测试：

1. 修改代码，并把 `manifest.json`、`package.json`、`package-lock.json` 和 `audio-hook.js` 的版本号同步改成 `1.2.2`。标签与清单版本不一致会停止构建。
2. 在项目目录检查、测试并提交。下面是示例文件清单，请按实际改动调整，勿添加密钥或本机配置。

```sh
git status
git diff
npm ci --ignore-scripts
npm test
npm run build
git add manifest.json package.json package-lock.json audio-hook.js background.js page-status.js popup.html popup.css popup.js icons tests scripts README.md
git commit -m "fix: 描述本次修改"
git push origin main
```

3. 创建并推送新标签：

```sh
git tag -a v1.2.2 -m "Release version 1.2.2"
git push origin v1.2.2
```

4. 查看 [Actions](https://github.com/secure-artifacts/Browser-Audio-Extension/actions) 等待成功，再到 [Releases](https://github.com/secure-artifacts/Browser-Audio-Extension/releases) 获取 ZIP。

CI 会测试、构建 `dist/`、把其中的文件打成根目录含 `manifest.json` 的 ZIP、生成最终 ZIP 的 Attestation，再由 `github-actions[bot]` 上传。不要手动创建 Release 或上传、替换下载包，也不要把个人 Token 配置为 Release 上传凭据。

版本号示例：修复问题用 `v1.2.2`，新增功能用 `v1.3.0`，重大不兼容变更用新主版本号。它们都只是例子，请使用实际未发布的新版本号。

### 构建失败时

先在 Actions 查看日志、修复源码或工作流，再提交并推送修复。对于尚未成功发布的失败标签，按流程删除后重新创建；不要覆盖已经成功分发的版本：

```sh
git tag -d v1.2.2
git push origin :refs/tags/v1.2.2
# 确认修复已提交并推送后再执行：
git tag -a v1.2.2 -m "Release version 1.2.2"
git push origin v1.2.2
```

重复检查直到 CI 成功，再提交审核。禁止下载 Actions 中间产物后手工补传到 Release。

### 校验下载文件的来源

安装 GitHub CLI 后，可以对下载的 ZIP 运行（请替换成实际文件名和标签）：

```sh
gh attestation verify Browser-Audio-Extension-v1.2.1.zip --repo secure-artifacts/Browser-Audio-Extension --signer-workflow secure-artifacts/Browser-Audio-Extension/.github/workflows/release.yml --source-ref refs/tags/v1.2.1 --deny-self-hosted-runners
```

这验证文件与指定仓库、标签、工作流的构建来源关系，不代表不存在漏洞，也不等于平台审核通过。
