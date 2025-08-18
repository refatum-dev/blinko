import { AiBaseModelProvider } from ".";
import { AzureOpenAIProvider, createAzure } from "@ai-sdk/azure";
import { EmbeddingModelV2, LanguageModelV2, ProviderV2 } from 'ai';

export class AzureOpenAIModelProvider extends AiBaseModelProvider {
  constructor({ globalConfig }) {
    super({ globalConfig });
  }

  protected createProvider(): ProviderV2 {
    return createAzure({
      apiKey: this.globalConfig.aiApiKey,
      baseURL: this.globalConfig.aiApiEndpoint || undefined,
      apiVersion: this.globalConfig.aiApiVersion || undefined,
    });
  }

  protected getLLM(): LanguageModelV2 {
    return (this.provider as AzureOpenAIProvider).languageModel(
      this.globalConfig.aiModel ?? "gpt-3.5-turbo"
    );
  }

  protected getEmbeddings(): EmbeddingModelV2<string> {
    //Custom implementation for Azure OpenAI embeddings
    const config = {
      apiKey: this.globalConfig.embeddingApiKey,
      baseURL: this.globalConfig.embeddingApiEndpoint || undefined,
    };
    if (config.baseURL && config.baseURL) {
      return createAzure(config).textEmbeddingModel(
        this.globalConfig.embeddingModel ?? "text-embedding-3-small"
      );
    }
    return (this.provider as AzureOpenAIProvider).textEmbeddingModel(
      this.globalConfig.embeddingModel ?? "text-embedding-3-small"
    );
  }
}
