import { LanguageModelV2, ProviderV2 } from '@ai-sdk/provider';
import { AiBaseModelProvider } from '.';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export class GeminiModelProvider extends AiBaseModelProvider {
  constructor({ globalConfig }) {
    super({ globalConfig });
  }
  
  protected createProvider(): ProviderV2 {
    return createGoogleGenerativeAI({
      apiKey: this.globalConfig.aiApiKey,
      // fetch: this.proxiedFetch
    });
  }

  protected getLLM(): LanguageModelV2 {
    return this.provider.languageModel(this.globalConfig.aiModel ?? 'gemini-pro');
  }
}
