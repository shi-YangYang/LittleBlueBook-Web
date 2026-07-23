# Spec 生命周期工作流

## 目的

定义需求从提出到最终验收的状态和门禁。路线图、聊天结论或实现代码均不能代替已确认的 Spec。

## 目录命名

每个 Spec 使用独立目录，格式为：

```text
specs/spec-NNN-short-name/
```

其中：

- `NNN` 是从 `001` 开始的三位递增编号；
- `short-name` 是能够识别需求的简短 kebab-case 名称；
- 编号一旦使用不得重新分配给其他需求；
- Spec 被取消或废弃时保留原目录和历史状态。

示例：

```text
specs/spec-001-user-login/
specs/spec-002-content-publishing/
```

目录内文件结构在项目进入首个业务 Spec 时另行确认和创建；初始化阶段不创建空 Spec。

## 状态

```text
Draft
  ↓
In Review
  ↓
Confirmed
  ↓
Implementing
  ↓
Accepting
  ├─→ Rework Required ─→ Implementing
  ├─→ Blocked
  └─→ Accepted
```

### Draft

协调开发 Agent 正在起草，仍可能存在待确认问题。不得实施。

### In Review

内容已足以供用户审查，但尚未获得明确确认。不得实施。

### Confirmed

用户已经明确确认当前版本。可以由协调开发 Agent 创建实施 Agent。

### Implementing

实施 Agent 正在按照已确认 Spec 工作。发现影响范围或结果的新决策点时，应返回协调开发 Agent；必要时将 Spec 退回 `Draft` 或 `In Review`。

### Accepting

新的验收 Agent 正在独立检查实施结果。

### Rework Required

验收未通过。协调开发 Agent 根据验收证据创建新的返工实施任务。

### Blocked

缺少用户决策、外部依赖或可验证环境，暂时无法继续。阻塞原因和解除条件必须明确记录。

### Accepted

所有强制验收项通过。协调开发 Agent 汇总结果并交由用户最终审查。

## Spec 确认门禁

进入 `Confirmed` 前，至少应明确：

- 背景和目标；
- 范围与非范围；
- 用户可观察行为；
- 业务规则；
- 数据、权限和异常处理要求；
- 兼容性、性能、安全等适用约束；
- 可逐项验证的验收标准；
- 尚存风险和明确允许延后的事项。

只要仍有会显著改变实施结果的关键问题未确认，就不得进入 `Confirmed`。

## 变更控制

- 已确认 Spec 的实质变化必须由用户再次确认。
- 文字澄清若不改变行为或验收结果，可以由协调开发 Agent更新并记录原因。
- 实施和验收不得以代码现状反向覆盖 Spec。
- 紧急变更也需要最迟在实施前形成可追踪的确认记录。
