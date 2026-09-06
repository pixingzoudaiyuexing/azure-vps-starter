# Handoff

当前状态：MVP 代码已实现，完成两轮 Gemini Pro 3.1 发布前审查。第二轮 Verdict 为 `READY FOR REAL AZURE TEST`。第二轮指出的真实 HIGH 风险已经修复，代码侧最新完整 CI 已通过。

## 已完成的可靠性与安全措施

- 创建流程使用后台 operation + 前端轮询，不依赖长 HTTP 连接
- 浏览器生成 256-bit operation token，同 token 幂等，重复提交不会创建第二台 VM
- operation token 只存 sessionStorage；Azure API 凭据不进入 localStorage/sessionStorage
- 网络断线以及 HTTP 5xx / 502 / 504 时保留 operation token，并自动重新探测任务状态
- 存在未解决 operation token 时禁止启动新的创建任务，避免旧任务状态未知时重复计费
- 浏览器刷新后可继续查询同一任务
- Node/Docker 重启导致内存状态丢失时，可由 token 推导确定性 Resource Group 并执行 recovery
- VM 已存在：等待 Azure Provisioning 完成，重新生成 root 密码并返回结果
- 只有半成品资源：删除整个 Resource Group，优先控制残留计费风险
- 创建失败时尝试整组回滚，清理失败会明确返回 Resource Group 名称
- root 密码通过 Azure Managed Run Command protected parameter 下发，不写 customData
- 系统镜像统一 x64 + Generation 2
- Resource SKU 使用 `CpuArchitectureType` / `HyperVGenerations` 过滤明确 Arm64 / Gen1-only 型号
- Ubuntu 24.04：`Canonical:ubuntu-24_04-lts:server:latest`（Canonical 官方列为 AMD64 Gen2）
- Ubuntu 22.04：`Canonical:ubuntu-22_04-lts:server:latest`（Canonical 官方列为 AMD64 Gen2）
- Debian 12：`Debian:debian-12:12-gen2:latest`
- OS Disk：`StandardSSD_LRS`
- 默认 Docker 仅绑定 `127.0.0.1:3000`，推荐通过 SSH Tunnel 使用

## 当前下一阻塞点

真实 Azure Subscription 实机验证。

第一次实测应按最小风险顺序：

1. 在独立测试服务器部署当前 main
2. 通过 SSH Tunnel 打开面板
3. 使用测试 Service Principal 验证 API
4. 验证地区 / Resource SKU / quota 返回
5. 选择低成本 x64 Gen2 型号创建 Ubuntu 24.04
6. 验证公网 IP、root 密码 SSH、NSG 全入站
7. 验证 Azure Portal 中仅存在一个对应 `avs-*` Resource Group
8. 再做一次刷新/断线恢复测试
9. 最后测试失败回滚 / Docker 重启 recovery

真实测试结果返回后再进入修复，不提前扩展删除列表、多租户或其他非 MVP 功能。
