# CoreEditor Upstream

- Repository: https://github.com/MarkEdit-app/MarkEdit
- Directory: CoreEditor/
- Commit: 81da2a20122a5a43a0cf45d85f8877e18230ab66
- License: MIT (see LICENSE)

## Sync

```sh
# re-vendor from upstream (keep this file updated)
git -C /tmp/MarkEdit-src pull --depth 1
git -C /tmp/MarkEdit-src rev-parse HEAD > UPSTREAM.md
cp -R /tmp/MarkEdit-src/CoreEditor ./CoreEditor
```

> DO NOT modify files under CoreEditor/ directly.
> Changes belong in apps/desktop/src/host or Mellow-specific packages.
