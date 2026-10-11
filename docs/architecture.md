# 架构与生命周期

## 依赖方向

```text
plugin（组装）
  ├─ registry（组件描述符、调用方生命周期）
  ├─ dock（纯布局 + 指针控制器 + 容器/组件管理）
  ├─ components/workspace（模型、搜索、行、菜单、确认弹窗）
  ├─ components/files（缓存 store、视图）
  └─ integration（Slot 和宿主操作）
```

模型不依赖 React、DOM、localStorage 或 Host。组件容器不认识工作区/文件组件类型，只根据注册项决定标题、图标、视图和默认位置。两个内置组件也走公开注册服务。

## 状态层次

- 注册表：冻结描述符数组，稳定引用；注册/注销时通知。相同 ID 重复注册报错，旧 handle 不会删除新注册。
- 布局：JSON 数据 `{version:2,left,right,hidden,active}`。侧数组保留缺席/隐藏的 ID；渲染使用注册表投影后的可见列表。active 只允许已注册、可见且属于该侧的 ID。
- 视图状态：搜索、展开、分页与文件缓存归各组件所有；只有已有明确持久化规则的字段写入 storage。
- 临时 UI：拖拽、右键菜单、组件管理弹层由容器持有。

## 所有权

`register(ownerCtx, descriptor)` 在 `ownerCtx.effect` 内插入注册项，并返回该条登记的精确 disposer。提供方和消费者任意顺序释放都安全：registry.dispose 与 handle.dispose 均幂等。没有“按 ID 删除别人注册项”的公共操作。

动态服务使用 `ctx.provide`，而不是静默替换服务值。依赖方必须声明 `inject`，由 Cordis 在服务撤回/恢复时处理卸载与重新激活。

拖拽控制器只测量自身容器/标签，清理 pointermove/up/cancel、keydown、blur 与指针捕获。组件隐藏、卸载或拖拽取消均释放正在进行的指针会话。

## 构建

ESM 源码经 esbuild 解析依赖，CSS 作为文本打包并通过本插件的 style 元素注入。React external，仍由宿主 ModuleLoader 提供；不引入 Harness 内部 UI 包。格式化由锁定版本 Prettier 负责。不要手改生成产物。

## 验证边界

纯逻辑、调用方卸载、持久化迁移、构建产物渲染与按钮操作通过自动化测试。测试不是浏览器像素截图，也不能证明桌面壳全部扩展均兼容。安装后仍需实际检查标题拖拽、右键隐藏及恢复。
