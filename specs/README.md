# Specs

本目录保存 LittleBlueBook-Web 的规格文件。每个需求使用独立的 `spec-NNN-short-name/` 目录，并遵循 `.ai/workflows/spec-lifecycle.md`。

## Spec 索引

| ID | 名称 | 状态 | 目录 |
| --- | --- | --- | --- |
| SPEC-001 | 项目工程基础 | Accepted | `spec-001-project-foundation/` |
| SPEC-002 | 邮箱注册与登录 | Accepted | `spec-002-email-authentication/` |
| SPEC-003 | 个人主页 | Accepted | `spec-003-user-profile/` |
| SPEC-004 | 内容发布与展示 | Accepted | `spec-004-content-publishing/` |
| SPEC-005 | 页面高度与滚动模型自适应改造 | Accepted | `spec-005-adaptive-height-and-scroll/` |
| SPEC-006 | 笔记频道 | Accepted | `spec-006-note-channels/` |
| SPEC-007 | 点赞、收藏、评论与关注 | Accepted | `spec-007-social-interactions/` |
| SPEC-008 | 内容与用户搜索 | Accepted | `spec-008-content-search/` |
| SPEC-009 | 互动通知中心 | Accepted | `spec-009-notification-center/` |
| SPEC-010 | 个人资料设置 | Accepted | `spec-010-profile-settings/` |
| SPEC-011 | 评论互动、笔记浏览量与私信 | Accepted | `spec-011-engagement-and-messaging/` |
| SPEC-012 | 服务条款、隐私政策与更多菜单 | Accepted | `spec-012-legal-terms-and-more/` |
| SPEC-013 | 视频发布与播放 | Accepted | `spec-013-video-publishing-and-playback/` |
| SPEC-014 | 笔记管理与关注列表 | Accepted | `spec-014-note-management-and-following/` |
| SPEC-015 | 内容治理与用户安全 | Accepting | `spec-015-content-governance-and-user-safety/` |

## 状态说明

- `Draft`：仍在起草，不得实施；
- `In Review`：等待用户审查，不得实施；
- `Confirmed`：用户已明确确认，可以分配实施；
- `Implementing`：实施中；
- `Accepting`：独立验收中；
- `Rework Required`：需要返工；
- `Blocked`：被明确条件阻塞；
- `Accepted`：独立验收通过且用户已确认验收完成。

不得仅修改本索引来改变 Spec 状态；状态变化必须同步写入对应 `spec.md`。
