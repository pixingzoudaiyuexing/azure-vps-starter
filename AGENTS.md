# AGENTS

- GitHub 仓库是唯一事实来源。
- 不记录或提交任何真实 Azure Client Secret。
- 不把 Azure API 凭据写入日志、数据库、localStorage 或示例文件。
- 对创建失败优先保证资源回滚，避免 Public IP / Disk / NSG 残留计费。
- 修改 Azure 创建流程后必须重新审查 Resource Group 回滚路径。
- 状态和用户可见文案优先中文。
