# Handoff

当前状态：MVP 代码已实现并完成第一轮 Gemini Pro 3.1 发布前审查。第一轮 Verdict 为 `READY FOR REAL AZURE TEST`，其有效风险项已处理；由于审查后对创建任务模型做了较大改动，在真实 Azure 测试前需要一次聚焦第二轮审查。

## 第一轮审查后已完成

- 创建流程从长连接同步响应改为后台 operation + 前端轮询
- 浏览器生成 256-bit operation token，同 token 幂等，重复提交不会创建第二台 VM
- operation token 只存 sessionStorage；Azure API 凭据不进入 localStorage/sessionStorage
- 浏览器刷新/网络中断后可继续查询同一创建任务
- Node/Docker 重启导致内存任务丢失时，可由 token 推导确定性 Resource Group，并通过重新提供 Azure API 进行恢复
- VM 已存在：等待 Provisioning 完成，重新生成 root 密码并返回结果
- 只有半成品资源：删除整个 Resource Group，优先控制计费风险
- 系统镜像统一 x64 + Generation 2
- Resource SKU 读取 `CpuArchitectureType` / `HyperVGenerations`，过滤明确 Arm64 / Gen1-only 型号
- Ubuntu 22.04 改用 `Canonical:ubuntu-22_04-lts:server:latest`
- Debian 12 改用 `Debian:debian-12:12-gen2:latest`
- OS Disk 改为 `StandardSSD_LRS`

## 当前下一阻塞点

第二轮 Gemini Pro 3.1 定向审查，重点检查：

1. operation token 幂等和任务状态生命周期
2. 浏览器刷新/网络断线后的恢复语义
3. Node/Docker 崩溃后的 Azure Resource Group recovery
4. VM 创建仍在 Azure 后台进行时，recovery 与 Resource Group 删除是否存在竞态
5. operation token 作为任务结果 bearer secret 是否在 localhost + SSH Tunnel 模式下可接受
6. x64 / Gen2 镜像和 Resource SKU 过滤逻辑
7. 是否仍存在真实扣费/幽灵资源 BLOCKER

第二轮审查通过后，下一步才是真实 Azure Subscription 实机测试。
