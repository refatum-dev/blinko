import { BufferLoader } from 'langchain/document_loaders/fs/buffer';
import { createOllama, OllamaProvider } from 'ollama-ai-provider';
import { AiBaseModelProvider } from '.';
import { LanguageModelV2, ProviderV2 } from 'ai';

export class OllamaModelProvider extends AiBaseModelProvider {
  constructor({ globalConfig }) {
    super({ globalConfig });
  }

  protected createProvider(): ProviderV2 {
    return createOllama({
      baseURL: this.globalConfig.aiApiEndpoint?.trim() || undefined,
      // fetch: this.proxiedFetch
    }) as ProviderV2;
  }

  protected getLLM(): LanguageModelV2 {
    const provider = this.provider as OllamaProvider;
    return provider.languageModel(this.globalConfig.aiModel ?? 'llama3');
  }

  public AudioLoader(audioPath): BufferLoader {
    return null as unknown as BufferLoader;
  }
}
