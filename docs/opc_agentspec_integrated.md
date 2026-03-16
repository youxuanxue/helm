# Helm AgentSpec 整合规范

**产品**：Helm  
**定位**：Agent 定义规范 + Agent 协同对接协议（Handoff）  
**关联文档**：[Helm 产品架构](./opc_product_architecture_jobs.md)、[Helm 技术架构](./opc_technical_architecture.md)、[CompanySpec](./opc_companyspec_integrated.md)  
**版本**：1.0

---

## 1. 概述

### 1.1 范围

本规范定义两类内容：

| 类别 | 说明 | 行业对应 |
|------|------|----------|
| **Agent 定义（AgentSpec）** | Agent 身份、能力、输入校验、执行配置 | OSSA manifest、Oracle Agent Spec |
| **Agent 协同协议（Handoff Protocol）** | Agent 间任务交接、输入输出格式、状态流转 | A2A Task/Message/Artifact |

两者一体：Agent 定义描述「我是谁、能做什么」；协同协议描述「如何与其它 Agent 对接、如何传递工作」。

### 1.2 设计原则

- **纯 Agent 协同**：面向 Agent↔Agent 协作，不涉及人类直接参与执行链路
- **可校验**：核心字段强约束，扩展字段可选 schema
- **可发现**：Agent 能力可被 COO、MetaAgent、下游 Agent 发现与调用
- **可追溯**：输入、输出、状态均有结构化表示，支持审计与回退
- **行业对齐**：兼容 OSSA、A2A、MCP 的关键结构，便于互操作

---

## 2. Part A：Agent 定义（AgentSpec）

### 2.1 核心结构

```yaml
AgentSpec:
  # === 身份（必填）===
  identity:
    id: string          # 唯一标识，如 uuid
    name: string        # 人类可读名称
    version?: string    # 语义化版本，如 "1.0.0"
    description?: string # 能力简述，供 COO/下游 Agent 发现

  # === 输入与校验（必填/建议）===
  inputs:
    schema: object      # JSON Schema，定义业务参数
    checkRules?: array  # 可选的显式校验规则引用

  # === 状态枚举（强约束）===
  CheckState: pending | running | succeed | failed | cancelled | timeout  # 校验阶段
  TaskState:  pending | running | succeed | failed | cancelled | timeout  # 执行阶段

  # === 执行配置（必填）===
  execution:
    owner_agent: string   # 归属 Agent ID
    adapter_ref: string   # 适配器类型：process | http | openclaw | cursor ...
    adapter_config: object # 适配器专属配置

  # === 能力（建议，兼容 MCP）===
  skills:
    - id: string
      name: string
      description?: string
      inputSchema?: object  # JSON Schema，兼容 MCP tool schema

  # === 输出与下游映射（必填）===
  outputs:
    downstream: array    # [{ output_key, target_agent_id }]
    part_types?: array  # 支持的 Part 类型：text | file | data | json
```

### 2.2 分层 Template

| 层级 | 字段 | 约束 | 说明 |
|------|------|------|------|
| **核心层** | identity.id, identity.name | 必填 | Agent 身份 |
| **核心层** | CheckState, TaskState | 强枚举 | 状态机，可校验 |
| **核心层** | execution | 必填 | 适配器与归属 |
| **扩展层** | inputs.schema | 可选 JSON Schema | 业务参数，可渐进收紧 |
| **扩展层** | skills | 可选 | 可对接 MCP |
| **扩展层** | outputs.downstream | 必填（协同时） | 下游 Agent 映射 |
| **扩展层** | outputs.part_types | 建议 | 与 A2A Part 对齐 |

### 2.3 回退约束

当 CheckState 中任一结果为 `failed` | `cancelled` | `timeout` 时：

1. 当前 Agent 运行终止
2. 取消所有 Skills，更新 TaskState
3. 将错误信息封装为 **HandoffResponse**（status=failed, error）回传上游
4. 上游 Agent 以 `(原输入 + 错误信息)` 重新运行或上报 COO

---

## 3. Part B：Agent 协同协议（Handoff Protocol）

### 3.1 协议角色

| 角色 | 说明 | OPC 对应 |
|------|------|----------|
| **发起方** | 将任务交给下游 Agent 的 Agent 或 COO | 上游 ActionNode、COO |
| **接收方** | 接收任务并执行的 Agent | 下游 ActionNode、业务 Agent |

### 3.2 任务交接数据模型（借鉴 A2A Task + Message）

#### 3.2.1 HandoffRequest（发起方 → 接收方）

