// /src/components/component.js
//
// 组件基座：统一 `render(container)` / `mount()` / `unmount()` / `update(props)` 四个方法。
//
// 为什么要有这一层：
// 本项目是原生 ES Modules、无框架、无构建步骤，DOM 主要写在 html 里。
// 因此这里的"组件"几乎都是**行为组件** —— 它不负责从零造 DOM，而是接管
// 已经存在的节点，把开关、事件委托和状态同步收在一处。
// 统一四个方法之后，调用方只需要面对一种形状：
//
//   const menu = createPopupMenu({ toggle, panel, ... });
//   menu.render(document.body);   // 首次 render → mount
//   menu.update({ ... });         // 已挂载 → 只刷新
//   menu.unmount();               // 解绑，节点留在 DOM
//
// `render()` 是幂等的：重复调用不会重复绑定监听，也不会重复插入节点。
//
// 刻意不做的：生命周期钩子（beforeMount/afterUpdate...）、虚拟 DOM、模板引擎。
// 本项目没有这些需求，加了只会让"读代码"变贵。

/**
 * 创建一个组件实例。
 *
 * @param {Object} spec 组件自己的实现：至少应覆盖 mount / unmount / update，
 *                      以及该组件特有的方法（open / close / getValue ...）。
 *                      spec 里的同名方法会覆盖基座默认实现。
 * @returns {Object} 组件实例
 */
export function defineComponent(spec = {}) {
    const component = {
        /** 组件自己持有的根节点（行为组件 = 被接管的节点；创建型组件 = 造出来的节点） */
        el: null,
        /** render() 传入的父容器 */
        container: null,
        /** 是否已挂载。render() 据此决定 mount 还是 update，保证幂等 */
        mounted: false,
        /** 组件入参。update() 之后合并进这里，供组件自己读取 */
        props: {},

        /**
         * 渲染：把组件挂到容器上。
         *
         * 首次调用 → mount()；之后 → update(props)。
         * 创建型组件（el 由组件自己造）会在 mount 后被 append 到 container。
         *
         * @param {HTMLElement} [container] 父容器；省略则沿用上次的容器
         * @param {Object} [props] 组件入参
         * @returns {Object} 组件自身（便于链式调用）
         */
        render(container, props = {}) {
            if (container) this.container = container;
            Object.assign(this.props, props);

            if (!this.mounted) {
                this.mount();
                this.mounted = true;
            } else {
                this.update(this.props);
            }

            // 创建型组件：挂载后把根节点放进容器（已经在同一父节点下则跳过，
            // 避免重复 append 把节点从原位挪走）
            if (this.el && this.container && this.el.parentNode !== this.container) {
                this.container.appendChild(this.el);
            }

            return this;
        },

        /** 挂载：绑定事件。子类覆盖 */
        mount() {},

        /** 卸载：解绑事件。子类覆盖（节点默认留在 DOM） */
        unmount() {},

        /** 用新 props 刷新视图。子类覆盖 */
        update() {}
    };

    return Object.assign(component, spec);
}
