//! Windows JumpList（PRD §134 P1「Recent integration」/ desktop-ui-design-spec §Windows JumpList P1）。
//!
//! 任务栏右键图标 → 「最近」分类展示最近打开的文档，点击经 .md 文件关联
//! （tauri.conf.json fileAssociations）直接打开——与 Typora 行为对齐。
//!
//! 实现选择 `SHAddToRecentDocs`（Shell 轻量 API）：系统自动聚合 Recent 分类，
//! 无需 COM 级 ICustomDestinationList 自定义类别/任务；非 Windows 平台 no-op。
//! 调用时机由前端控制：仅在用户「成功打开文档」语义处（recordRecentFile），
//! 避免文件树浏览等内部读取污染系统 Recent。

/// 记录路径到系统最近文档（Windows JumpList Recent category；其他平台 no-op）
pub fn add_recent(path: &str) {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        // SHARD_PATHW = 0x3（windows_sys 未导出该常量；见 WinUI ShellAPI 文档）
        const SHARD_PATHW: u32 = 0x3;
        let wide: Vec<u16> = std::ffi::OsStr::new(path)
            .encode_wide()
            .chain([0])
            .collect();
        // API 仅入队系统 Recent 通知，不校验文件存在性（不存在的路径入队无副作用）
        unsafe {
            windows_sys::Win32::UI::Shell::SHAddToRecentDocs(
                SHARD_PATHW,
                wide.as_ptr() as *const core::ffi::c_void,
            );
        }
    }
    #[cfg(not(windows))]
    {
        let _ = path;
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn add_recent_smoke() {
        // 非 Windows：no-op 不崩溃；Windows：API 调用不 panic。
        // Recent 真实聚合与任务栏展示由 CI Windows runner / 真机验证（P7 真机项）。
        super::add_recent("C:\\nonexistent\\missing.md");
        super::add_recent("/tmp/nonexistent/missing.md");
        super::add_recent("");
    }
}
