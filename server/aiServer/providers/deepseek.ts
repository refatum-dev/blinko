import { AiBaseModelProvider } from '.';
import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModelV2, ProviderV2 } from '@ai-sdk/provider';

export class DeepSeekModelProvider extends AiBaseModelProvider {
  constructor({ globalConfig }) {
    super({ globalConfig });
  }

  protected createProvider(): ProviderV2 {
    return createOpenAI({
      apiKey: this.globalConfig.aiApiKey,
      // fetch: this.proxiedFetch
    });
  }

  protected getLLM(): LanguageModelV2 {
    return this.provider.languageModel(this.globalConfig.aiModel ?? 'gpt-4o');
  }
}
