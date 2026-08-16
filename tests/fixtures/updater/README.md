# Updater 测试夹具（TEST-ONLY，禁止用于生产）

本目录包含 Auto Update 安全测试的固定夹具：

| 文件 | 说明 |
|---|---|
| `mock-update.bin` | 模拟更新产物（固定字节内容） |
| `mock-update.bin.sig` | 用 TEST-ONLY 私钥对该产物生成的签名 |
| `test-pub.key` | TEST-ONLY 公钥（base64，minisign 格式） |

**这些密钥与生产 updater 密钥无关。** 生产密钥：

- 公钥：`apps/desktop/src-tauri/tauri.conf.json → plugins.updater.pubkey`
- 私钥：CI secret `TAURI_SIGNING_PRIVATE_KEY`（本机开发密钥在 `~/.tauri/mellow.key`，repo 外）

用途：`apps/desktop/src-tauri/tests/updater_safety.rs` 验证 signed update /
verify package（篡改拒绝）/ 生产 pubkey 合法性 / mock 服务器端到端。

TEST-ONLY 私钥不随仓库分发（签名已预生成）。
