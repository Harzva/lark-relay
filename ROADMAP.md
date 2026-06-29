# lark-relay 生产路线图（MobileCode + Harvis + Lark 互通双向系统）

## 目标

将 `lark-relay` 从“单向收口”能力，升级为可支撑 MobileCode 与 Harvis 双向协作的生产系统：

- MobileCode 与本地 Mobile 产测结果可稳定回传到 Harvis（当前已具备方向）
- Harvis 的执行指令、状态变更、结果通知可稳定回流到 Lark（补齐方向）
- 在不引入公网入口的前提下，保证 Mac mini 本地链路的可靠性、安全边界与可观测性
- 形成可发布、可回滚、可审计的阶段性交付流程

## 使用规则

- `[x]` 只表示已有代码、测试、CI、端到端截图/日志或用户验收证明。
- `[ ]` 表示未完成、未验证、被阻塞、需用户输入或需要线上实测。
- 每个阶段完成时必须有一个清晰 Git commit；禁止把多个阶段混进同一个提交。
- 可使用 `cxsaprk` / `cxspark` 辅助 bounded 子任务，但 parent Codex 必须审查输出、diff 与验证证据后才能接受。
- 本文件只写公开安全信息；不得写入 token、cookie、`.env` 值、credential dumps、原始聊天日志或私有本机路径。

## 当前基线

- [x] `lark-relay` 已具备 npm CLI 骨架、GitHub 仓库、CI、README、协议文档、运维文档。
  - Evidence: `npm run check`、`npm test`、`npm run smoke`、`npm pack --dry-run` 已通过；GitHub Actions CI 成功。
- [x] 当前已支持 `MobileCode/Lark -> lark-relay -> Harvis localhost API` 的入站方向。
  - Evidence: 已实现 `mobilecode.evidence.v1` payload 解析、聊天白名单、事件去重、Harvis route-file 测试。
- [ ] 尚未完成 `Harvis -> lark-relay -> 现有 MobileCode` 的轻量接入闭环。
- [ ] 尚未完成真实 Lark profile、真实 chat id、真实 Harvis API 的端到端 live 验证。
- [ ] 尚未发布 npm registry 包；当前可通过 GitHub npx 方式运行。

## 当前执行顺序

- [x] P0：协议文档和 fixture。
  - Evidence: `docs/harvis-mobilecode-integration.md`、`schemas/mobilecode-harvis-task.schema.json`、`examples/harvis-mobilecode-task.project_check.json`、`examples/mobilecode-status.readonly.json`、`examples/mobilecode-action-evidence.project_check.json`。
- [ ] P1：只读状态桥。MobileCode 导出 status/evidence JSON，Harvis 在 Agent Room 只读展示。
- [ ] P2：单个 approval-gated handoff。只支持 `project_check` 或 `validate`。
- [ ] P3：接 GitHub Pages / Actions / mobile smoke evidence；需要安卓部署时使用 Android emulator 测试。

## 阶段 0：治理与基线（已启动）

- 建立路线图与变更日志（本文件）
- 建立发布治理清单：
  - 每个阶段必须至少形成一个 Git 提交，提交信息格式：
    - `feat(roadmap): ...`
    - `chore(phase): ...`
    - `fix(phase): ...`
  - 关键事件需在 `docs/` 与 `README.md` 同步说明
- 明确“父级审阅”规则：
  - 对于复杂子任务可用 `cxsaprk`/`cxspark` 做 bounded assisted implementation
  - 所有辅助产出必须由 parent Codex 审查 diff 与验证结论后才能收敛

## 阶段 1：能力盘点与协议收敛（MVP）

### 目标
梳理当前链路，补齐 MobileCode 到 Harvis 的行为一致性约束，并定义 Harvis 到 Lark 的回流协议雏形。

### 工作项
- 盘点现有事件流：`Lark -> Relay -> Harvis` 与 `Harvis 回执 -> Lark` 的字段映射
- 定义反向方向统一事件模型（任务状态、证据、批准动作、失败提示、MobileCode 指令）
- 在 docs 中冻结 payload 字段约定，避免后续接口漂移
- 形成兼容矩阵：支持旧 MobileCode payload 的降级解析，禁止破坏既有行为

### 交付标准
- `docs/protocol.md` 与 `docs/operations.md` 明确双向路由约定（字段与幂等边界）
- 回归已有 `mobilecode.evidence.v1` 吞吐场景不变

### 风险与对策
- 风险：反向 payload 与现有 Lark 告警语义冲突
- 对策：先只支持只读回流（状态摘要/链接）模式，保持动作指令幂等

## 阶段 2：Harvis 回流到 Lark（生产化）

### 目标
把 Harvis 事件映射为 Lark 可读且可追溯的回执渠道，形成“人可见”的反向链路。

### 工作项
- 增加/完善 Harvis 客户端事件订阅与轮询/推送策略（取决于 Harvis 部署能力）
- 增加路由层：将 Harvis 的任务状态、证据、错误和人工确认点变为 Lark 消息
- 约束回传：
  - 禁止来自 Lark 的任意命令执行外壳
  - 所有可执行动作仅为“已授权、可审计、已记录”类型
  - 采用事件级幂等键避免重复推送

