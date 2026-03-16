# Helm 实施计划

**文档类型**：实施规格  
**产品**：Helm  
**目标读者**：工程师、Cursor Agent  
**关联文档**：[技术架构](./opc_technical_architecture.md)、[产品架构](./opc_product_architecture_jobs.md)、[CompanySpec](./opc_companyspec_integrated.md)、[AgentSpec](./opc_agentspec_integrated.md)  
**版本**：1.0  
**日期**：2026-03-16

---

## 1. 技术栈总览

| 层级 | 选型 | 说明 |
|------|------|------|
| 语言 | TypeScript | Cursor Agent 友好，前后端统一 |
| 后端 API | Hono | 轻量、Cloudflare Workers 兼容 |
| 数据库 | SQLite + Drizzle ORM | 本地零配置，易迁 D1 |
| 前端 | React 18 + TypeScript | 组件化 |
| 样式 | Tailwind + CSS 变量 | 深色控制台主题 |
| 组件 | Radix UI | 无障碍、可定制 |
| DAG 可视化 | React Flow | 任务流图 |
| CLI | Commander.js | Node 生态统一 |
| Agent 适配 | process Adapter | 调用 cursor agent / claude CLI |
| 部署 | 本地 Node → Cloudflare Workers + D1 + Pages | 分阶段 |

---

## 2. 项目结构

```
helm/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── turbo.json                 # 可选：monorepo 构建
├── .env.example
│
├── apps/
│   ├── api/                   # REST API 服务
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   │   ├── companies.ts
│   │   │   │   ├── issues.ts
│   │   │   │   ├── approvals.ts
│   │   │   │   ├── agents.ts
│   │   │   │   └── health.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   └── company-scope.ts
│   │   │   └── lib/
│   │   │       ├── db.ts
│   │   │       └── config.ts
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   ├── web/                   # Web 前端
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── routes/
│   │   │   │   ├── index.tsx
│   │   │   │   ├── company.tsx
│   │   │   │   ├── demand.tsx
│   │   │   │   ├── approval.tsx
│   │   │   │   └── dashboard.tsx
│   │   │   ├── components/
│   │   │   │   ├── TaskGraph.tsx
│   │   │   │   ├── ApprovalCard.tsx
│   │   │   │   ├── ActivityTimeline.tsx
│   │   │   │   └── BudgetBar.tsx
│   │   │   ├── styles/
│   │   │   │   └── theme.css
│   │   │   └── lib/
│   │   │       └── api.ts
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── cli/                   # CLI 工具
│       ├── src/
│       │   ├── index.ts
│       │   ├── commands/
│       │   │   ├── init.ts
│       │   │   ├── demand.ts
│       │   │   ├── status.ts
│       │   │   ├── approve.ts
│       │   │   └── budget.ts
│       │   └── lib/
│       │       ├── client.ts
│       │       └── config.ts
│       └── package.json
│
├── packages/
│   ├── db/                    # 共享：Drizzle schema + migrations
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── schema/
│   │   │   │   ├── companies.ts
│   │   │   │   ├── agents.ts
│   │   │   │   ├── issues.ts
│   │   │   │   ├── action-nodes.ts
│   │   │   │   ├── approvals.ts
│   │   │   │   ├── activity.ts
│   │   │   │   └── cost.ts
│   │   │   └── migrations/
│   │   └── package.json
│   │
│   ├── adapters/              # Agent 适配器
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── registry.ts
│   │   │   ├── process/
│   │   │   │   ├── index.ts
│   │   │   │   ├── cursor-cli.ts
│   │   │   │   └── claude-cli.ts
│   │   │   └── base.ts
│   │   └── package.json
│   │
│   ├── scheduler/             # 调度器 + Heartbeat
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── heartbeat.ts
│   │   │   ├── dag-scheduler.ts
│   │   │   └── coo-runner.ts
│   │   └── package.json
│   │
│   └── shared/                # 共享类型与工具
│       ├── src/
│       │   ├── types.ts       # HandoffRequest/Response, CompanySpec, AgentSpec
│       │   ├── validation.ts
│       │   └── constants.ts
│       └── package.json
│
├── templates/                 # 开箱模板（静态 YAML）
│   ├── content-studio.yaml
│   ├── dev-studio.yaml
│   └── empty.yaml
│
└── docs/
    └── ...
```

---

## 3. 数据库 Schema（Drizzle）

### 3.1 表清单

| 表名 | 说明 |
|------|------|
| `companies` | 公司，含 company_spec (JSON) |
| `company_templates` | 模板元数据（可选，也可仅用静态文件） |
| `agents` | Agent，含 adapter_type, adapter_config |
| `agent_api_keys` | Agent API Key 哈希 |
| `goals` | 目标层级 |
| `projects` | 项目 |
| `issues` | 任务（树形） |
| `action_nodes` | 任务流节点 |
| `action_edges` | 任务流边 |
| `approvals` | 审批请求 |
| `activity_log` | 审计日志 |
| `cost_events` | 成本事件 |
| `heartbeat_runs` | 心跳运行记录 |

### 3.2 关键字段（与技术架构一致）

