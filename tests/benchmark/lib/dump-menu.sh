#!/bin/bash
# Typora / Mellow 菜单树 dump（AX API，显式四层嵌套）—— 全量对标复评 A1-1 / A2-1
# 修饰键解码（AXMenuItemCmdModifiers bitfield）：
#   bit0(1)=Shift  bit1(2)=Option  bit2(4)=Control  bit3(8)=无Cmd（裸键/F键）
# 不可见字符（F1-F19/箭头/回车等 PUA 区）输出 hex 码点。
# 用法: bash dump-menu.sh <进程名> [输出文件]
PROC="${1:-Typora}"
OUT="${2:-/tmp/menu-dump.txt}"

PROC_NAME="$PROC" osascript <<'APPLESCRIPT' > "$OUT" 2>&1
on decodeMods(m)
  set s to ""
  if (m mod 16) ≥ 8 then set s to s & "NoCmd"
  if (m mod 8) ≥ 4 then set s to s & "Ctrl"
  if (m mod 4) ≥ 2 then set s to s & "Opt"
  if (m mod 2) ≥ 1 then set s to s & "Shift"
  if s is "" then set s to "Cmd"
  return s
end decodeMods

on charRepr(c)
  -- 可见 ASCII 直接输出；不可见字符输出 <U+XXXX>
  set cd to id of c
  if cd ≥ 32 and cd < 127 then return c
  set hex to do shell script "printf 'U+%04X' " & cd
  return "<" & hex & ">"
end charRepr

on itemLabel(mi)
  tell application "System Events"
    set nm to name of mi
    set txt to nm
    try
      set acc to value of attribute "AXMenuItemCmdChar" of mi
      if acc is not missing value and acc is not "" then
        set modStr to "Cmd"
        try
          set accMods to (value of attribute "AXMenuItemCmdModifiers" of mi) as integer
          set modStr to my decodeMods(accMods)
        end try
        set txt to txt & " [" & modStr & "+" & (my charRepr(acc)) & "]"
      end if
    end try
    try
      set mk to value of attribute "AXMenuItemMarkChar" of mi
      if mk is not missing value and mk is not "" then set txt to txt & " (" & mk & ")"
    end try
    return txt
  end tell
end itemLabel

on hasSubMenu(mi)
  tell application "System Events"
    try
      set c to count of menus of mi
      return c > 0
    end try
    return false
  end tell
end hasSubMenu

set procName to (system attribute "PROC_NAME")
set allOut to ""
tell application "System Events"
  tell process procName
    set menuCount to count of menu bar items of menu bar 1
    repeat with m from 1 to menuCount
      set mbi to menu bar item m of menu bar 1
      set mbName to name of mbi
      set allOut to allOut & "=== " & mbName & " ===" & linefeed
      try
        set topMenu to menu 1 of mbi
        set n1 to count of menu items of topMenu
        repeat with i from 1 to n1
          set mi1 to menu item i of topMenu
          set allOut to allOut & "  " & (my itemLabel(mi1)) & linefeed
          if (my hasSubMenu(mi1)) then
            set menu2 to menu 1 of mi1
            set n2 to count of menu items of menu2
            repeat with j from 1 to n2
              set mi2 to menu item j of menu2
              set allOut to allOut & "    " & (my itemLabel(mi2)) & linefeed
              if (my hasSubMenu(mi2)) then
                set menu3 to menu 1 of mi2
                set n3 to count of menu items of menu3
                repeat with k from 1 to n3
                  set mi3 to menu item k of menu3
                  set allOut to allOut & "      " & (my itemLabel(mi3)) & linefeed
                  if (my hasSubMenu(mi3)) then
                    set menu4 to menu 1 of mi3
                    set n4 to count of menu items of menu4
                    repeat with l from 1 to n4
                      set mi4 to menu item l of menu4
                      set allOut to allOut & "        " & (my itemLabel(mi4)) & linefeed
                    end repeat
                  end if
                end repeat
              end if
            end repeat
          end if
        end repeat
      end try
    end repeat
  end tell
end tell
return allOut
APPLESCRIPT

echo "Dump 完成: $(wc -l < "$OUT") 行 → $OUT"
