# 兼容约束与已知修复

## 桌面壳通用按钮拦截

已观察到桌面壳 dsh-tauri-ui 在 document capture 阶段查找 `button[aria-label]`，对标签恰好为“新建会话”或“New session”的按钮调用未分组创建流程，并 stopImmediatePropagation。

工作区行的新会话按钮必须使用含工作区标题的可访问名称，不可恢复成这两个通用名称。传给 uiWorkspace.startSession 的参数仍是 workspaceId 字符串。组件测试覆盖此命名及按钮完整调用链。

## 目录选择器

当前用户环境的 picker 是 native，listDirectory 的 browse 能力不可用。添加工作区直接 pickDirectory → workspaces.create({path}) → openWorkspace(workspaceId)。取消无动作；不提供误导性的自定义目录浏览/新建目录表单。其他 profile 若没有原生 picker，会显示服务错误；没有未经验证的 browse 降级。

## 持久化

新布局键 v4 优先，缺失/解析失败时读取旧 v3；旧键保留。工作区和文件 IDs 不变，工作区视图及右栏显示键不变。缺席组件的位置及隐藏偏好保留，显式重置布局才按当前注册项重建。

## UI 边界

右键隐藏仅作用于容器标题/标签，不捕获工作区、文件等内容区的原生上下文操作。不访问其他插件 DOM，不替换整个左侧 shell，不新增第二个文件面板。

服务接口是同一个 Client Cordis 服务作用域中的协议，不是跨窗口、跨 Host 或 HTTP API。正确声明依赖的组件插件可以随提供方启用/禁用自动注册和卸载。

## 诊断

旧版始终启用的工作区快照诊断已经移除，避免为了布局功能持续暴露目录和会话身份。原始宿主脚本诊断拷贝不进入发布包。重新排查问题时应添加最小、只读、范围明确的诊断，而非拦截或改写其他插件方法。

## 旧浏览器入口缓存

宿主 client-modules 会按 Loader 名称和 baseUrl 缓存 package metadata；重新安装同名 bundle 不会清除旧入口路径。为兼容从 0.5 升级且不重启宿主，构建同时生成根目录 `client.js` 兼容副本。规范导出仍指向 `dist/client.js`，副本由同一次构建复制，不手工维护。
