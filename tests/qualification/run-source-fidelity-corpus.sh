#!/usr/bin/env bash
# File Safety Gate —— Source Fidelity Corpus
#
# 对大量真实 Markdown 文件执行：Open → No Edit → Save → Git Diff
# 目标：0 diff（字节级一致，spec §3 Source Fidelity）。
#
# 覆盖：LF / CRLF / UTF-8 / BOM / Chinese / Large File / Tables / Math / Mermaid /
#       YAML / HTML / Images。
#
# 机制：
#   1. 组装语料库（真实 fixture + docs + 生成变体）到临时目录并 git init + commit；
#   2. source_fidelity 工具原地执行真实原子保存管线（decode → encode → atomic_save）；
#   3. `git status --porcelain` / `git diff` 必须为空 —— 任何无意字节变化即失败。
#
# 用法：bash tests/qualification/run-source-fidelity-corpus.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TAURI="$ROOT/apps/desktop/src-tauri"

echo "== 1/5 构建 source_fidelity 工具 =="
TOOL="$ROOT/tools/source-fidelity"
cargo build --quiet --manifest-path "$TOOL/Cargo.toml"
BIN="$TOOL/target/debug/source-fidelity"
[ -x "$BIN" ]

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
CORPUS="$WORK/corpus"
mkdir -p "$CORPUS"/{real,lf,crlf,bom,chinese,large,tables,math,mermaid,yaml,html,images}

echo "== 2/5 组装语料库 =="

# real/：仓库内全部真实 Markdown / HTML / TSV（fixtures + docs + 根文档 + benchmark reports）
(
  cd "$ROOT"
  while IFS= read -r -d '' f; do
    mkdir -p "$CORPUS/real/$(dirname "$f")"
    cp "$f" "$CORPUS/real/$f"
  done < <(find tests/fixtures docs -type f \( -name '*.md' -o -name '*.html' -o -name '*.tsv' \) -print0)
  while IFS= read -r -d '' f; do
    mkdir -p "$CORPUS/real/$(dirname "$f")"
    cp "$f" "$CORPUS/real/$f"
  done < <(find tests/benchmark/reports -type f -name '*.md' -print0 2>/dev/null || true)
  cp README.md AGENTS.md THIRD_PARTY_NOTICES.md "$CORPUS/real/"
)

# lf/ + crlf/：同一内容两种 EOL
cp "$ROOT/tests/fixtures/markdown/mixed-document.md" "$CORPUS/lf/mixed-document-lf.md"
cp "$ROOT/tests/fixtures/markdown/table.md" "$CORPUS/lf/table-lf.md"
perl -pe 's/\n/\r\n/g' "$ROOT/tests/fixtures/markdown/mixed-document.md" > "$CORPUS/crlf/mixed-document-crlf.md"
perl -pe 's/\n/\r\n/g' "$ROOT/tests/fixtures/markdown/table.md" > "$CORPUS/crlf/table-crlf.md"
perl -pe 's/\n/\r\n/g' "$ROOT/tests/fixtures/yaml/front-matter-corpus.md" > "$CORPUS/crlf/yaml-front-matter-crlf.md"

# bom/：UTF-8 BOM / UTF-16 LE BOM / UTF-16 BE BOM（真实世界：Word / Sublime / VS Code 产物）
printf '\xef\xbb\xbf' > "$CORPUS/bom/utf8-bom.md"
cat "$ROOT/tests/fixtures/markdown/mixed-document.md" >> "$CORPUS/bom/utf8-bom.md"
{ printf '\xff\xfe'; iconv -f UTF-8 -t UTF-16LE "$ROOT/tests/fixtures/markdown/mixed-document.md"; } > "$CORPUS/bom/utf16le-bom.md"
{ printf '\xfe\xff'; iconv -f UTF-8 -t UTF-16BE "$ROOT/tests/fixtures/markdown/mixed-document.md"; } > "$CORPUS/bom/utf16be-bom.md"
{ printf '\xef\xbb\xbf'; iconv -f UTF-8 -t UTF-8 "$ROOT/tests/fixtures/math/typora-math-corpus.md"; } > "$CORPUS/bom/utf8-bom-math.md"

# chinese/：真实中文文档 + 生成富中文样例
cp "$ROOT/docs/specs/document-file-safety-spec.md" "$CORPUS/chinese/spec-file-safety-zh.md"
cp "$ROOT/docs/product/Mellow-PRD-V1.2-FINAL.md" "$CORPUS/chinese/prd-zh.md"
cp "$ROOT/README.md" "$CORPUS/chinese/readme-zh.md"
cat > "$CORPUS/chinese/rich-zh.md" <<'EOF'
# 中文富文档

## 标题与强调

**加粗**、*斜体*、`行内代码`、~~删除线~~、上标<sup>2</sup>。

