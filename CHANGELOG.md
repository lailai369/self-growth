# 更新日志 (Changelog)

本项目的所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本控制 (Semantic Versioning)](https://semver.org/lang/zh-CN/)。

## [3.0.0] - 2026-06-02

### 新增 (Added)
- 结构化记忆系统（工作进度/经验/教训/用户人格/沟通模式）
- 每日复盘自动生成 memory.md，统一注入上下文
- 技能共词率匹配注入（零 LLM 调用，永不超时）
- 本轮思考指南（Agent 主动思考：自问目标、提醒、替代方案）
- 沟通模式提取（用户说A=真实意图是B）
- 7天偏好自动清理 + 满100条自动清理低星条目
- 三层防护防止 LLM 重入循环（全局锁+sessionKey去重+内容哈希幂等）

### 修复 (Fixed)
- before_prompt_build 超时被 Gateway 拉黑导致永久不触发
- 微信/TUI 消息格式兼容（extractText 三种格式）
- 插件安装覆盖运行时数据文件（install.ignore + 同步脚本）
- LLM 通过 Gateway /v1 调用导致重入循环
- 每日复盘 LLM 调用返回空导致 memory.md 不生成

### 变更 (Changed)
- 偏好上限保持100条，满时自动清理7天外低星条目
- 每日复盘 LLM 调用改为直连模型 API
- 日志模块从异步改为同步，防止静默失败

## [1.0.0] - 2026-05-16

### 新增 (Added)
- 实现了对话记录的持久化存储功能，支持按日期归档原始对话。
- 新增了长期记忆管理模块，能够从日常交互中智能提取并沉淀用户偏好。
- 完成了技能自动生成与优化机制，支持根据复盘结果动态生成 SKILL.md。
- 内置了每日自动复盘定时任务，可在固定时间触发深度自我反思。
- 增加了异常自我修复机制，在检测到任务执行失败时尝试自动分析并恢复。
- 提供了完整的环境变量配置支持（`.env.example`），方便用户自定义运行路径与开关。

### 工程化与构建 (Engineering)
- 初始化了完整的 TypeScript + ESM 现代 Node.js 插件工程架构。
- 完善了项目基础配置文件，包括 `package.json`、`tsconfig.json`、`.gitignore` 等。
- 添加了详细的 `README.md` 使用文档与开发指南。
- 引入了 MIT 开源许可证 (`LICENSE`)。