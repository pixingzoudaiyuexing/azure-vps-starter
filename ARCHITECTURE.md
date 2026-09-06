# Architecture

单容器 Node.js 应用：Express API + 静态前端。

后端使用 Azure SDK：Identity、Resources Subscriptions、Compute、Network、Resources。

凭据只存在于一次 HTTP 请求和当前浏览器页面内存，不持久化。

每次创建使用独立 Resource Group，使失败回滚和后续删除资源更简单。
