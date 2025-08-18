import { EmbeddingModelV2, LanguageModelV2, ProviderV2 } from 'ai';
import { AiBaseModelProvider } from '.';
import { createVoyage } from 'voyage-ai-provider';

export class VoyageModelProvider extends AiBaseModelProvider {
  constructor({ globalConfig }) {
    super({ globalConfig });
  }

  protected createProvider(): ProviderV2 {
    return createVoyage({
      apiKey: this.globalConfig.aiApiKey,
      // fetch: this.proxiedFetch
    });
  }

  protected getLLM(): LanguageModelV2 {
    return this.provider.languageModel(this.globalConfig.aiModel ?? 'voyage-3');
  }

  protected getEmbeddings(): EmbeddingModelV2<string> {
    if (this.globalConfig.embeddingApiKey) {
      let overrideProvider = createVoyage({
        apiKey: this.globalConfig.embeddingApiKey,
      });
      return overrideProvider.textEmbeddingModel(this.globalConfig.embeddingModel ?? 'voyage-3-large');
    }
    return this.provider.textEmbeddingModel(this.globalConfig.embeddingModel ?? 'voyage-3-large');
  }
}
