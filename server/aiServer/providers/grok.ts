import { LanguageModelV2, ProviderV2 } from '@ai-sdk/provider';
import { AiBaseModelProvider } from '.';
import { createXai } from '@ai-sdk/xai';

export class GrokModelProvider extends AiBaseModelProvider {
  constructor({ globalConfig }) {
    super({ globalConfig });
  }
  
  protected createProvider(): ProviderV2 {
    return createXai({
      apiKey: this.globalConfig.aiApiKey,
      // fetch: this.proxiedFetch
    });
  }

  protected getLLM(): LanguageModelV2 {
    return this.provider.languageModel(this.globalConfig.aiModel ?? 'grok-v1');
  }
}
