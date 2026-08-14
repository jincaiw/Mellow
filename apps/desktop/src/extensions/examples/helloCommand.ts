/**
 * examples/hello-command.ts —— 示例扩展（Command 类型）。
 * 演示：manifest 声明（默认最小权限）→ setup 填充 contributions.commands → 命令面板可调用。
 * 注册方式：App.tsx `extensionRegistryRef.current.register(...)`。
 */
import type { ExtensionContext, ExtensionManifest } from '../../../../../packages/extension-api/src';

export const helloCommandManifest: ExtensionManifest = {
  id: 'com.mellow.examples.hello-command',
  version: '1.0.0',
  name: 'Hello Command 示例',
  description: '演示 Command 贡献点与 document 权限门面',
  author: 'Mellow',
  type: 'command',
  permissions: ['document.read', 'document.write'],
};

export function setupHelloCommand(ctx: ExtensionContext): void {
  ctx.contributions.commands = [
    {
      id: 'extension.hello.insertGreeting',
      title: { zh: '扩展：插入问候', en: 'Extension: Insert Greeting' },
      run: (c) => {
        c.document.insertText('Hello from Mellow Extension!');
      },
    },
  ];
}