## 表格

| 功能 | 状态 | 说明 |
|---|---|---|
| 实时预览 | ✅ | 已完成 |
| 中文输入法 | ✅ | IME 守卫 |

## 数学公式

$$
E = mc^2
$$

## Mermaid

```mermaid
flowchart LR
  A[开始] --> B{判断}
  B -->|是| C[结束]
  B -->|否| A
```

## 代码块

```rust
fn main() { println!("你好，世界！"); }
```

## 图片引用

![示例图片](assets/0000.png)

## 引用

> 数据安全优先于一切体验优化。
EOF

# large/：真实大文件（1MB / 5MB / 100k 行）+ 确定性生成的 10MB
cp "$ROOT/tests/benchmark/fixtures/1MB.md" "$CORPUS/large/1MB.md"
cp "$ROOT/tests/benchmark/fixtures/5MB.md" "$CORPUS/large/5MB.md"
cp "$ROOT/tests/benchmark/fixtures/100k-lines.md" "$CORPUS/large/100k-lines.md"
perl -e 'for($i=0;$i<120000;$i++){ printf "# 章节 %d\n\n这是第 %d 章的中文内容，用于大文件 Source Fidelity 测试。\n\n| 列A | 列B |\n|---|---|\n| %d | 值 |\n\n", $i, $i, $i }' > "$CORPUS/large/10MB-generated.md"
# 补充一个无尾换行的文件（真实世界常见）：截断 1MB 副本的最后一个字节
head -c 1048575 "$ROOT/tests/benchmark/fixtures/1MB.md" > "$CORPUS/large/no-trailing-newline.md"

# tables / math / mermaid / yaml / html / images
cp "$ROOT/tests/fixtures/markdown/table.md" "$CORPUS/tables/table.md"
cp "$ROOT/tests/benchmark/fixtures/large-table.md" "$CORPUS/tables/large-table.md"
cp "$ROOT/tests/fixtures/math/typora-math-corpus.md" "$CORPUS/math/typora-math-corpus.md"
cp "$ROOT/tests/fixtures/mermaid/typora-mermaid-corpus.md" "$CORPUS/mermaid/typora-mermaid-corpus.md"
cp "$ROOT/tests/benchmark/fixtures/100-mermaid.md" "$CORPUS/mermaid/100-mermaid.md"
cp "$ROOT/tests/fixtures/yaml/front-matter-corpus.md" "$CORPUS/yaml/front-matter-corpus.md"
cp "$ROOT/tests/fixtures/html/safe-html-corpus.html" "$CORPUS/html/safe-html-corpus.html"
cp "$ROOT/tests/fixtures/clipboard/rich-clipboard.html" "$CORPUS/html/rich-clipboard.html"
cp "$ROOT/tests/fixtures/clipboard/dangerous-rich-clipboard.html" "$CORPUS/html/dangerous-rich-clipboard.html"
cp "$ROOT/tests/fixtures/markdown/link-image.md" "$CORPUS/images/link-image.md"
cp "$ROOT/tests/benchmark/fixtures/1000-images.md" "$CORPUS/images/1000-images.md"

echo "-- 语料库统计 --"
for d in "$CORPUS"/*/; do
  n="$(find "$d" -type f | wc -l | tr -d ' ')"
  sz="$(du -sh "$d" | awk '{print $1}')"
  printf '  %-12s %4s files  %s\n' "$(basename "$d")" "$n" "$sz"
done
TOTAL_FILES="$(find "$CORPUS" -type f | wc -l | tr -d ' ')"
echo "  总文件数: $TOTAL_FILES"

echo "== 3/5 git init + baseline commit =="
git -C "$CORPUS" init -q
git -C "$CORPUS" config user.email "gate@mellow.local"
git -C "$CORPUS" config user.name "source-fidelity-gate"
git -C "$CORPUS" config core.autocrlf false
git -C "$CORPUS" config core.filemode true
git -C "$CORPUS" add -A
git -C "$CORPUS" commit -qm "corpus baseline"

echo "== 4/5 Open → No Edit → Save（原地原子保存管线）=="
"$BIN" --dir "$CORPUS" "$CORPUS"

echo "== 5/5 Git Diff 校验（必须 0 diff）=="
STATUS="$(git -C "$CORPUS" status --porcelain)"
if [ -n "$STATUS" ]; then
  echo "FAIL —— 存在无意变更（$(echo "$STATUS" | wc -l | tr -d ' ') 项）："
  echo "$STATUS" | head -40
  echo "--- git diff（前 200 行）---"
  git -C "$CORPUS" diff | head -200
  exit 1
fi
echo "PASS —— $TOTAL_FILES 个文件 Open → No Edit → Save 后 git diff = 0（字节级一致）"
