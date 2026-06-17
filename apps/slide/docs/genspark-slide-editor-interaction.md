# Genspark 幻灯片编辑交互调研

## 调研范围

调研页面：

`https://www.genspark.ai/edit_slides?project_id=95ca5dc4-8aea-46b5-a1cb-b888febb2888&index=0&deck=compositional-generalisation-review`

目标：在继续修改我们自己的编辑器之前，先把 Genspark 的对象选择、文字编辑、toolbar 同步逻辑摸清楚。

本文重点关注右侧幻灯片编辑区，不包含左侧 agent 对话流。

## 页面结构

- 编辑器不是一个单一文档 surface。
- 左侧缩略图列表是可滚动区域，每一页缩略图都是独立 iframe 渲染。
- 右侧主编辑画布也是一个 iframe 类的 slide 渲染面，外层是白色 stage 和阴影。
- toolbar 不在 iframe 内，而是放在右侧编辑区域顶部。
- toolbar 有两行：
  - 第一行：undo/redo、段落样式、字体、字号、B/I/U/S、对齐、间距或列表类工具、颜色、图片相关工具。
  - 第二行：链接、表格、文本插入、inspect/object mode、展开收起。
- 当前观察到的页面默认开启 inspect/object mode。

## 观察到的状态

| 操作 | 视觉结果 | toolbar 结果 | 浮动 UI |
| --- | --- | --- | --- |
| 初始加载 | 没有明显选中对象 | `Normal Text / PingFang SC / 16` | 无 |
| 单击标题文字对象 | 标题区域出现对象级选中框 | `Normal Text / Inter / 16`；undo/redo disabled；inspect mode active | 出现 `align-toolbar` |
| 单击左侧红色竖线形状 | 形状进入对象级选中 | 仍是 `Normal Text / Inter / 16`；inspect mode active | 出现 `align-toolbar` |
| 双击标题文字 | 标题文字本身出现灰色文本选区；对象浮动工具条消失 | 切换成真实文本样式，观察值为 `Heading 1 / Source Serif Pro / 118`；B 和 I active | 无 `align-toolbar` |
| 文本选区后点击画布空白 | 文本样式状态没有立刻重置 | 仍保留上一次文本样式，观察值为 `Heading 1 / Source Serif Pro / 118` | 无 `align-toolbar` |

## 核心结论：两层选择状态

Genspark 明显区分了两层状态：

对象选择：

- 由 inspect mode 下的单击触发。
- 展示对象边界框和浮动对象工具条。
- 顶部 toolbar 不一定同步这个对象的真实 CSS 样式。
- 单击标题对象时，标题视觉上非常大，但 toolbar 仍显示 `Normal Text / Inter / 16`。
- 单击非文本形状时，toolbar 也仍显示文本默认值。

文字编辑 / 文本选区：

- 由双击文本触发。
- 对象级浮动工具条消失。
- 文字本身出现浏览器式选区或光标语义。
- 顶部 toolbar 开始读取真实文本样式。
- 标题文字进入文本选区后，toolbar 变成 `Heading 1 / Source Serif Pro / 118`，B/I 也进入 active。

所以不能把“对象被选中”和“文字可编辑/有文字选区”当成同一个 editor state。

## Toolbar 同步模型

观察下来，toolbar 更像遵循这套规则：

- 对象选择模式下，顶部 toolbar 保持通用或默认文本编辑状态。
- 对象级操作主要放在浮动 `align-toolbar`，不是通过顶部字体控件表达。
- 字体、字号、粗斜体这些文本控件，只有进入文字编辑或存在文字选区后才真正有意义。
- 一旦文字选区驱动过 toolbar，toolbar 可能会保留这个样式值，直到下一个明确状态覆盖它。

重要推论：Genspark 并不是在每次单击对象后读取该对象的 computed style 并同步到顶部 toolbar。

## 浮动对象工具条

观察到的类名：`align-toolbar`。

行为：

- 只在对象级选中时出现。
- 会跟随选中对象的位置变化。
- 文本对象和形状对象都会出现。
- 进入文字选区/编辑态后消失。

观察到的位置样例：

| 目标对象 | 浮动 toolbar style |
| --- | --- |
| 标题文字对象 | `left: 960px; top: 218px;` |
| 红色竖线形状 | `left: 200px; top: 158px;` |

这些坐标看起来是 slide/editor 内部坐标，再经过当前缩放比例映射到屏幕位置。

## 对 ai-slide 的含义

我们至少需要显式建模这几种状态：

1. `idle`
   - 没有 active object selection。
   - toolbar 可以显示默认值，或者保留上一次有意义的文本状态。

2. `object-selected`
   - 单击选中 `data-object="true"` 或等价的 slide object。
   - 展示对象边界框。
   - 展示一个贴近对象的小型浮动工具条。
   - 不要强制把顶部 toolbar 改成对象的 computed text style。
   - 字体类控件此时不应该被当作正在编辑该对象文本。

3. `text-editing`
   - 双击文本对象，或通过其他方式进入文字光标/文字选区。
   - 隐藏对象浮动工具条。
   - 顶部 toolbar 从真实文字选区或光标读取样式。
   - 字体、字号、B/I/U 等操作立刻作用于当前文字选区或光标位置。

4. `shape-selected`
   - 单击非文本对象。
   - 展示对象边界框和浮动对象工具条。
   - 顶部文本 toolbar 保持通用状态，不假装字体控件能作用于形状。

## 后续实现方向

- toolbar 仍然放在右侧整体编辑区顶部，不要跟着每个 iframe 走。
- 虽然有多个 iframe，但用户心智里只有一个右侧编辑区，因此我们也应该维护一个逻辑 editor selection。
- `data-object="true"` 可以作为对象选择边界，但还要区分 text-capable object 和 non-text object。
- 单击只进入对象选择。
- 双击 text-capable object 才进入文字编辑。
- 只有文字编辑态才从真实文本样式更新 toolbar。
- 对象态用浮动工具条承载移动、对齐、复制、删除等对象操作。
- 不要让字号、字体修改作用到普通 shape/object selection。
- host editor 的 CSS 不能影响 iframe 内 slide 内容的字号或布局。

## 仍需确认的问题

- 纯光标态和部分文字 range 选择时，Genspark 的 toolbar 是否完全一致。
- `align-toolbar` 里具体有哪些对象操作，以及是否因对象类型而变化。
- Genspark 的文字编辑到底是 iframe 内原生 `contenteditable`，还是外层 synthetic overlay。
- 进入文字选区后点击空白区域，Genspark 具体如何退出编辑态；当前观察到 toolbar 会保留上一次文本样式。

## 建议下一步

继续改代码前，先把我们自己的编辑状态机写清楚：

- 状态名
- 进入触发
- 视觉表现
- toolbar 数据来源
- 允许执行的命令
- 异步保存/本地文件更新行为

然后再把当前 `App.tsx` 里的逻辑映射到这套状态机上，移除“单击对象就读取真实文本样式并同步 toolbar”的行为。
