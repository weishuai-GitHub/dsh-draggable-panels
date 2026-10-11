# dsh-draggable-panels · 0.7.0

由 `@local/draggable-panels` 更名。公开服务 `draggablePanels`、组件 ID 和原有持久化键保持兼容。

纯 Client 面板插件，不修改宿主源码。内置工作区、文件、终端组件与外部组件使用同一个注册协议。

## 使用

- 拖动组件标题或六点手柄，在左右侧栏之间移动；标签支持排序。
- 在组件标题/标签上右键，选择“隐藏组件”；标题旁菜单按钮也提供该操作。
- 左侧底部“组件管理”可以显示/隐藏已注册组件。全部隐藏后入口仍可使用。
- 隐藏只卸载该组件视图，不删除工作区/会话、不停止运行中的任务；业务状态由组件持有。
- `↺` 重置当前已注册组件布局；`⇄` 恢复完整原生界面。右下角提示条可点 × 关闭；侧栏底部 `⇄` 始终能返回拖拽布局，关闭提示不会失去入口。
- 系统目录选择器添加工作区；取消不创建。新会话按钮使用含工作区名称的可访问标签，避免桌面壳捕获通用标签后创建到“未分组”。

## 终端组件

在组件管理中勾选“终端”，切换到终端标签，点击已开启终端标签后面的“＋”，再选择 Shell 创建。可选择宿主发现的 Shell；新终端属于当前会话工作区。组件使用宿主 `webTerminals` 服务与独立打包的 xterm，不读取原生内部组件，也不是原生 UI 的直接搬运。

- 打开组件、拖动或恢复隐藏不会新建 Shell；只有显式“新建终端”分配进程。
- 隐藏、移动、切换会话只是断开视图，保留独立的窗口持有；不会调用结束进程。
- 点击终端标签的关闭按钮直接结束对应进程，不再弹出确认；隐藏组件不会结束终端。
- 终端标签与合并 Shell 选项的新建“＋”保持同一行；每个终端标签旁的关闭按钮只结束对应终端，支持关闭非当前标签。没有“恢复已有终端”入口。
- 记录跨页面刷新保存，但进程只存在于宿主当前生命周期；宿主重启后失效的记录不会自动新建替代 Shell。可结束/移除失效项后显式创建。
- 终端使用系统用户权限，不受 Agent 沙箱限制。
- 没有 `webTerminals` 或终端 Remote 的 profile 不注册终端组件，工作区和文件功能不受影响。

## 开发

```sh
npm ci --ignore-scripts
npm test
npm run format:check
```

Node.js >= 18，使用锁定版本的 esbuild 和 Prettier。React 由宿主提供，不重复打包。主要构建产物在 `dist/`，只修改 `src/`。根目录 `client.js` 是构建自动生成的旧入口兼容副本，用于无需重启宿主的升级，不是第二份源码。

本仓库只提交源码：`dist/` 与 `client.js` 未纳入版本控制，克隆后请先执行 `npm run build`（`npm test` 已包含构建）。

## 目录

```text
src/host/                  最小 Host 入口
src/client/plugin.js       生命周期与依赖组装
src/client/registry/        组件协议、注册表、公开服务
src/client/dock/            通用容器、布局、拖拽、组件管理
src/client/components/      workspace / files / terminal 内置组件
src/client/integration/     宿主服务调用与 Slot 注册
src/client/shared/          状态、持久化、图标、菜单、错误边界
src/client/locales/         单一中英文词典
scripts/                   标准构建脚本
tests/unit/                纯逻辑和服务行为测试
tests/integration/         实际构建产物与组件交互测试
examples/counter-panel/    独立可安装扩展组件示例
docs/                      架构、接口、兼容边界
```

## 扩展组件

通过 `ctx.draggablePanels.register(ctx, descriptor)` 注册，返回只属于该注册的 `{ dispose }`。也可使用 `ctx.draggablePanels.forContext(ctx)` 获取绑定当前插件生命周期的接口。

完整接入步骤见 [组件接口](<docs/components.md>)；可安装例子见 [计数器示例](<examples/counter-panel/package.json>)。

## 持久化与兼容

- 新布局键：`local.draggable-panels.layout.v4`，首次读取兼容旧 `.v3`；不删除旧键。
- 原有 `workspaces`、`files` ID 保持不变。
- 右栏显隐与工作区视图偏好沿用原键。
- 暂时卸载的组件保留位置、顺序和隐藏偏好，不显示空壳。恢复注册时使用原偏好，不抢占当前活动组件。
- 隐藏不同于注销；禁用/卸载扩展插件会自动注销其组件。

更多见 [架构](<docs/architecture.md>)、[兼容注意事项](<docs/compatibility.md>)、[原生功能边界](<docs/parity.md>)。

测试覆盖模型、服务入参、取消与重复操作、原生样式结构、外部注册/卸载和隐藏恢复。构建产物测试使用模拟 React/服务，不替代真实浏览器的视觉及拖拽验收。
