# Azure VPS Starter

一个极简的 Azure VPS 创建面板：输入 Service Principal API 凭据，检查订阅可用地区、VM SKU 和当前 vCPU 配额，创建 Linux VPS，并返回公网 IP、root 用户和随机密码。

## 当前 MVP

- 输入 Tenant ID / Client ID / Client Secret / Subscription ID
- 验证 Azure Subscription
- 获取地区列表
- 通过 Resource SKUs 识别订阅/地区限制
- 读取地区 Compute Usage，过滤当前 vCPU 配额不足的型号
- Ubuntu 24.04 / Ubuntu 22.04 / Debian 12
- 每台 VPS 使用独立 Resource Group
- 自动创建 VNet / Subnet / NSG / Standard Public IPv4 / NIC / VM
- NSG 入站规则：所有协议、所有端口、任意来源
- 使用 Azure Managed Run Command 的 protected parameter 设置 root 密码并开启 root SSH；密码不写入 customData
- 创建成功返回 IP / root / 密码
- 创建失败时尽力删除本次新建的整个 Resource Group，减少残留计费资源
- Azure API 凭据不落盘、不写数据库、不写浏览器 localStorage

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

API 凭据只用于当前请求。服务端没有数据库，也不会把 Client Secret 写入日志或配置文件；浏览器端也不使用 localStorage/sessionStorage 保存凭据。

root 密码通过 Azure Managed Run Command 的 protected parameter 下发，临时 Run Command 在成功后会尽力删除。创建过程任一步失败都会尝试删除本次独立 Resource Group。

## 验证顺序

首次人工测试建议按顺序：

1. Docker 启动正常
2. 通过 SSH 隧道打开 `http://127.0.0.1:3000`
3. 填四项 Azure API，点击“检查 API”
4. 能读取地区
5. 选地区，能看到候选可用 SKU
6. 选择一个低成本 SKU 创建
7. 成功页得到 IP/root/密码
8. SSH 验证 root 密码登录
9. Azure Portal 检查 NSG 确认为全入站开放

## 说明

“候选可用”会综合 Resource SKU restrictions 与当前 vCPU quota，但 Azure 数据中心实时容量仍可能变化，因此最终创建时仍可能出现 `AllocationFailed` / `SkuNotAvailable`。面板会显示友好错误并尝试回滚本次资源组。

## 参考项目

设计借鉴了：

- `example42/pabawi`：Azure ClientSecretCredential、Subscription / Compute SDK 分层
- `rysweet/azlin`：VM 创建和资源清理方面的实践经验
- `kpoxo6op/soyvps`：Azure 网络资源拓扑

实现代码为本项目独立编写。
