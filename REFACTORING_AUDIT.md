# AI Office 小规模重构审计

本文档记录当前分支围绕 `doc`、`slide`、`sheet` 三个办公编辑器品类做过的整理，以及截至 2026-06-25 仍未处理完的欠账。

## 总目标

这个分支不是做大功能，而是把三个品类整理成同一套办公编辑器产品体系：

- 分层清晰：共享底层能力、app 内领域能力、web 交互、server 编排各自有边界。
- 结构对称：三个品类的目录、入口、接口、状态管理方式尽量同构，差异只留给真实领域差异。
- 依赖反转：公共流程依赖接口和注入对象，不直接依赖某个具体品类实现。
- 文件可维护：没有特殊必要，单文件不超过 600 行。
- 稳定性生产化：前后端都有全局错误兜底，不能因为一次渲染或接口异常就黑屏或进程 crash。

## 1. 架构、分层、复用、依赖反转

### 已处理

- 三个品类保持同构目录：`shared/src`、`server/src/artifact`、`server/src/local`、`web/src/app`、`web/src/artifact`、`web/src/api`。
- `ArtifactAppHttpRoutes` 已经泛型化，create/update/AI edit DTO 由各品类注入，避免共享 route 反向依赖具体 app。
- server 文件上传、导入、导出、二进制响应已抽到 `@ai-app/shared/server-files`，doc/slide/sheet 入口复用同一套底层处理。
- server 统一错误处理已抽到 `@ai-app/shared/server-errors`，三个 server 入口统一注册 Fastify error handler 和 process-level error handlers。
- 前端编辑器外壳已向 `@ai-app/ui/editor-frame` 收敛，doc/slide/sheet 复用 `ArtifactEditorWorkspace`。
- app reset 已抽到 `@ai-app/ui/app-reset.css`，三个 web 入口统一导入。
- 共享错误边界已抽到 `@ai-app/ui/error-boundary`，三个 web 入口统一使用 `ArtifactAppRoot`，局部编辑工作区使用共享 fallback。
- agent conversation UI、doc/slide/server/web 的多个巨型文件已经拆成更小的领域模块。
- 新增守护脚本：
  - `pnpm check:parity`
  - `pnpm check:file-size`
  - `pnpm check:import-boundaries`
  - `pnpm check:css-layering`

### 仍未处理完

- `sheet` 的能力面仍然明显少于 doc/slide。结构已经对称，但 agent tool routes、i18n provider、模板能力、导入导出深度还没有和前两个品类完全同构。
- 三个品类的 web app model 还没有形成共享 hook 层。项目列表、导入、删除、运行事件、agent conversation、export notice 等通用工作流仍主要留在各 app 内部。
- `server/src/main.ts` 的 composition root 生命周期还可以继续统一。doc/slide/sheet 现在都接入了共享错误和文件能力，但启动恢复、active run 中断、模板初始化这类生命周期接口还不够同构。
- `templates` 的来源和生成资产策略仍需收敛。尤其 slide 的 generated template catalog 目前仍作为生成源码存在，长期更适合走 server/provider manifest。
- 依赖边界检查已经覆盖 server 禁引前端包等高风险路径，但还可以继续补充更细的 app-local 边界，例如 web 禁止直接 import `templates` 原始目录。

## 2. 代码整理、减少巨无霸文件

### 已处理

- `pnpm check:file-size` 已接入根 `pnpm check`。
- 业务/runtime 源码已经压到 600 行以内。
- `apps/doc/web/src/artifact/runtime/operations.ts` 已拆为 `operations/` 下的多个模块，根文件只保留 barrel export。
- 重点巨型文件已拆分：
  - doc web workbench model
  - doc Markdown editor
  - doc HTML runtime DOM helpers
  - doc document service
  - slide project repository
  - slide deck editor model
  - slide deck DOM helpers
  - shared agent conversation UI

### 当前白名单

| 行数 | 文件 | 判断 |
| ---: | --- | --- |
| 8307 | `apps/slide/shared/src/generatedTemplates.ts` | 生成模板目录，短期白名单；长期建议改为数据文件或 server/provider manifest |
| 2217 | `apps/slide/scripts/restyle-slide-template-batch.mjs` | 一次性模板迁移脚本，短期白名单；若继续使用，应拆 pipeline/helper |

### 仍未处理完

- 多个业务文件已经低于 600 行但贴近上限，例如 `useDeckEditorModel.ts`、`htmlRuntimeDom.ts`、`document-service.ts`、`project-repository.ts`。后续新增逻辑时应优先继续拆，而不是把它们重新顶回超线。
- `operations/` 的第一次拆分以行为稳定为优先，部分 helper 现在为了模块间复用被导出。下一轮可以继续把 helper 收窄为更语义化的内部模块，减少 barrel 暴露面。
- 还缺少针对 doc runtime operations 的单元测试。拆分已经由 TypeScript 守住编译，但编辑器行为仍建议补 DOM-level 测试覆盖 inline style、table merge/split、link/image 操作。
- shared UI 中 `rich-text`、`toolbar` 等文件接近上限，后续扩展前最好先拆。

## 3. 稳定性、全局错误捕获、生产级兜底

### 已处理

- 三个 web 入口统一使用 `ArtifactAppRoot`，包含 React ErrorBoundary 和 browser-level `error` / `unhandledrejection` 兜底。
- doc 局部工作区的旧 app-specific ErrorBoundary 已替换为共享 `ArtifactSurfaceErrorFallback`。
- 三个 server 入口统一注册共享 Fastify error handler，错误响应格式和状态映射集中在 `@ai-app/shared/server-errors`。
- 三个 server 入口统一安装 process-level `unhandledRejection` / `uncaughtException` 日志兜底。
- API client 和局部 app state 的错误展示仍保留，前端既有局部错误不会被全局兜底吞掉。

### 仍未处理完

- 缺少稳定性 smoke test：
  - 前端渲染异常不黑屏
  - `unhandledrejection` 能进入统一 fallback/toast
  - API 500 返回统一 `{ error, code? }`
  - server 未捕获 route 异常能被共享 handler 接住
- iframe/Office runtime 的子上下文错误还没有统一上报通道。doc HTML iframe、slide deck iframe/DOM 编辑、office-preview runtime 都需要 adapter-level error callback 或 postMessage 错误通道。
- WebSocket 断线/重连和 replay 行为还没有形成三品类一致的前端恢复抽象。
- 错误码体系仍偏轻量。现在已有共享 `ArtifactAppError`，但更多业务错误还需要从字符串判断迁移到明确 code。

## 当前验证状态

- `pnpm --filter @ai-doc/web check`
- `pnpm check:file-size`
- `pnpm check:import-boundaries`
- `pnpm check:parity`

后续在合并前还应跑完整 `pnpm check`，并由产品侧做一次 doc/slide/sheet 的导入、编辑、AI 修改、导出回归。
