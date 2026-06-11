import { CodexProviderPlugin } from '../codex/plugin.js';

export class OpenAINativeProviderPlugin extends CodexProviderPlugin {
  declare supportsBuiltinWebSearchTool: boolean;
  constructor(options: ConstructorParameters<typeof CodexProviderPlugin>[0] = {}) {
    super(options);
    this.kind = 'openai-native';
    this.displayName = 'OpenAI Native';
    this.supportsBuiltinWebSearchTool = true;

  }


}
