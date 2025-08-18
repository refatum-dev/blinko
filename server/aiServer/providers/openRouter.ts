import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { AiBaseModelProvider } from '.';
import { LanguageModelV2, ProviderV2 } from '@ai-sdk/provider';

export class OpenRouterModelProvider extends AiBaseModelProvider {
  constructor({ globalConfig }) {
    super({ globalConfig });
  }

  protected createProvider(): ProviderV2 {
    return createOpenRouter({
      apiKey: this.globalConfig.aiApiKey, 
      // baseURL: this.globalConfig.aiApiEndpoint,
      // fetch: this.proxiedFetch
    });
  }

  protected getLLM(): LanguageModelV2 {
    return this.provider.languageModel(this.globalConfig.aiModel ?? 'openai/gpt-3.5-turbo');
  }

  Image() {
    return this.provider.imageModel?.('dall-e-3');
  }
}
