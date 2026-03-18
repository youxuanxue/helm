# Helm 研发交付审计与修订计划（对照 docs）

> 审计基线：`opc_product_architecture_jobs.md`、`opc_technical_architecture.md`、`opc_implementation_plan.md`、`opc_companyspec_integrated.md`、`opc_agentspec_integrated.md`

## 1) 本轮已完成（实现 + 优化）

### A. 租户边界与输入约束强化

- `POST /issues/:id/checkout`：
  - 增加 `issueId/agentId` 格式校验；
  - 增加 `expectedStatuses` 白名单校验；
  - 强制 `agent.company_id === issue.company_id`，拒绝跨公司认领。
- `POST /approvals/:id/approve`：
  - 增加 `approvalId` 校验；
  - `task_graph` 审批落库前校验 `issue_id` 公司归属；
  - 校验 DAG 边必须引用同一审批 payload 内已声明节点；
  - `decision_escalation` 处理时校验 `node_id/issue_id` 归属公司。
- `POST /approvals/:id/reject`：
  - 增加 `approvalId` 与 `decision_escalation` 关联字段校验；
  - 更新 issue 状态时增加 `company_id` 约束。
- `POST /action-nodes/:id/handoff` / `GET /action-nodes/:id/context`：
  - 增加 `nodeId` 校验；
  - 强制 `handoff.task_id` 与路径节点一致；
  - 上游依赖节点查询增加 `company_id` 过滤，避免跨租户数据泄露；
  - JSON 解析使用安全分支，避免脏数据导致接口崩溃。
- `POST /agents`：
  - 增加 `company_id/name/reports_to` 校验；
  - `reports_to` 必须指向同公司已存在 agent。

### B. 数据模型补齐（与实施计划/技术架构对齐）

- 新增并迁移以下表：
  - `company_templates`
  - `goals`
  - `projects`
- 同步补齐 Drizzle schema 导出，保证后续 API/调度可直接接入这些实体。

## 2) 对照 docs 的当前覆盖度

### 已覆盖（MVP 主闭环）

- 公司创建（模板/手工）→ 提需求 → COO 生成任务图审批 → 审批后创建 action nodes → Heartbeat 调度。
- Agent 协同协议关键端点：`/issues/:id/checkout`、`/action-nodes/:id/context`、`/action-nodes/:id/handoff`。
- 治理能力：审批流、预算硬顶、活动日志、成本归集、节点暂停/恢复、心跳状态查询。
- 关键工程约束：
  - 外部请求体字节上限；
  - 路径敏感字段校验（拒绝 `..` 与 `/`）；
  - CLI 配置采用临时文件 + rename 原子写。

### 仍待增强（完全体目标）

- 调度层目前完成“可运行节点选择与状态推进”，但 **未内建 Adapter 自动调用闭环**（当前需 agent 侧 handoff 上报触发后续推进）。
- `goals/projects/company_templates` 已落库，但缺少对应 CRUD/API 与前端可视化管理。
- Dashboard 当前已覆盖核心状态/成本/任务，但与产品文档中“谁在干什么、卡在哪、花了多少”的完整运营视图仍可进一步聚合（如活动时间线分组、阻塞原因诊断视图）。
- 自动化测试体系仍以构建验证 + 端到端接口验证为主，缺少长期回归的脚本化测试集。

> 注：上述差距在后续迭代已进一步收敛：调度层已支持 Adapter invoke/status 轮询、`input_required` 自动升级审批、agent 预算硬顶（超限自动暂停）与 `GET /companies/:id/costs/agents` 成本可视；CLI `status` 亦已补充阻塞与成本摘要。

## 3) 修订计划（迭代到 fully aligned）

### Iteration A：执行闭环补齐（高优先）

1. 在调度器引入 Adapter dispatch 层：
   - `running` 节点自动触发 adapter `invoke`；
   - 周期查询 `status` 并自动写回 handoff/state。
2. 统一 `action_node` 与 `heartbeat_run` 关联日志，补齐失败重试与可观测性字段。
3. 增加 `decision_escalation` 的上下文快照，便于 Board 直接决策。

### Iteration B：目标层产品化（中优先）

1. 提供 `goals/projects` API 与基础页面；
2. 将需求、任务流、交付物关联到目标层级，实现“issue 可追溯到 company goals”；
3. 支持模板中心（`company_templates`）增删改查与版本化。

### Iteration C：质量门禁与回归（中优先）

1. 增加 API 端到端回归脚本（覆盖租户隔离、审批、handoff、预算硬顶）；
2. 增加关键路由 contract tests（输入边界、状态机转换）；
3. 在 CI 引入构建 + 核心回归测试门禁。

---

该计划按“先执行闭环、再目标层、最后回归门禁”的顺序推进，可在不破坏现有 MVP 体验的前提下持续收敛到 docs 完全对齐状态。
