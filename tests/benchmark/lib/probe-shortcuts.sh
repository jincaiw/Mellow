#!/bin/bash
# 探测 Typora 关键菜单项的原始 AX 修饰键值 —— A1-2 快捷键全集提取
PROC_NAME="Typora" osascript <<'APPLESCRIPT' 2>&1
on probe(mbiName, pathList)
  tell application "System Events"
    tell process "Typora"
      set out to ""
      try
        set mbi to menu bar item mbiName of menu bar 1
        set mi to item 1 of pathList
        set target to menu item mi of menu 1 of mbi
        repeat with idx from 2 to count of pathList
          set target to menu item (item idx of pathList) of menu 1 of target
        end repeat
        set nm to name of target
        set acc to "?"
        set mods to "?"
        try
          set acc to value of attribute "AXMenuItemCmdChar" of target
        end try
        try
          set mods to (value of attribute "AXMenuItemCmdModifiers" of target) as integer
        end try
        set out to nm & " => char:[" & acc & "] mods:" & mods
      on error errMsg
        set out to "ERR: " & errMsg
      end try
      return out
    end tell
  end tell
end probe

set results to ""
-- 段落菜单关键项
set results to results & (my probe("段落", {"公式块"})) & linefeed
set results to results & (my probe("段落", {"代码块"})) & linefeed
set results to results & (my probe("段落", {"引用"})) & linefeed
set results to results & (my probe("段落", {"有序列表"})) & linefeed
set results to results & (my probe("段落", {"无序列表"})) & linefeed
set results to results & (my probe("段落", {"任务列表"})) & linefeed
set results to results & (my probe("段落", {"提升标题级别"})) & linefeed
set results to results & (my probe("段落", {"降低标题级别"})) & linefeed
set results to results & (my probe("段落", {"表格", "插入表格"})) & linefeed
-- 格式菜单
set results to results & (my probe("格式", {"加粗"})) & linefeed
set results to results & (my probe("格式", {"斜体"})) & linefeed
set results to results & (my probe("格式", {"代码"})) & linefeed
set results to results & (my probe("格式", {"删除线"})) & linefeed
set results to results & (my probe("格式", {"超链接"})) & linefeed
set results to results & (my probe("格式", {"图像", "插入图片"})) & linefeed
set results to results & (my probe("格式", {"清除样式"})) & linefeed
-- 编辑菜单
set results to results & (my probe("编辑", {"撤消"})) & linefeed
set results to results & (my probe("编辑", {"重做"})) & linefeed
set results to results & (my probe("编辑", {"复制为 Markdown"})) & linefeed
set results to results & (my probe("编辑", {"粘贴为纯文本"})) & linefeed
set results to results & (my probe("编辑", {"选择", "选择段落或块"})) & linefeed
set results to results & (my probe("编辑", {"选择", "选中当前行或句"})) & linefeed
set results to results & (my probe("编辑", {"删除", "删除块"})) & linefeed
-- 显示菜单
set results to results & (my probe("显示", {"源代码模式"})) & linefeed
set results to results & (my probe("显示", {"专注模式"})) & linefeed
set results to results & (my probe("显示", {"打字机模式"})) & linefeed
set results to results & (my probe("显示", {"显示／隐藏侧边栏"})) & linefeed
set results to results & (my probe("显示", {"大纲"})) & linefeed
set results to results & (my probe("显示", {"文档列表"})) & linefeed
set results to results & (my probe("显示", {"文件树"})) & linefeed
set results to results & (my probe("显示", {"搜索"})) & linefeed
set results to results & (my probe("显示", {"放大"})) & linefeed
set results to results & (my probe("显示", {"缩小"})) & linefeed
set results to results & (my probe("显示", {"实际大小"})) & linefeed
set results to results & (my probe("显示", {"显示所有标签页"})) & linefeed
-- 文件菜单
set results to results & (my probe("文件", {"新建"})) & linefeed
set results to results & (my probe("文件", {"新建标签页"})) & linefeed
set results to results & (my probe("文件", {"快速打开…"})) & linefeed
set results to results & (my probe("文件", {"保存为…"})) & linefeed
set results to results & (my probe("文件", {"导出", "PDF"})) & linefeed
set results to results & (my probe("文件", {"导出", "使用上一次设置导出"})) & linefeed
-- 段落·表格子菜单
set results to results & (my probe("段落", {"表格", "下方插入行"})) & linefeed
set results to results & (my probe("段落", {"表格", "删除行"})) & linefeed
set results to results & (my probe("段落", {"列表缩进", "增加缩进"})) & linefeed
set results to results & (my probe("段落", {"列表缩进", "减少缩进"})) & linefeed
return results
APPLESCRIPT
