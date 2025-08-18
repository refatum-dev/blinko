import { LanguageModelV1, ProviderV1 } from '@ai-sdk/provider';
import { AiBaseModelProvider } from '.';
import { createPerplexity } from '@ai-sdk/perplexity';

export class PerplexityModelProvider extends AiBaseModelProvider {
  constructor({ globalConfig }) {
    super({ globalConfig });
  }
  
  protected createProvider(): ProviderV1 {
    return createPerplexity({
      apiKey: this.globalConfig.aiApiKey,
    });
  }

  protected getLLM(): LanguageModelV1 {
    return this.provider.languageModel(this.globalConfig.aiModel ?? 'sonar');
  }
}
