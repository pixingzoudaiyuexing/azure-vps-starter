# Architecture

单容器 Node.js 应用：Express API + 静态 HTML/CSS/JS 前端。

后端使用 Azure SDK：Identity、Resources Subscriptions、Compute、Network、Resources。

## 凭据与任务状态

Azure Tenant ID / Client ID / Client Secret / Subscription ID 不落盘、不写数据库，也不写浏览器 localStorage/sessionStorage。

创建任务在服务端以后台 Promise 执行。浏览器生成 256-bit 随机 operation token，并仅把该 token 保存到 sessionStorage，用于刷新后继续查询任务状态。服务端任务表仅存在内存中，不保存 Azure API 凭据。

同一个 operation token 对应同一个确定性的 Resource Group 名称，因此重复提交不会创建第二台 VM。

如果 Node/Docker 重启导致内存任务表丢失：

- 浏览器仍保留 operation token
- 服务端可由 token 推导出原 Resource Group
- 用户重新提供 Azure API 后执行 recovery
- 若 VM 已存在：等待 Provisioning 完成、重新生成 root 密码、返回最终结果
- 若只有部分资源：删除整个 Resource Group，避免持续计费

## Azure 创建流程

Credential validation
→ Locations
→ Resource SKUs + Compute Usage
→ x64 / Gen2 compatibility filtering
→ Marketplace image check
→ Resource Group
→ NSG
→ VNet / Subnet
→ Standard Public IPv4
→ NIC
→ VM
→ Managed Run Command protected parameter
→ root SSH
→ result

每台 VPS 使用独立 Resource Group，使失败回滚、崩溃恢复和后续删除资源更简单。

系统镜像统一使用 x64 Generation 2；Resource SKU 中明确为 Arm64 或 Gen1-only 的型号不提供给前端选择。
