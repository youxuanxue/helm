# Helm 文档索引

**Helm**：单人公司 × AI 团队。你当 CEO，AI 当团队。

## 文档层级

| 层级 | 文档 | 读者 | 核心内容 |
|------|------|------|----------|
| 产品 | [产品架构](opc_product_architecture_jobs.md) | 产品、决策者 | 心智模型、用户体验、5 分钟魔法 |
| 规格 | [CompanySpec](opc_companyspec_integrated.md) | COO、Agent 实现 | 公司身份、目标、受众、产物、质量标准 |
| 规格 | [AgentSpec](opc_agentspec_integrated.md) | Agent 实现、适配器 | Agent 定义、Handoff 协议 |
| 技术 | [技术架构](opc_technical_architecture.md) | 架构师、工程师 | 系统分层、数据模型、接口、调度 |
| 交付 | [研发审计与修订计划](opc_delivery_audit_and_revision_plan.md) | 产品、研发、Agent | docs 对照、差距分析、迭代计划 |

## 核心概念（Agent 可解析）

| 概念 | 定义 | 所在文档 |
|------|------|----------|
| Company | 第一实体；含 identity、mission、target_audience、goals、deliverables、quality_standards | CompanySpec |
| COO | 规划与调度 Agent；拆解需求、分配任务、上报决策 | 产品架构、技术架构 |
| AgentSpec | Agent 身份、输入校验、执行配置、Skills、Outputs；HandoffRequest/HandoffResponse | AgentSpec |
| Handoff | Agent 间任务交接协议；Part(text/file/data/json)、Artifact、回退约束 | AgentSpec §3 |
| Board | 人类决策网关；审批任务图、hire_agent、decision_escalation | 技术架构 §5 |

## 依赖关系

```
产品架构 ──引用──> CompanySpec、AgentSpec、技术架构
技术架构 ──引用──> CompanySpec、AgentSpec
CompanySpec、AgentSpec ──被引用──> 技术架构（实现细节）
```

## 实施

| 文档 | 说明 |
|------|------|
| [实施计划](opc_implementation_plan.md) | 技术栈、项目结构、API、Adapter、MVP 阶段 |
