window.__ModuleLoader__.load({
  id: '@local/draggable-panels-example',
  factory(require) {
    const React = require('react');
    return {
      inject: ['draggablePanels', 'locale'],
      apply(ctx) {
        const panels = ctx.draggablePanels.forContext(ctx);
        let count = 0;
        const listeners = new Set();
        const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
        function Counter() {
          const value = React.useSyncExternalStore(subscribe, () => count, () => count);
          return React.createElement('section', { style: { padding: 12, color: 'var(--dsw-alias-label-primary)' } },
            React.createElement('p', null, `Counter: ${value}`),
            React.createElement('button', { type: 'button', onClick: () => { count++; for (const fn of [...listeners]) fn(); } }, '+1'));
        }
        // State lives outside the view so hiding/remounting does not reset it.
        const registration = panels.register({
          id: 'example.counter',
          title: () => ctx.locale.getSnapshot() === 'zh' ? '示例计数器' : 'Example counter',
          component: Counter,
          defaultPlacement: { side: 'right', order: 30, visible: true },
        });
        // registration.dispose() explicitly unregisters ONLY this contribution.
        // Consumer unload also disposes it automatically through its own Context.
        ctx.effect(() => () => { registration.dispose(); listeners.clear(); }, 'example cleanup');
      },
    };
  },
});