### 交付标准
- 从 Harvis 侧发起一次任务更新后，Lark 在限定时间内可见对应回执
- 对应回执至少包含：`task_id`、`状态`、`证据链接`、`下一步`
- 提供回溯日志（便于用户问题定位）

### 风险与对策
- 风险：回传消息导致触发循环或刷屏
- 对策：配置最小权限触发、路由白名单、速率限制与去重

## 阶段 3：MobileCode 轻量接入闭环

### 目标
让 Harvis 不只是“收到 MobileCode 结果”，还可以通过受控协议把任务交给已有 MobileCode 执行。

本阶段只做接入，不搬运、不复刻、不重写 MobileCode 的核心能力。
`lark-relay` 负责消息、路由、鉴权、幂等、回执与证据格式；MobileCode 继续负责移动端执行能力。

### 非目标
- 不把 MobileCode 全量搬进 `lark-relay`。
- 不在 `lark-relay` 内实现手机控制、模型推理、App QA 或 GitHub/文档交付能力。
- 不维护第二套 MobileCode 调度器；只维护协议转换与回执链路。

### 工作项
- 盘点 MobileCode 已有入口：CLI、HTTP、本地脚本、队列或现有 agent mail/Lark 接口。
- 定义最小 `mobilecode.command.v1`：任务类型、输入、权限、超时、回执、证据字段。
- 新增薄 adapter，而不是新 runtime：
  - 把 Harvis 任务转换为 MobileCode 已支持的输入格式。
  - 把 MobileCode 输出归一化为 `mobilecode.evidence.v1`。
  - 保留 MobileCode 自己的执行、模型、手机控制、GitHub/文档能力。
- 在 Harvis 侧建立任务状态机：`queued -> accepted -> running -> needs_human -> completed/failed`。
- 增加人工批准点：高风险动作如发布、提交、删除、账号操作必须先进入批准流。

### 交付标准
- Harvis 创建一个 MobileCode 任务后，已有 MobileCode 能接收并返回状态。
- 完成任务必须产生证据：日志、截图、链接、提交 SHA 或文档地址之一。
- 失败任务必须给出可行动错误：原因、下一步、是否可重试。
- `lark-relay` 不包含手机控制实现、不复制 MobileCode 内部 agent、不重写 MobileCode 调度器。

### 风险与对策
- 风险：把 `lark-relay` 做成第二套 MobileCode，导致维护两套执行器。
- 对策：只实现协议 adapter；所有移动端执行能力留在 MobileCode 仓库或已有运行时。
- 风险：把 MobileCode 暴露成任意远程执行器。
- 对策：只允许白名单 task type；禁止 Lark 文本直接变 shell；所有执行动作必须有结构化 payload 与审计记录。

## 阶段 4：可靠性与安全增强（SLA 阶段）

### 目标
把双向系统提升到生产可运行水平，重点在可用性与安全边界。

### 工作项
- 引入重试退避与死信策略（可恢复失败、可人工介入）
- 增强 state/evidence 持久化策略，避免进程重启后事件丢失
- 统一 dry-run / live 模式开关与配置审计（环境变量/配置文件记录）
- 引入最小权限与敏感字段清洗（路径、token、Cookie、原始私有路径不可入库）
- 完善 `safety` 与 `route` 配置的校验提示

### 交付标准
- 在网络抖动和短时 Harvis 不可达条件下，关键事件仍可追踪与重放
- 安全扫描清单通过：不接受私密信息明文落盘，不执行 Lark 触发 shell

## 阶段 5：运行治理与长期演进（规模化）

### 目标
将系统从“功能可用”推向“长期运维可控”。

### 工作项
- 建立发布与回滚流程：
  - 配置版本化（含回滚脚本）
  - 阶段性灰度与回退预案
- 建立监控面板指标（事件量、失败率、延迟、重试率、去重命中率）
- 制定变更窗口与事故演练（Relay 崩溃、Harvis 停服务、Lark 认证过期）
- 准备跨终端协作：移动端与桌面端统一任务视图

### 交付标准
- 能在单页发布说明中描述“问题定位 -> 处理 -> 复盘”的完整闭环
- 提供标准运维手册，支持按步骤恢复双向路由

## 执行治理要求（强制）

1. 阶段边界提交
   - 每个阶段至少一个提交，禁止跨阶段混合提交
   - 每次提交需可复现：提交说明与变更范围一一对应

2. 审核与分工
   - 辅助开发可使用 `cxsaprk` / `cxspark` 处理 bounded 子任务
   - 所有子任务产出必须经 parent Codex 审阅 diff 与验证证据后归档

3. 安全与合规
   - 文档与代码中不得出现 token、cookie、`.env` 值、credential dumps、原始私钥路径或隐私聊天日志
   - 仅使用可公开安全审计的配置样例

4. 上线前校验
   - 配置检查通过
   - 路由幂等策略明确
   - dry-run 与 live 模式切换有日志与审计记录

## 里程碑示例（时间与交付）

- M0：完成阶段 0 与阶段 1（本路线图冻结与协议收敛）
- M1：完成阶段 2（Harvis 回流 Lark 可用）
- M2：完成阶段 3（Harvis 轻量接入已有 MobileCode 可用）
- M3：完成阶段 4（可靠性与安全增强）
- M4：完成阶段 5（治理与规模化运行）
