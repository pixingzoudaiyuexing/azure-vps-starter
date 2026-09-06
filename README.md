# Azure VPS Starter

一个极简的 Azure VPS 创建面板：输入 Service Principal API 凭据，检查订阅可用地区和 VM SKU，创建 Linux VPS，并返回公网 IP、root 用户和随机密码。

## 当前 MVP

- 输入 Tenant ID / Client ID / Client Secret / Subscription ID
- 验证 Azure Subscription
- 获取地区列表
- 通过 Resource SKUs 读取地区型号并识别订阅限制
- Ubuntu 24.04 / Ubuntu 22.04 / Debian 12
- 每台 VPS 使用独立 Resource Group
- 自动创建 VNet / Subnet / NSG / Standard Public IPv4 / NIC / VM
- NSG 入站规则：所有协议、所有端口、任意来源
- cloud-init 开启 root 密码 SSH 登录
- 创建成功返回 IP / root / 密码
- 创建失败时尽力删除本次新建的整个 Resource Group，减少残留计费资源
- Azure API 凭据不落盘、不写数据库、不写浏览器 localStorage

## 部署

```bash
git clone https://github.com/pixingzoudaiyuexing/azure-vps-starter.git
cd azure-vps-starter
docker compose up -d --build
```

浏览器打开：`http://服务器IP:3000`

## Azure 权限

Service Principal 必须对目标 Subscription 或目标范围拥有足够权限创建：

- Resource Group
- Network Security Group
- Virtual Network / Subnet
- Public IP
- Network Interface
- Virtual Machine / Managed Disk

MVP 最简单的测试方式是在测试 Subscription 上授予 Contributor。生产使用建议后续收敛为自定义最小权限角色。

## 安全说明

这个工具按设计会创建一条 **全部入站开放** 的 NSG 规则，相当于把 VPS 暴露到互联网。请只在你明确需要这种网络策略时使用。

API 凭据会从浏览器发送到本服务端，再由服务端调用 Azure。若面板不只在可信内网使用，请务必在前面加 HTTPS 反向代理，不要通过公网明文 HTTP 提交 Client Secret。

## 验证顺序

首次人工测试建议按顺序：

1. `/healthz` 返回 `ok: true`
2. 填四项 Azure API，点击“检查 API”
3. 能读取地区
4. 选地区，能看到候选可用 SKU
5. 选择一个低成本 SKU 创建
6. 成功页得到 IP/root/密码
7. SSH 验证 root 密码登录
8. Azure Portal 检查 NSG 确认为全入站开放

## 参考项目

设计借鉴了：

- `example42/pabawi`：Azure ClientSecretCredential、Subscription / Compute SDK 分层
- `rysweet/azlin`：VM 创建和资源清理方面的实践经验
- `kpoxo6op/soyvps`：Azure 网络资源拓扑

实现代码为本项目独立编写。
