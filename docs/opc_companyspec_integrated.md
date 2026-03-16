# Helm CompanySpec 整合规范

**产品**：Helm  
**定位**：公司规格——定义公司身份、目标、服务对象、目标产物与质量标准，供 Agent 理解、拆解任务并与控制面协同执行  
**关联文档**：[Helm 产品架构](./opc_product_architecture_jobs.md)、[Helm 技术架构](./opc_technical_architecture.md)、[AgentSpec](./opc_agentspec_integrated.md)  
**版本**：1.0

---

## 1. 概述

### 1.1 目的

CompanySpec 为 Helm 的核心实体规格，服务于：

| 场景 | 作用 |
|------|------|
| **COO 拆解任务** | 将需求拆解为任务流时，以 CompanySpec 为上下文，保证任务对齐公司目标与服务对象 |
| **Agent 执行对齐** | Agent 在执行时理解「为谁做、做成什么样、质量底线是什么」 |
| **控制面治理** | 所有 issues/goals 可追溯至 CompanySpec，审计与成本归集以公司为边界 |
| **模板与复用** | 开箱模板预填 CompanySpec，降低冷启动门槛 |

### 1.2 设计原则

- **Agent 可解析**：结构化、无歧义，便于 LLM/COO 解析与引用
- **目标可拆解**：目标层级清晰，可映射为 Project/Milestone/Issue
- **受众可操作**：服务对象结构化，Agent 可据此调整输出风格与深度
- **质量可校验**：质量标准为可验证的 acceptance criteria，非模糊描述

---

## 2. CompanySpec 核心结构

### 2.1 分层概览

```yaml
CompanySpec:
  # === 第一层：公司定义（必填）===
  identity: {...}
  mission: string
  target_audience: {...}      # 结构化，非纯文本

  # === 第二层：目标与拆解（建议）===
  goals: [...]

  # === 第三层：目标产物（建议）===
  deliverables: [...]

  # === 第四层：质量标准（建议）===
  quality_standards: {...}
```

---

## 3. 各层详细定义

### 3.1 公司定义（identity + mission）

```yaml
identity:
  id: uuid                    # 公司唯一标识
  name: string                # 公司名称，如「星辰内容工作室」
  version?: string            # 可选，便于版本追溯

mission:
  # 必填，一句话：我们做什么、达成什么
  # 示例：「为 SaaS 品牌创作高质量 B2B 内容，月产 20 篇」
  statement: string

  # 可选，长期愿景，供 COO 做战略拆解时参考
  vision?: string
```

**Agent 消费**：COO 以 `mission.statement` 为首要上下文；任务须可追溯至 mission。

---

### 3.2 服务对象（target_audience）

结构化描述，供 Agent 理解「为谁做」并调整输出风格。

```yaml
target_audience:
  summary: string              # 必填，人类可读摘要
  segments:                    # 建议，结构化受众
    - id: string              # 如 "b2b_saas_marketing"
      name: string            # 如 「SaaS 市场团队」
      description?: string    # 细化描述
      attributes:             # 可选，便于 Agent  tailor 输出
        - company_stage: "B 轮及以上"
        - role: "市场/增长"
        - domain: "SaaS"

  # 可选，地域、语言等
  geographic?: string
  language?: string
```

**Agent 消费**：以 `segments` 为受众锚点，调整输出风格与深度。

---

### 3.3 目标与拆解（goals）

目标可拆解、可验收。

```yaml
goals:
  - id: string                # 目标唯一标识
    level: company | team | project   # 层级
    title: string             # 目标标题
    description?: string      # 详细描述

    # 关键结果（Key Results），量化可测
    key_results:
      - id: string
        title: string         # 如 「月产 20 篇 B2B 文章」
        metric: string        # 度量指标
        target: string        # 目标值，如 "20"
        unit?: string         # 单位，如 "篇"

    # 验收条件
    acceptance_criteria:
      - id: string
        description: string   # 可验证的原子条件
```

**Agent 消费**：tasks 映射至 `goals[].key_results` 或 `acceptance_criteria`。

---

### 3.4 目标产物（deliverables）

```yaml
deliverables:
  - id: string                # 如 "article_b2b"
    type: string              # 产出类型：article | code | pr_draft | report | ...
    name: string              # 如「B2B 营销文章」
    description?: string      # 产出说明

    # 格式约束（便于 Agent 输出符合预期）
    format:
      primary: string         # 主格式，如 "markdown"
      alternatives?: string[] # 如 ["html", "docx"]

    # 产出粒度（可选）
    unit?: string             # 如 "篇"、"个 PR"
```

**Agent 消费**：产出时采用 `deliverables` 的 `format` 与 `unit`。

---

### 3.5 质量标准（quality_standards）

```yaml
quality_standards:
  # 通用原则（供 COO/Agent 参考）
  principles?: string[]
  # 示例：["事实准确","无敏感泄露","符合品牌调性"]

  # 按产出类型的质量标准
  by_deliverable_type:
    article:
      - id: string
        criterion: string     # 可验证条件，如 "字数 >= 500"
        validator?: string    # 可选，校验方式：length | schema | ...
      - criterion: "无错别字、语法错误"
    code:
      - criterion: "通过指定测试套件"
      - criterion: "符合项目 lint 规则"
    pr_draft:
      - criterion: "包含清晰的改动说明"
      - criterion: "关联到对应 issue"

  # 通用底线（所有产出均需满足）
  baseline:
    - criterion: string       # 如 "不包含敏感信息"
```

**Agent 消费**：任务完成前按 `quality_standards` 自检；COO 依此做质量门禁。

---

## 4. 完整示例（精简）

```yaml
apiVersion: opc/company/v1
kind: CompanySpec
spec:
  identity: { name: 星辰内容工作室 }
  mission: { statement: 为 SaaS 品牌创作 B2B 内容，月产 20 篇 }
  target_audience:
    summary: B 轮及以上 SaaS 公司市场团队
    segments:
      - id: saas_marketing
        name: SaaS 市场团队
        attributes: [{ company_stage: "B 轮及以上" }]
  goals:
    - id: g1
      level: company
      title: 建立稳定内容产能
      key_results: [{ title: 月产 20 篇 B2B 文章, metric: article_count, target: "20", unit: 篇 }]
  deliverables:
    - id: article_b2b
      type: article
      name: B2B 营销文章
      format: { primary: markdown }
      unit: 篇
  quality_standards:
    principles: [事实准确, 符合受众, 无敏感信息]
    by_deliverable_type:
      article: [{ criterion: "字数 >= 500", validator: length }]
    baseline: [{ criterion: 不包含敏感信息 }]
```
