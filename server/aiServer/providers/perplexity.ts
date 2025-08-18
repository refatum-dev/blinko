import { LanguageModelV2, ProviderV2 } from '@ai-sdk/provider';
import { createPerplexity } from '@ai-sdk/perplexity';
import { AiBaseModelProvider } from '.';

export class PerplexityModelProvider extends AiBaseModelProvider {
  constructor({ globalConfig }) {
    super({ globalConfig });
  }

  protected createProvider(): ProviderV2 {
    return createPerplexity({
      apiKey: this.globalConfig.aiApiKey,
    });
  }

  protected getLLM(): LanguageModelV2 {
    // default to ‘sonar’; you can switch to ‘sonar-pro’, ‘sonar-small’, etc.
    return this.provider.languageModel(this.globalConfig.aiModel ?? 'sonar');
  }
}
