import { AiBaseModelProvider } from '.';
import { createAnthropic } from '@ai-sdk/anthropic';
import { LanguageModelV2, ProviderV2 } from '@ai-sdk/provider';

export class AnthropicModelProvider extends AiBaseModelProvider {
  constructor({ globalConfig }) {
    super({ globalConfig });
  }

  protected createProvider(): ProviderV2 {
    return createAnthropic({
      apiKey: this.globalConfig.aiApiKey,
      baseURL: this.globalConfig.aiApiEndpoint || undefined,
      // fetch: this.proxiedFetch
    });
  }

  protected getLLM(): LanguageModelV2 {
    return this.provider.languageModel(this.globalConfig.aiModel ?? 'claude-3-5-sonnet-20241022');
  }
}
