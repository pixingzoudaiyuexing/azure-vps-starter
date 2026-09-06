# Decisions

- MVP 使用 Node.js + JavaScript，而不是 Go：减少构建链和代码量，直接使用 Azure JS SDK。
- MVP 不引入数据库。
- MVP 不引入 React/Vite；前端使用静态 HTML/CSS/JS，优先部署简单。
- SKU 使用 Resource SKUs，而不是 `virtualMachineSizes.list(location)`，因为后者不能表达 Subscription restrictions。
- 每台 VPS 单独 Resource Group，创建失败整组回滚。
- Standard Public IP + NIC 绑定 NSG。
- 明确按需求开放全部入站流量。
