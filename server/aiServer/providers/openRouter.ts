import { AiBaseModelProvider } from '.';
import { LanguageModelV2, ProviderV2 } from '@ai-sdk/provider';
import { createOpenAI } from '@ai-sdk/openai';

export class OpenRouterModelProvider extends AiBaseModelProvider {
  constructor({ globalConfig }) {
    super({ globalConfig });
  }

  protected createProvider(): ProviderV2 {
    return createOpenAI({
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