```yaml
HandoffRequest:
  task_id: string       # 任务唯一 ID，对应 action_node_id 或 issue_id
  session_id?: string   # 会话 ID，多轮协作时复用
  message:
    role: "user" | "system"   # 发起方身份
    parts: Part[]             # 输入内容，见 Part 类型
  metadata:
    company_id: string
    request_depth: int        # 跨团队请求深度
    billing_code?: string     # 成本归属
    parent_task_id?: string   # 父任务，用于追溯
```

#### 3.2.2 Part 类型（借鉴 A2A Part）

| part_type | 说明 | 示例 |
|-----------|------|------|
| `text` | 纯文本 | objective、说明、提示 |
| `file` | 文件引用（URL 或 object_key） | 文档、图片 |
| `data` | 结构化 JSON | 表单、参数 |
| `json` | JSON 对象/数组 | 复杂结构化数据 |

```yaml
Part:
  type: text | file | data | json
  text?: string        # type=text
  url?: string         # type=file
  inline_base64?: string
  mimeType?: string
  data?: object        # type=data | json
```

#### 3.2.3 HandoffResponse（接收方 → 发起方 / COO）

```yaml
HandoffResponse:
  task_id: string
  status:
    state: submitted | working | input_required | succeed | failed | cancelled | timeout
    message?: Part[]   # 状态说明
    timestamp: string  # ISO 8601
  artifacts?: Artifact[]  # 产出，见下
  error?:                 # 失败时
    code: string
    message: string
    details?: object
```

#### 3.2.4 Artifact（借鉴 A2A Artifact）

```yaml
Artifact:
  name?: string
  description?: string
  parts: Part[]
  index: int
  append?: boolean    # 是否支持流式追加
```

### 3.3 状态映射（OPC ↔ A2A）

| OPC CheckState / TaskState | A2A TaskState | 说明 |
|----------------------------|---------------|------|
| pending | submitted | 已接收，未开始 |
| running | working | 执行中 |
| — | input_required | 可选扩展：等待上游/人类输入 |
| succeed | completed | 成功完成 |
| failed | failed | 执行失败 |
| cancelled | canceled | 已取消 |
| timeout | failed | 超时视为失败 |

### 3.4 协同流程

```
上游 Agent                    接收方 Agent
     │                              │
     │  1. HandoffRequest           │
     │  (task_id, message.parts)    │
     ├─────────────────────────────>│
     │                              │
     │  2. 校验 Inputs (CheckRules)  │
     │     CheckState = running      │
     │  3. 执行 Skills               │
     │     TaskState = running       │
     │  4. 产出 Artifact             │
     │     TaskState = succeed       │
     │                              │
     │  5. HandoffResponse           │
     │  (status, artifacts)         │
     │<─────────────────────────────┤
     │                              │
     │  若失败：HandoffResponse      │
     │  (status=failed, error)       │
     │  按回退约束回传上游           │
```

### 3.5 决策上报（非纯 Agent 协同的边界）

当接收方 Agent 遇需人类决策事项时：

1. **不得**直接联系 Board，须经 COO
2. 通过 **HandoffResponse** 的 `status.state = input_required`，并附带 `message.parts` 描述决策事项
3. COO 拉取后自动决策或提交 Board 审批
4. 决策结果经 COO 以新的 **HandoffRequest** 回传该 Agent

---

## 4. 整合后的完整 AgentSpec 示例

```yaml
apiVersion: opc/agentspec/v1
kind: Agent

identity:
  id: agent-research-001
  name: 市场调研Agent
  version: "1.0.0"
  description: 负责竞品与市场调研，产出结构化报告

inputs:
  schema:
    type: object
    properties:
      objective: { type: string, description: "调研目标" }
      scope: { type: array, items: { type: string } }
      deadline: { type: string, format: date-time }
    required: [objective]

CheckState: [pending, running, succeed, failed, cancelled, timeout]
TaskState:  [pending, running, succeed, failed, cancelled, timeout]

execution:
  owner_agent: agent-research-001
  adapter_ref: process
  adapter_config:
    command: python
    args: [run_research.py]

skills:
  - id: web_search
    name: 网络检索
    description: 检索公开信息
    inputSchema:
      type: object
      properties:
        query: { type: string }
        max_results: { type: integer, default: 10 }

outputs:
  downstream:
    - output_key: report
      target_agent_id: agent-writer-001
  part_types: [text, data, file]

constraints:
  - CheckState 任一 failed/cancelled/timeout → 终止 Skills，回传上游
```
