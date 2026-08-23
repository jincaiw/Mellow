# Markdown Syntax Demo Parity Fixtures

- `original.md`：下载样例的逐字节冻结副本，不得修改。
- `local-assets.md`：仅将三个远程图片引用替换为本目录确定性 SVG，用于离线渲染对比。
- `interaction.md`：保留原样例并追加独立交互测试区，用于 Caret、IME、Undo 与节点状态测试。
- `assets/`：原创测试图，不来自 Typora 资源。

规范实测基线：Typora 1.14.9 build 7785。原文件 SHA-256：`23d01902be09eb4abe7902c2d2a4d234396022922423a9bac033e0d0c4bf35db`。

## SHA-256

| 文件 | SHA-256 |
|---|---|
| `original.md` | `23d01902be09eb4abe7902c2d2a4d234396022922423a9bac033e0d0c4bf35db` |
| `local-assets.md` | `7d2e718ccfe128008d908404c04e7926a7bd04a09420ecdc1443382ff0adbec4` |
| `interaction.md` | `80a9dd3391f3e350bffdb4e20cb0ba564eb9afb022d544ea54b18b9cdafae548` |
| `assets/markdown-icon.svg` | `917132d7c9774343c14f2c13b2f3e7c24936f78b8184ca0ac4af38170eb629c1` |
| `assets/click-me.svg` | `6e21fbd9c65f704d6adaef02a8d7dbc72a08ecf3d910696846044ecd764d52b6` |
| `assets/center-image.svg` | `637fdb4e6ee9831db207453246ac1410a84d4a915159c5b8a229d8e17203e791` |
