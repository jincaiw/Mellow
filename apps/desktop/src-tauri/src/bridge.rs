use tauri::AppHandle;
use tauri::Emitter;

use crate::BridgeMessage;

/// CoreEditor → native 桥接入口。
///
/// V0.0 策略：
/// - `core` 模块的 `notify*` 全部为 fire-and-forget 状态通知，返回 `null`（Promise resolve null，
///   CoreEditor 内部不依赖返回值）；
/// - 其余模块（completion/preview/tokenizer/api/foundationModels/translation）V0.0 无宿主实现，
///   返回 `null`（CoreEditor 对缺失宿主防御式处理）。
///
/// 后续版本按需扩展：把 `notifyViewDidUpdate` 等转发为前端事件（dirty/选区状态）。
#[tauri::command]
pub fn bridge_call(
    app: AppHandle,
    message: BridgeMessage,
) -> Result<Option<serde_json::Value>, String> {
    // 预留：dirty 状态转发（V0.0 前端直接读 CoreEditor，暂不需要）
    match message.module_name.as_str() {
        "core" => {
            // 状态通知：转发为事件供 React 订阅（当前无订阅者，no-op）
            let _ = app.emit(
                "mellow://bridge",
                serde_json::json!({
                    "moduleName": message.module_name,
                    "methodName": message.method_name,
                }),
            );
            Ok(None)
        }
        _ => Ok(None),
    }
}