```sql
-- companies
CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mission TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  company_spec TEXT NOT NULL,  -- JSON
  output_types TEXT,           -- JSON array
  status TEXT NOT NULL,        -- active | paused | archived
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- agents
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  role TEXT,
  reports_to TEXT REFERENCES agents(id),
  adapter_type TEXT NOT NULL,
  adapter_config TEXT NOT NULL,  -- JSON
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- issues (简化，后续可扩展)
CREATE TABLE issues (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  project_id TEXT,
  parent_id TEXT REFERENCES issues(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,        -- todo | backlog | blocked | in_progress | done
  assignee_agent_id TEXT REFERENCES agents(id),
  demand_payload TEXT,         -- JSON, 原始需求
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- action_nodes
CREATE TABLE action_nodes (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  issue_id TEXT REFERENCES issues(id),
  spec_ref TEXT NOT NULL,      -- AgentSpec 引用
  depends_on TEXT NOT NULL,    -- JSON array of node ids
  status TEXT NOT NULL,        -- pending | running | succeed | failed | cancelled | timeout
  heartbeat_run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- approvals
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  type TEXT NOT NULL,          -- task_graph | hire_agent | decision_escalation
  status TEXT NOT NULL,        -- pending | approved | rejected
  payload TEXT NOT NULL,       -- JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);
```

---

## 4. API 端点清单

### 4.1 Board 通道（需 Board 鉴权）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/companies` | 公司列表 |
| POST | `/companies` | 创建公司（含 template_id 或 company_spec） |
| GET | `/companies/:id` | 公司详情 |
| PATCH | `/companies/:id` | 更新公司（含 status 暂停） |
| GET | `/companies/:id/issues` | 公司下 issues 列表 |
| POST | `/companies/:id/demands` | 提需求（创建 issue + 触发 COO） |
| GET | `/companies/:id/approvals` | 待审批列表 |
| POST | `/approvals/:id/approve` | 审批通过 |
| POST | `/approvals/:id/reject` | 审批拒绝 |
| GET | `/companies/:id/activity` | Activity 日志 |
| GET | `/companies/:id/costs` | 成本汇总 |
| PATCH | `/companies/:id/budget` | 设置预算 |
| POST | `/action-nodes/:id/pause` | 暂停节点 |
| POST | `/action-nodes/:id/resume` | 恢复节点 |

### 4.2 Agent 通道（需 Agent API Key）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/issues/:id/checkout` | 原子认领任务 |
| POST | `/action-nodes/:id/handoff` | Handoff 上报（完成/失败） |
| GET | `/action-nodes/:id/context` | 拉取 HandoffRequest |
| GET | `/heartbeat-runs/:id/status` | 查询运行状态 |

### 4.3 公开/健康

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/templates` | 模板列表（无需鉴权） |

---

## 5. Adapter 接口定义

### 5.1 类型

```ts
// packages/adapters/src/types.ts

export interface Agent {
  id: string;
  company_id: string;
  name: string;
  adapter_type: string;
  adapter_config: Record<string, unknown>;
}

export interface InvocationContext {
  task_id: string;
  company_id: string;
  message: {
    role: 'user' | 'system';
    parts: Part[];
  };
  metadata?: {
    billing_code?: string;
    parent_task_id?: string;
  };
}

export interface Part {
  type: 'text' | 'file' | 'data' | 'json';
  text?: string;
  url?: string;
  data?: unknown;
}

export interface InvokeResult {
  run_id: string;
  status: 'submitted' | 'working';
}

export interface RunStatus {
  state: 'submitted' | 'working' | 'succeed' | 'failed' | 'cancelled' | 'timeout';
  message?: Part[];
  artifacts?: Artifact[];
  error?: { code: string; message: string };
}

export interface Artifact {
  name?: string;
  parts: Part[];
  index: number;
}

