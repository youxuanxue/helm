# Helm 技术架构

**文档类型**：技术架构规格  
**产品**：Helm  
**目标读者**：架构师、工程师、适配器开发者  
**关联文档**：[产品架构](./opc_product_architecture_jobs.md)、[CompanySpec](./opc_companyspec_integrated.md)、[AgentSpec](./opc_agentspec_integrated.md)  
**版本**：1.1  
**日期**：2026-03-16

---

## 0. 产品 ↔ 技术映射

| 产品概念 | 技术对应 |
|----------|----------|
| Company | `companies` + [CompanySpec](./opc_companyspec_integrated.md) |
| CEO | Board（人类） |
| COO | 规划与调度 Agent，Heartbeat 驱动 |
| 任务流 | AgentTaskGraph + [Handoff 协议](./opc_agentspec_integrated.md#3-part-bagent-协同协议handoff-protocol) |
| 开箱模板 | company_templates + 零配置 + 快速调度 |
| 治理可见 | Dashboard、budget auto-pause、无静默修复 |

---

## 1. 架构概览

融合 OPC + Paperclip，实现「单人驱动的多智能体协作」：

- **Company 为核心**：公司是第一公民，Company Spec 锚定所有需求；规格见 [CompanySpec](./opc_companyspec_integrated.md)
- **控制面与执行面分离**：控制面只编排、调度、治理，不运行 Agent
- **单一决策网关**：Board 仅与 COO 交互，业务 Agent 经 COO 上报
- **任务流 DAG + 树形层级**：流水线协作与目标追溯；Agent 间交接见 [Handoff Protocol](./opc_agentspec_integrated.md#3-part-bagent-协同协议handoff-protocol)
- **AgentSpec 契约**：可校验、可替换；规格见 [AgentSpec](./opc_agentspec_integrated.md)
- **显式回退**：CheckState 非法 → 回传上游，不静默掩盖
- **租户与审计**：company_id 贯穿、Activity Log、Cost Events

---

## 2. 系统分层

```
┌─────────────────────────────────────────────────────────────────┐
│  Board / CEO（人类）                                              │
│  唯一入口：审批任务图、决策上报、验收                               │
└───────────────────────────────────────────┬───────────────────────┘
                                            │
┌───────────────────────────────────────────▼───────────────────────┐
│  控制面（OPC Control Plane）                                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐│
│  │ 任务图服务   │ │ 调度器       │ │ 审批/治理    │ │ 成本/审计   ││
│  │ AgentTaskGraph│ │ Heartbeat   │ │ Approvals    │ │ Cost/Activity││
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘│
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ REST API · 统一端点 · Board/Agent 分离鉴权                      │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────┬───────────────────────┘
                                            │ Adapter 接口
┌───────────────────────────────────────────▼───────────────────────┐
│  执行面（Adapter + Agent 运行时）                                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                 │
│  │ COO     │ │ MetaAgent│ │ Agent 1 │ │ Agent N │  ...             │
│  │ (Agent) │ │ (Agent)  │ │(AgentSpec)│(AgentSpec)│                 │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘                 │
│  process | http | openclaw | cursor | ...                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心数据模型

### 3.1 租户与组织

#### CompanySpec（公司规格约束）

OPC 以 **Company** 为核心实体。创建公司时必须填写 Company Spec，所有需求、任务、Agent 皆归属公司且需与公司目标对齐。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | uuid | — | 主键 |
| `name` | text | ✓ | 公司名称 |
| `mission` | text | ✓ | 公司目标（冗余，便于查询） |
| `target_audience` | text | ✓ | 服务对象摘要（冗余，便于查询） |
| `company_spec` | jsonb | ✓ | 完整 CompanySpec，见 [整合规范](./opc_companyspec_integrated.md)；含 identity、mission、target_audience（含 segments）、goals、deliverables、quality_standards |
| `output_types` | text[] | 建议 | 关键产出类型（可从 company_spec.deliverables 派生） |
| `status` | enum | ✓ | active \| paused \| archived |
| `created_at` | timestamptz | — | 创建时间 |
| `updated_at` | timestamptz | — | 更新时间 |

**约束**：
- 所有业务实体带 `company_id`，跨公司访问禁止
- `goals` 根节点须对应 `company_spec.mission` 或 `company_spec.goals`，所有 issues 可追溯至 company goal
- COO 拆解需求时以 `company_spec` 为上下文，保证任务对齐公司目标与服务对象

| 实体 | 说明 | 关键字段 |
|------|------|----------|
| `companies` | 公司，一等公民 | id, name, mission, target_audience, company_spec (jsonb), status |
| `agents` | Agent 员工 | id, company_id, name, role, reports_to, adapter_type, adapter_config, status |
| `agent_api_keys` | Agent 鉴权 | id, agent_id, key_hash |

### 3.2 目标与任务层级（树形 + DAG）

```
Company Goal (Initiative)
  └── Project
        └── Milestone
              └── Issue (Task) ←── parent_id（树形）
                    └── Sub-issue

任务流图（DAG）：
  ActionNode 1 ──depends_on──> ActionNode 2 ──> ActionNode 3
       │                            │
       └──depends_on──> ActionNode 4 ──┘
```

| 实体 | 说明 | 关键字段 |
|------|------|----------|
| `goals` | 目标层级 | id, company_id, title, level, parent_id |
| `projects` | 项目 | id, company_id, goal_id, name, status |
| `issues` | 任务（树形） | id, company_id, project_id, parent_id, title, status, assignee_agent_id |
| `action_nodes` | 任务流节点（DAG） | id, company_id, issue_id, spec_ref, depends_on[], status |
| `action_edges` | 任务流边 | from_node_id, to_node_id |

**融合设计**：`issues` 保留 Paperclip 的树形 + 目标追溯；`action_nodes` / `action_edges` 实现 OPC 的 AgentTaskGraph，支持多 Agent 流水线。

### 3.3 AgentSpec 契约

规范见 [AgentSpec](./opc_agentspec_integrated.md)。技术实现：`spec_ref` 指向 AgentSpec；CheckState 非法时按回退约束回传上游（§8）。

### 3.4 治理与审计

| 实体 | 说明 | 关键字段 |
|------|------|----------|
| `approvals` | 审批请求 | type: task_graph | hire_agent | decision_escalation, status, payload |
| `activity_log` | 审计日志 | actor_type, action, entity_type, entity_id, details |
| `cost_events` | 成本事件 | agent_id, issue_id, input_tokens, output_tokens, cost_cents |
| `heartbeat_runs` | 心跳运行 | agent_id, status, started_at, finished_at |

---

## 4. 接口契约

### 4.1 Adapter 接口

```ts
interface AgentAdapter {
  invoke(agent: Agent, context: InvocationContext): Promise<InvokeResult>;
  status(run: HeartbeatRun): Promise<RunStatus>;
  cancel(run: HeartbeatRun): Promise<void>;
}
```

- `invoke`：启动 Agent 周期
- `status`：查询运行状态
- `cancel`：Board 暂停时发送终止信号

### 4.2 Agent 执行契约

见 [AgentSpec](./opc_agentspec_integrated.md) §2、§3（输入校验、执行、输出、决策上报）。

### 4.3 原子任务认领

```http
POST /issues/:issueId/checkout
{ "agentId": "uuid", "expectedStatuses": ["todo","backlog","blocked"] }
```

- 单 assignee，原子 SQL 更新
- 冲突返回 409，携带当前 owner/status

### 4.4 Agent 协同（Handoff）

协议见 [AgentSpec](./opc_agentspec_integrated.md) §3。实现：`InvocationContext` 等价于 HandoffRequest；Adapter 产出组装为 HandoffResponse；控制面据此更新 action_node。

---

## 5. 决策网关与权限

### 5.1 通道约束

| 角色 | 可交互对象 | 禁止 |
|------|------------|------|
| Board/CEO | COO、审批 API、任务/预算覆盖 | 直接对业务 Agent 下指令 |
| COO | 所有 Agent、MetaAgent、任务图、Board | — |
| 业务 Agent | COO、下游 Agent（经 Outputs） | 直接联系 Board |
| MetaAgent | COO、新创建的 Agent | — |

### 5.2 审批类型

| type | 触发方 | 说明 |
|------|--------|------|
| `task_graph` | COO | AgentTaskGraph 审批，通过后创建 ActionNodes、调度 |
| `hire_agent` | COO/Agent | 新建 Agent，Board 批准后落库 |
| `decision_escalation` | COO | 业务 Agent 上报的决策请求，COO 无法自动决策时转交 |

---

## 6. 任务流 DAG 与调度

### 6.1 AgentTaskGraph 结构

- **节点**：ActionNode，绑定 AgentSpec 引用、Inputs/Outputs 模板
- **边**：depends_on，有向无环
- **生成方**：COO
- **审批方**：Board

### 6.2 调度语义

1. 入度为 0 的节点可被调度
2. 节点完成（TaskState=succeed）后，触发下游节点 Inputs 注入
3. 节点失败（TaskState=failed）→ 按 AgentSpec 约束回传上游，可选重试
4. Board 可暂停任意节点或整图

### 6.3 与 Paperclip Heartbeat 的关系

- COO 自身由 Heartbeat 驱动：周期性唤醒，拉取待办、生成/更新任务图、调度
- 业务 Agent 可由 Heartbeat 唤醒（拉取 assignee 任务），或由上游 Output 直接触发（webhook）

### 6.4 Issue 与 ActionNode 的简化模式

- **简单任务**：单 Agent 可完成时，issue 可直接分配，无需展开 DAG；action_node 可为空或 1:1 绑定
- **流水线任务**：多 Agent 协作时，一个 issue 下挂多个 action_nodes，形成 DAG
- 产品层统一呈现为「任务流」，用户不区分 tree vs DAG

---

## 7. 成本与预算

- **成本归集**：cost_events 按 agent_id、issue_id、project_id、company_id 聚合
- **预算层级**：company → agent
- **硬顶**：达限 auto-pause Agent，Board 可覆盖
- **billing_code**：跨 Agent 协作时，下游成本归属上游请求

---

## 8. 错误与恢复

| 策略 | 说明 |
|------|------|
| 显式回退 | CheckState 非法 → 回传上游，不静默修复 |
| 暴露问题 | 挂起、超时、失败在 Dashboard/Activity 可见，不自动 reassign |
| Board 覆盖 | 人类可强制 reassign、cancel、resume |

---

## 9. 部署与扩展

- **本地**：嵌入 PGlite，零配置
- **Docker**：外部 Postgres，可选
- **Hosted**：Supabase/兼容 Postgres
- **Adapter**：process、http、openclaw、cursor 等可插拔注册
- **开箱模板**：预置「内容创作公司」「技术研发公司」等，含完整 CompanySpec + AgentSpec；可存静态 YAML/JSON 或 `company_templates` 表；对应产品层「选模板」= 0 填写
