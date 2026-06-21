# Eco Bucket Aquarium Deployment Notes

当前站点已经包含：

- 静态展示页
- 下单创建接口
- TRON / TRC20-USDT 支付校验接口
- 手机号订单查询接口
- 燕文物流轨迹查询接口

主要文件：

- `index.html`
- `site.css`
- `payment.js`
- `functions/api/create-order.js`
- `functions/api/check-payment.js`
- `functions/api/order-lookup.js`
- `functions/api/admin-update-order.js`
- `functions/_lib/`
- `schema.sql`

## 1. 现在的支付识别逻辑

现在不是让所有客户都支付同一个 `208 USDT`。

系统会在创建订单时：

1. 固定产品与运费基价
2. 自动生成一个订单号
3. 自动生成一个“专属支付金额”，例如：
   - `208.003217 USDT`
   - `208.004812 USDT`

这样做的原因很直接：

- 如果两个人都向同一个波场地址转 `208 USDT`
- 链上本身不能仅靠地址和金额 100% 区分是哪一个客户
- 必须给每个订单分配唯一金额，才可以稳定匹配到账记录

所以：

- 波场 API 可以非常准确地判断“这笔专属金额有没有打到你的地址”
- 但前提是每个订单必须使用唯一金额
- 如果客户故意改金额，系统就无法自动准确归单

## 2. TRON_API_KEY 你填写在哪里

你不需要改前端文件。

你需要在 **Cloudflare Pages 项目** 里填写：

1. 打开 Cloudflare Dashboard
2. 进入 `Workers & Pages`
3. 打开项目 `aquarium-hugmogri`
4. 进入 `Settings`
5. 进入 `Variables and Secrets`
6. 在 `Production` 环境新增 Secret：

```text
TRON_API_KEY
```

值填你自己的真实 TronGrid API Key。

当前项目里代码会从这个环境变量读取：

```text
context.env.TRON_API_KEY
```

## 3. 燕文物流密钥填哪里

你给的文档里有两类接口：

### 查询运单详情

