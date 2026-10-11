# 外部组件 API v1

## 接入条件

组件插件须声明两层依赖：

1. 包清单 `dsh.client.inject` 包含 `dsh-draggable-panels`，保证浏览器模块加载顺序。
2. Client 插件 `inject` 包含 `draggablePanels`，保证服务缺席时停止、恢复后重新注册。

不要通过全局变量、选择器或容器内部 DOM 接入。组件插件可注入自己的业务服务；容器只提供布局和视图生命周期。

## 最小例子

```js
window.__ModuleLoader__.load({
  id: '@example/my-panel',
  factory(require) {
    const React = require('react');
    return {
      inject: ['draggablePanels'],
      apply(ctx) {
        const panels = ctx.draggablePanels.forContext(ctx);
        const registration = panels.register({
          id: 'example.notes',
          title: () => '笔记',
          component: () => React.createElement('p', null, 'Hello'),
          defaultPlacement: { side: 'right', order: 30, visible: true },
        });
        // registration.dispose() 可提前注销；当前插件卸载也自动注销。
      },
    };
  },
});
```

可安装的完整包见 [计数器示例](<../examples/counter-panel/package.json>)。示例不自动安装到用户 profile。

## 描述符

| 字段 | 含义 |
| --- | --- |
| `id` | 非空、稳定、唯一字符串；推荐 `包名.组件名`；不能重复注册 |
| `title` | 字符串或无参同步函数；推荐通过自己插件的 locale 翻译 |
| `component` | React 函数组件或类组件；不要传已经构造的 React 元素 |
| `icon` | 可选 React 函数/类组件，接收 `size` |
| `defaultPlacement` | 必填 `{ side: 'left'|'right', order: number, visible: boolean }`；order 必须有限数值 |
| `integratedHeader` | 可选 boolean；仅当组件能够遵守下述标题协议时启用 |

既有用户位置/隐藏偏好优先于默认位置。注册表复制并冻结自己持有的描述符，后续修改原对象不会改变注册项。暂不接受 `memo`/`forwardRef` 对象描述符，可包一层普通函数组件。

## 接口

```js
const api = ctx.draggablePanels;
api.version; // 1
const handle = api.register(ctx, descriptor);
await handle.dispose(); // 仅注销此条；幂等

const scoped = api.forContext(ctx);
scoped.register(descriptor); // 与 register(ctx, descriptor) 等价

api.show(id); // 显示并选中，必要时打开所属侧栏并退出原生模式
api.hide(id); // 隐藏，保留位置、顺序和插件的业务数据
api.move(id, { side: 'left', beforeId: 'workspaces' });
api.move(id, { side: 'right' }); // 追加

api.getSnapshot(); // 稳定只读数组：{id,title,side,visible}[]
const unsubscribe = api.subscribe(() => { /* 读取新 snapshot */ });
```

布局控制仅接受已注册 ID；未知 ID 抛出异常。无公共的 `unregister(id)`，避免一个扩展注销另一个扩展的注册。生命周期通过传入调用方 Context 的 `effect` 绑定，不依赖隐式 `this` 或捕获提供方 Context。

## 组件 props

- `panelId`、`side`、`isActive`：布局信息。
- 宿主公开 Slot 提供的 selector hooks 原样传递；不同侧可能存在不同的可选 props，不要依赖任意 DOM 或未声明属性。
- `dockHeaderProps`、`dockCloseControl`：只有单个可见组件且声明 `integratedHeader: true` 时传入。必须把完整 `dockHeaderProps` 展开到自己的可聚焦标题元素，并渲染 `dockCloseControl`。它们负责拖拽、右键、键盘与控制按钮；未实现此协议请保持默认 `false`，由容器绘制通用标签栏。

## 状态与卸载

- 切换活动标签保留其他可见组件的 React 视图，避免无意打断编辑。
- 隐藏组件会卸载其 React 视图；组件需把希望保留的状态放在自己插件生命周期的 store 中，或自行持久化。
- 隐藏不会调用业务停止、归档、删除或注销。
- 注销/卸载会移除视图，触发其 React effect 清理。组件自己注册的事件、任务及网络资源须绑定自己的 Context。
- 提供方禁用时，正确声明依赖的扩展停止；提供方启用后扩展重新注册。
- 重新安装恢复位置/隐藏偏好，不抢占当前活动标签。
- 外部组件及图标包裹错误边界；渲染失败显示局部错误。事件处理器、异步任务失败需由组件自己捕获，React 错误边界不处理这些异常。