export interface AgentAdapter {
  readonly type: string;
  invoke(agent: Agent, context: InvocationContext): Promise<InvokeResult>;
  status(runId: string, agent: Agent): Promise<RunStatus>;
  cancel(runId: string, agent: Agent): Promise<void>;
}
```

### 5.2 Cursor CLI Adapter 配置

```ts
interface CursorCliConfig {
  command: string;        // "cursor" 或 "cursor agent"
  argsTemplate?: string;  // 如 "agent --prompt '${objective}'"
  workspacePath?: string; // 或从 context 注入
  stdinMode: 'handoff_json' | 'prompt_only';
}
```

### 5.3 Claude CLI Adapter 配置

```ts
interface ClaudeCliConfig {
  command: string;        // "claude" 或 "aicode"
  projectDir?: string;
  stdinMode: 'handoff_json' | 'prompt_only';
}
```

---

## 6. MVP 阶段划分

### Phase 1：骨架与最小闭环（约 1–2 周）

**目标**：建公司 → 提需求 → 审批任务图 → 单 Agent 执行一次

| 任务 | 说明 | 产出 |
|------|------|------|
| 1.1 项目脚手架 | pnpm monorepo、tsconfig、各 app 基本配置 | 可 `pnpm dev` 启动 |
| 1.2 DB Schema | Drizzle schema + SQLite migrations | companies, agents, issues, approvals |
| 1.3 API 骨架 | Hono 路由、健康检查、companies CRUD | `/health`, `/companies` |
| 1.4 简易 Board 鉴权 | 本地 dev 模式：固定 token 或免鉴权 | middleware/auth |
| 1.5 创建公司 API | 支持 template 与手工 spec | `POST /companies` |
| 1.6 提需求 API | 创建 issue、写入 demand_payload | `POST /companies/:id/demands` |
| 1.7 审批 API | 创建/审批 task_graph 类型 | `POST /approvals/:id/approve` |
| 1.8 单 process Adapter | 调用 `cursor agent` 或占位脚本 | 可 invoke + status |
| 1.9 最小 COO | 收到 demand 后生成 1 节点任务图、提交审批 | 同步或简单队列 |
| 1.10 Web 最小页面 | 选模板建公司、提需求、审批 | 3 个页面 |
| 1.11 CLI init/demand | `helm init`, `helm demand <需求>` | 基础命令 |

### Phase 2：调度与闭环（约 1–2 周）

**目标**：Heartbeat 驱动 COO、DAG 调度、成本与 Activity

| 任务 | 说明 | 产出 |
|------|------|------|
| 2.1 action_nodes/edges | 完整 DAG 表与 CRUD | 多节点任务图 |
| 2.2 DAG 调度器 | 入度为 0 可调度、完成后触发下游 | dag-scheduler |
| 2.3 Heartbeat | 周期性唤醒 COO | heartbeat_runs 记录 |
| 2.4 checkout API | 原子认领 | `POST /issues/:id/checkout` |
| 2.5 handoff API | Agent 上报完成/失败 | `POST /action-nodes/:id/handoff` |
| 2.6 activity_log | 写入与查询 | 关键操作可审计 |
| 2.7 cost_events | 占位或模拟 | 成本归集结构 |
| 2.8 Web 任务流 | DAG 可视化（React Flow） | 审批页展示图 |
| 2.9 CLI status/approve | `helm status`, `helm approve` | 治理命令 |

### Phase 3：精致化与治理（约 1 周）

**目标**：Dashboard、预算、开箱模板、UI 打磨

| 任务 | 说明 | 产出 |
|------|------|------|
| 3.1 开箱模板 | 2–3 个 YAML 模板 | templates/*.yaml |
| 3.2 选模板建公司 | 0 填写流程 | Web + API |
| 3.3 Dashboard | 待决策/进行中/成本卡片 | 一眼看懂 |
| 3.4 预算设置 | budget 字段、auto-pause 逻辑 | 治理 |
| 3.5 UI 主题 | 深色控制台、状态色、动效 | theme.css |
| 3.6 CLI budget | `helm budget` | 预算命令 |

### Phase 4：Cloudflare 适配（后续）

| 任务 | 说明 |
|------|------|
| 4.1 API → Workers | Hono 适配 Workers 运行时 |
| 4.2 SQLite → D1 | Drizzle 切 D1 driver |
| 4.3 Web → Pages | 静态构建部署 |
| 4.4 Agent 执行 | 考虑 Workers 调外部 Runner 或保持本地 |

---

## 7. 本地开发命令

```bash
# 安装
pnpm install

# 数据库迁移
pnpm --filter @helm/db run migrate

# 启动 API（默认 http://localhost:3000）
pnpm --filter api dev

# 启动 Web（默认 http://localhost:5173）
pnpm --filter web dev

# 启动 CLI（需 API 运行）
helm demand "写一篇关于 AI 的博客"

# 全量开发
pnpm dev
```

---

## 8. 配置文件

### 8.1 本地数据目录

```
~/.helm/
├── data/
│   └── helm.db          # SQLite 主库
├── config.json          # API URL、默认 company 等
└── templates/           # 用户自定义模板（可选）
```

### 8.2 环境变量

```
HELM_DATA_DIR=~/.helm/data
HELM_API_URL=http://localhost:3000
HELM_BOARD_TOKEN=...        # Board 鉴权（开发可省略）
```

---

## 9. 依赖清单（核心）

```json
{
  "dependencies": {
    "hono": "^4.x",
    "@hono/node-server": "^1.x",
    "drizzle-orm": "^0.36.x",
    "better-sqlite3": "^11.x",
    "react": "^18.x",
    "react-dom": "^18.x",
    "react-router-dom": "^7.x",
    "@radix-ui/react-*": "latest",
    "reactflow": "^11.x",
    "tailwindcss": "^3.x",
    "commander": "^12.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vite": "^6.x",
    "@types/better-sqlite3": "^7.x",
    "drizzle-kit": "^0.28.x"
  }
}
```

---

## 10. 与 Cursor Agent 的协作说明

- **分层依赖**：`shared` → `db` → `adapters` / `scheduler` → `api` / `web` / `cli`；禁止反向引用。
- **模块级副作用**：`load_dotenv`、Adapter 注册等仅在入口或调用点执行。
- **外部输入安全**：`id`、`name` 用于路径前必须校验，拒绝 `..` 和 `/`。
- **状态文件**：JSON 配置全量覆盖时，先写临时文件再 rename。