文档页：
[查询运单详情](https://opendocs.yw56.com.cn/webfile/6993834083654569984/)

这个接口走：

```text
https://open.yw56.com.cn/api/order
```

需要：

- `user_id`
- `apitoken`
- `sign`

### 查询物流轨迹

文档页：
[物流轨迹查询](https://opendocs.yw56.com.cn/webfile/7128663508291424256/)

这个接口走：

```text
http://api.track.yw56.com.cn/api/tracking?nums=物流单号
```

它需要的不是 `apitoken` 签名，而是 Header：

```text
Authorization: 商户号 或 制单账号
```

当前代码已经先接的是“物流轨迹查询”这一条，因为你要显示真实轨迹。

所以你需要在 Cloudflare Pages 里再新增一个 Secret：

```text
YW_TRACK_AUTH
```

值填：

- 燕文给你的商户号
- 或者制单账号

二选一，按燕文文档可用的那个来。

## 4. Cloudflare 里还要新增什么

### 4.1 D1 数据库

这个项目现在需要一个数据库来保存订单。

你要在 Cloudflare 里做：

1. 打开 Cloudflare Dashboard
2. 进入 `Storage & Databases`
3. 创建一个 `D1` 数据库
4. 数据库名建议：

```text
aquarium-orders
```

5. 创建后，执行 `schema.sql` 里的 SQL

也就是把这个文件内容导入进去：

- [schema.sql](D:/外贸客户数据收集器/output/water-bucket-aquarium/schema.sql)

### 4.2 把 D1 绑定到 Pages 项目

然后回到 Pages 项目 `aquarium-hugmogri`：

1. `Settings`
2. `Bindings`
3. 新增 `D1 database binding`

变量名必须填：

```text
DB
```

这样代码里的：

```text
context.env.DB
```

才能工作。

### 4.3 建议再加一个后台更新令牌

为了以后你手动录入运单号，我已经留了一个后台接口：

```text
/api/admin-update-order
```

它需要一个 Secret：

```text
ADMIN_API_TOKEN
```

这个值你自己定义，例如一串长随机字符串。

以后如果我要帮你做一个“后台录入运单号”的页面，就直接用这个接口。

## 5. 当前订单查询功能已经支持什么

当前逻辑已经按你的要求设计成：

- 用户输入手机号
- 查询他自己的订单
- 展示订单信息
- 展示物流信息

订单信息会显示：

- 订单号
- 下单时间
- 款式
- 国家
- 客户信息
- 地址
- 产品与运费金额
- 实际支付金额
- 付款地址
- 交易哈希
- 支付状态

物流信息会显示：

- 如果你还没录运单号：`暂无物流轨迹`
- 如果有运单号但燕文没返回轨迹：`暂无物流轨迹`
- 如果燕文返回了真实轨迹：显示真实物流节点

## 6. 你后面录入物流单号的方式

现在后端已经预留好了。

后续有两种做法：

### 方案 A：先手工调用接口录入

调用：

```text
POST /api/admin-update-order
Authorization: Bearer 你的 ADMIN_API_TOKEN
```

Body:

```json
{
  "orderId": "AQ202606211234ABCD",
  "logisticsWaybill": "UH183870291YP",
  "logisticsProvider": "yanwen"
}
```

### 方案 B：我下一步直接给你做一个后台录单页面

这样你不用手动发接口。

## 7. 本地预览

运行：

```powershell
node preview-server.js
```

打开：

```text
http://127.0.0.1:4190/
```

本地预览现在支持：

- 创建订单
- 查询订单
- 查询本地模拟支付状态

## 8. 你现在最应该做的 Cloudflare 操作

按优先顺序：

1. 在 Pages 项目里填 `TRON_API_KEY`
2. 创建 D1 数据库 `aquarium-orders`
3. 导入 `schema.sql`
4. 在 Pages 项目里绑定 D1，变量名 `DB`
5. 在 Pages 项目里填 `YW_TRACK_AUTH`
6. 在 Pages 项目里填 `ADMIN_API_TOKEN`

## 9. 你后面手动填写哪些信息

你后面手动维护的内容，主要只有两类：

### 9.1 Cloudflare Secrets

在 `Workers & Pages -> aquarium-hugmogri -> Settings -> Variables and Secrets` 里填写：

- `TRON_API_KEY`：你的 TronGrid API Key
- `YW_TRACK_AUTH`：燕文物流轨迹接口需要的 `Authorization`
- `ADMIN_API_TOKEN`：你自己定义的一串后台令牌

### 9.2 某个客户的运单号

客户支付后，你发货时只需要把对应订单的运单号写进去。

现在先用接口手动写入，后端接口已经有了：

```text
POST /api/admin-update-order
```

PowerShell 示例：

```powershell
$body = @{
  orderId = "AQ202606211234ABCD"
  logisticsWaybill = "UH183870291YP"
  logisticsProvider = "yanwen"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "https://aquarium.hugmogri.com/api/admin-update-order" `
  -Method Post `
  -Headers @{ Authorization = "Bearer 你自己的ADMIN_API_TOKEN" } `
  -ContentType "application/json" `
  -Body $body
```

写入成功后：

- 客户再次用手机号查询订单
- 页面会直接显示该运单号
- 系统会自动拿这个运单号去查燕文轨迹
- 如果燕文有轨迹，就显示真实轨迹
- 如果还没有轨迹，就显示 `暂无物流轨迹`

## 10. 相关文档

- [查询运单详情](https://opendocs.yw56.com.cn/webfile/6993834083654569984/)
- [物流轨迹查询](https://opendocs.yw56.com.cn/webfile/7128663508291424256/)

## 11. 一个现实提醒

如果你坚持所有客户都支付完全一样的金额，例如都支付 `208 USDT` 到同一个地址，那么：

- 你无法做到真正稳定的自动归单
- 这不是 Cloudflare 问题
- 也不是代码问题
- 是区块链收款模式本身的信息不足

要做到稳定自动归单，至少要满足下面其中一个：

1. 每个订单唯一金额
2. 每个订单唯一收款地址
3. 客户支付后额外上传交易哈希，并由人工二次确认

当前我已经给你做的是最实际、最省维护的一种：

- 同一个地址
- 每单唯一金额
