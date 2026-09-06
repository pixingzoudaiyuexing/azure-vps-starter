# Decisions

- MVP 使用 Node.js + JavaScript，而不是 Go：减少构建链和代码量，直接使用 Azure JS SDK。
- MVP 不引入数据库。
- MVP 不引入 React/Vite；前端使用静态 HTML/CSS/JS，优先部署简单。
- SKU 使用 Resource SKUs，而不是 `virtualMachineSizes.list(location)`，因为后者不能表达 Subscription restrictions。
- SKU 同时结合 Compute Usage 做 vCPU quota 预过滤；无法读取 quota 时不阻断，最终仍以 Azure 创建结果为准。
- 系统镜像统一为 x64 + Generation 2；读取 `CpuArchitectureType` / `HyperVGenerations`，明确 Arm64 或 Gen1-only 的 SKU 不提供给用户选择。
- 每台 VPS 单独 Resource Group，创建失败整组回滚。
- Standard Public IP + NIC 绑定 NSG。
- OS Disk 使用 Standard SSD。
- 明确按需求开放全部入站流量。
- root 密码不得放入 customData；使用 Azure Managed Run Command `protectedParameters` 设置 root 密码并开启 SSH root/password 登录。
- 不采用“浏览器断开就立即删除资源”的策略：HTTP 断线并不等于用户取消，且与 Azure 长时间异步创建竞态风险较大。
- 创建请求改为后台 operation：浏览器先生成 256-bit token，同 token 幂等；刷新/短暂断线可继续轮询结果。
- operation token 可以存 sessionStorage，但 Azure API 凭据和 root 密码不写 localStorage/sessionStorage。
- Node/Docker 崩溃恢复依赖确定性 Resource Group：VM 已存在则重置 root 密码后恢复结果；半成品资源整组删除以优先控制计费风险。
