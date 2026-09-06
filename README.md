# Azure VPS Starter

一个极简的 Azure VPS 创建面板：输入 Service Principal API 凭据，检查订阅可用地区、VM SKU、CPU 架构、Hyper-V Generation 和当前 vCPU 配额，创建 Linux VPS，并返回公网 IP、root 用户和随机密码。

## 当前 MVP

- 输入 Tenant ID / Client ID / Client Secret / Subscription ID
- 验证 Azure Subscription
- 获取地区列表
- 通过 Resource SKUs 识别订阅/地区限制
- 读取地区 Compute Usage，过滤当前 vCPU 配额不足的型号
- 只显示与当前系统镜像兼容的 x64 / Generation 2 VM SKU
- Ubuntu 24.04 / Ubuntu 22.04 / Debian 12，统一使用 x64 Gen2 镜像
- 每台 VPS 使用独立、可预测恢复的 Resource Group
- 自动创建 VNet / Subnet / NSG / Standard Public IPv4 / NIC / VM
- OS Disk 使用 Standard SSD
- NSG 入站规则：所有协议、所有端口、任意来源
- 使用 Azure Managed Run Command 的 protected parameter 设置 root 密码并开启 root SSH；密码不写入 customData
- 创建成功返回 IP / root / 密码
- 创建失败时尽力删除本次新建的整个 Resource Group，减少残留计费资源
- 创建任务采用 256-bit 随机 operation token 幂等化：重复点击、请求重试不会创建第二台 VM
- 创建任务在服务端后台执行，浏览器刷新/短暂断线后可继续查询状态和结果
- Docker/Node 进程重启导致任务内存丢失时，可用同一 operation token + Azure API 自动恢复：VM 已存在则重新生成 root 密码；只有部分资源则整组清理
- Azure API 凭据不落盘、不写数据库、不写浏览器 localStorage/sessionStorage

## 部署

```bash
git clone https://github.com/pixingzoudaiyuexing/azure-vps-starter.git
cd azure-vps-starter
docker compose up -d --build
```

默认只监听服务器本机 `127.0.0.1:3000`，不会把 Azure API 面板直接暴露到公网。

从自己的电脑建立 SSH 隧道：

```bash
ssh -L 3000:127.0.0.1:3000 root@面板服务器IP
```

保持这个 SSH 窗口打开，然后浏览器访问：`http://127.0.0.1:3000`

如果以后需要长期公网访问，请在面板前面配置 HTTPS 反向代理后再开放端口，不要通过公网明文 HTTP 提交 Client Secret。

## Azure 权限

Service Principal 必须对目标 Subscription 或目标范围拥有足够权限读取/创建：

- Subscription locations
- Resource SKUs / Compute Usage
- Resource Group
- Network Security Group
- Virtual Network / Subnet
- Public IP
- Network Interface
- Virtual Machine / Managed Disk
- Virtual Machine Managed Run Command

MVP 最简单的测试方式是在专门用于测试的 Subscription 上授予 Contributor。生产使用建议后续收敛为自定义最小权限角色。

## 安全说明

这个工具按设计会创建一条 **全部入站开放** 的 NSG 规则，相当于把创建出的 VPS 暴露到互联网。请只在你明确需要这种网络策略时使用。

API 凭据只用于当前 API 请求和正在执行的后台创建闭包。服务端没有数据库，也不会把 Client Secret 写入日志或配置文件；浏览器端也不使用 localStorage/sessionStorage 保存 Azure 凭据。

浏览器会把随机 operation token 临时保存在 `sessionStorage`，只用于刷新后继续读取当前创建任务。它不是 Azure Client Secret，但相当于当前任务结果的临时访问凭证；服务端完成/失败结果默认只在内存中保留有限时间。

root 密码通过 Azure Managed Run Command 的 protected parameter 下发，临时 Run Command 在成功后会尽力删除。创建过程任一步失败都会尝试删除本次独立 Resource Group。

## 刷新、断线和容器重启

创建请求不再把 2–5 分钟的 Azure Provisioning 过程绑在一个 HTTP Response 上：

1. 浏览器先生成 operation token
2. 服务端验证地区/SKU 后立即返回 `202`
3. Azure 创建在后台继续
4. 浏览器每 2 秒查询任务状态
5. 刷新页面后使用 sessionStorage 中的 token 恢复状态查询
6. 同一个 token 再次提交不会创建第二台 VM

如果 Node/Docker 进程在创建期间重启，服务端内存任务会丢失，但对应 Azure Resource Group 名称由 operation token 确定。重新填写同一 Azure API 并点击“检查 API”后，面板会提示恢复：

- VM 已经存在：等待 Azure Provisioning 完成，重新生成新的 root 密码，然后返回 IP/root/password
- 只有半截网络/IP/NIC 等资源：删除整个该 Resource Group，避免继续计费，然后重新创建
- 资源组不存在：提示没有可恢复资源

## 系统镜像与 VM SKU 兼容性

MVP 统一选择 **x64 + Generation 2**：

- Ubuntu 24.04: `Canonical:ubuntu-24_04-lts:server:latest`
- Ubuntu 22.04: `Canonical:ubuntu-22_04-lts:server:latest`
- Debian 12: `Debian:debian-12:12-gen2:latest`

Resource SKU 查询会读取 `CpuArchitectureType` 和 `HyperVGenerations`。明确为 Arm64 的型号或 Gen1-only 的型号不会出现在“候选可用”列表里。

## 验证顺序

首次人工测试建议按顺序：

1. Docker 启动正常
2. 通过 SSH 隧道打开 `http://127.0.0.1:3000`
3. 填四项 Azure API，点击“检查 API”
4. 能读取地区
5. 选地区，能看到候选 x64/Gen2 可用 SKU
6. 选择一个低成本 SKU 创建
7. 创建中刷新一次页面，确认任务能够继续显示状态且不会重复创建
8. 成功页得到 IP/root/密码
9. SSH 验证 root 密码登录
10. Azure Portal 检查 NSG 确认为全入站开放
11. 第二次测试可在创建过程中重启 Docker，重新验证 API，确认恢复逻辑能找回 VM 或清理半成品 Resource Group

## 说明

“候选可用”会综合 Resource SKU restrictions、CPU 架构、Hyper-V Generation 与当前 vCPU quota，但 Azure 数据中心实时容量仍可能变化，因此最终创建时仍可能出现 `AllocationFailed` / `SkuNotAvailable`。面板会显示友好错误并尝试回滚本次资源组。

## 参考项目

设计借鉴了：

- `example42/pabawi`：Azure ClientSecretCredential、Subscription / Compute SDK 分层
- `rysweet/azlin`：VM 创建和资源清理方面的实践经验
- `kpoxo6op/soyvps`：Azure 网络资源拓扑

实现代码为本项目独立编写。
