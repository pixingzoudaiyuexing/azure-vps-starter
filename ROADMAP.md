# Roadmap

## MVP
- [x] API 验证
- [x] 地区列表
- [x] Resource SKU 检查
- [x] vCPU quota 预过滤
- [x] x64 / Generation 2 兼容过滤
- [x] Linux Gen2 镜像预设
- [x] 网络和 VM 创建
- [x] Standard SSD OS Disk
- [x] root 密码登录
- [x] Managed Run Command protected parameter 下发 root 密码
- [x] 全入站 NSG
- [x] 成功结果页
- [x] Docker 部署
- [x] 256-bit operation token 幂等创建
- [x] 刷新/断线后任务状态恢复
- [x] Docker/Node 重启后的确定性 Resource Group recovery
- [x] 半成品 Resource Group 自动清理
- [x] Gemini Review #1
- [ ] Gemini Review #2：聚焦 recovery / 竞态 / 幂等 / 计费风险

## Real Azure validation
- [ ] Service Principal 实机验证
- [ ] Resource SKUs / quota / x64 Gen2 过滤在真实订阅返回验证
- [ ] Ubuntu 24.04 创建验证
- [ ] Ubuntu 22.04 创建验证
- [ ] Debian 12 创建验证
- [ ] root SSH 验证
- [ ] 全入站 NSG 验证
- [ ] 页面刷新后继续任务验证
- [ ] 重复提交不重复创建验证
- [ ] 创建过程中 Docker 重启后的 recovery 验证
- [ ] 创建失败整组回滚验证

## Later
- [ ] 删除 VPS
- [ ] 已创建 VPS 列表
- [ ] 最小权限 Azure 自定义角色
- [ ] HTTPS 一键反代方案
