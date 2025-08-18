import { cache } from '@shared/lib/cache';
import { AzureOpenAIModelProvider } from './providers/azureOpenAI';
import { OpenAIModelProvider } from './providers/openAI';
import { OllamaModelProvider } from './providers/ollama';
import { AnthropicModelProvider } from './providers/anthropic';
import { upsertBlinkoTool } from './tools/createBlinko';
import { createCommentTool } from './tools/createComment';
import { LibSQLVector } from "@mastra/libsql";
import { DeepSeekModelProvider } from './providers/deepseek';
import dayjs from 'dayjs';
import { Agent, Mastra } from '@mastra/core';
import { LanguageModelV2, EmbeddingModelV2 } from 'ai';
import { MarkdownTextSplitter, TokenTextSplitter } from '@langchain/textsplitters';
import { embed } from 'ai';
import { _ } from '@shared/lib/lodash';
import { GeminiModelProvider } from './providers/gemini';
import { GrokModelProvider } from './providers/grok';
import { OpenRouterModelProvider } from './providers/openRouter';
import { webSearchTool } from './tools/webSearch';
import { webExtra } from './tools/webExtra';
import { searchBlinkoTool } from './tools/searchBlinko';
import { updateBlinkoTool } from './tools/updateBlinko';
import { deleteBlinkoTool } from './tools/deleteBlinko';
import { rerank } from '@mastra/rag';
import { AiBaseModelProvider } from './providers';
import { prisma } from '@server/prisma';
import { getGlobalConfig } from '@server/routerTrpc/config';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PerplexityModelProvider } from './providers/perplexity';

export class AiModelFactory {
  //metadata->>'id'
  static async queryAndDeleteVectorById(targetId: number) {
    const { VectorStore } = await AiModelFactory.GetProvider();
    try {
      const query = `
          WITH target_record AS (
            SELECT vector_id 
            FROM 'blinko'
            WHERE metadata->>'id' = ? 
            LIMIT 1
          )
          DELETE FROM 'blinko'
          WHERE vector_id IN (SELECT vector_id FROM target_record)
          RETURNING *;`;
      //@ts-ignore
      const result = await VectorStore.turso.execute({
        sql: query,
        args: [targetId],
      });

      if (result.rows.length === 0) {
        throw new Error(`id  ${targetId} is not found`);
      }

      return {
        success: true,
        deletedData: result.rows[0],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }

  static async queryVector(query: string, accountId: number, _topK?: number) {
    const { VectorStore, Embeddings, provider } = await AiModelFactory.GetProvider();
    const config = await AiModelFactory.globalConfig();
    const topK = _topK ?? config.embeddingTopK ?? 3;
    const embeddingMinScore = config.embeddingScore ?? 0.4;
    const { embedding } = await embed({
      value: query,
      model: Embeddings,
    });

    const result = await VectorStore.query({
      indexName: 'blinko',
      queryVector: embedding,
      topK: topK,
    });
    let filteredResults = result.filter(({ score }) => score >= embeddingMinScore);

    if (config.rerankModel) {
      const rerankmodel = (await provider.rerankModel())!;
      const rerankScore = config.rerankScore ?? 0.5;
      const rerankedResults = await rerank(
        result,
        query,
        rerankmodel,
        {
          topK: config.rerankTopK ?? 3
        }
      );
      // console.log(rerankedResults, 'rerankedResults');
      filteredResults = rerankedResults.filter((i) => i.score >= rerankScore).map((i) => i.result);
    }

    const notes =
      (
        await prisma.notes.findMany({
          where: {
            accountId: accountId,
            id: {
              in: _.uniqWith(filteredResults.map((i) => Number(i.metadata?.id))).filter((i) => !!i) as number[],
            },
          },
          include: {
            tags: { include: { tag: true } },
            attachments: {
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            },
            references: {
              select: {
                toNoteId: true,
                toNote: {
                  select: {
                    content: true,
                    createdAt: true,
                    updatedAt: true,
                  },
                },
              },
            },
            referencedBy: {
              select: {
                fromNoteId: true,
                fromNote: {
                  select: {
                    content: true,
                    createdAt: true,
                    updatedAt: true,
                  },
                },
              },
            },
            _count: {
              select: {
                comments: true,
                histories: true,
              },
            },
          },
        })
      ).map((i) => {
        return { ...i, score: filteredResults.find((t) => Number(t.metadata?.id) == i.id)?.score ?? 0 };
      }) ?? [];

    let aiContext = notes.map((i) => i.content + '\n') || '';
    return { notes, aiContext: aiContext };
  }

  static async rebuildVectorIndex({ vectorStore, isDelete = false }: { vectorStore: LibSQLVector; isDelete?: boolean }) {
    try {
      if (isDelete) {
        await vectorStore.deleteIndex({ indexName: 'blinko' });
      }
    } catch (error) {
      console.error('delete vector index failed:', error);
    }

    const config = await AiModelFactory.globalConfig();
    const model = config.embeddingModel.toLowerCase();
    let userConfigDimensions = config.embeddingDimensions;
    let dimensions: number = 0;
    switch (true) {
      case model.includes('text-embedding-3-small'):
        dimensions = 1536;
        break;
      case model.includes('text-embedding-3-large'):
        dimensions = 3072;
        break;
      case model.includes('cohere/embed-english-v3') || model.includes('bge-m3') || model.includes('voyage') || model.includes('bge-large'):
        dimensions = 1024;
        break;
      case model.includes('cohere'):
        dimensions = 4096;
        break;
      case model.includes('voyage-3-lite'):
        dimensions = 512;
        break;
      case model.includes('bge') || model.includes('bert') || model.includes('bce-embedding-base'):
        dimensions = 768;
        break;
      case model.includes('all-minilm'):
        dimensions = 384;
        break;
      case model.includes('mxbai-embed-large'):
        dimensions = 1024;
        break;
      case model.includes('nomic-embed-text'):
        dimensions = 768;
        break;
      case model.includes('bge-large-en'):
        dimensions = 1024;
        break;
      default:
        if (userConfigDimensions == 0 || userConfigDimensions == undefined || !userConfigDimensions) {
          throw new Error('Must set the embedding dimension in ai Settings > Embed Settings > Advanced Settings');
        }
    }
    if (userConfigDimensions != 0 && userConfigDimensions != undefined) {
      dimensions = userConfigDimensions;
    }
    await vectorStore.createIndex({ indexName: 'blinko', dimension: dimensions, metric: 'cosine' });
  }

  static async globalConfig() {
    return cache.wrap(
      'globalConfig',
      async () => {
        return await getGlobalConfig({ useAdmin: true });
      },
      { ttl: 1000 },
    );
  }

  static async ValidConfig() {
    const globalConfig = await AiModelFactory.globalConfig();
    if (!globalConfig.aiModelProvider || !globalConfig.isUseAI) {
      throw new Error('model provider or apikey not configure!');
    }
    return await AiModelFactory.globalConfig();
  }

  static async GetProvider() {
    const globalConfig = await AiModelFactory.ValidConfig();

    return cache.wrap(
      `GetProvider-
      ${globalConfig.aiModelProvider}-
      ${globalConfig.aiApiKey}-
      ${globalConfig.embeddingModel}-
      ${globalConfig.embeddingApiKey}-
      ${globalConfig.aiModel}-
      ${globalConfig.aiApiEndpoint}-
      ${globalConfig.embeddingTopK}-
      ${globalConfig.embeddingScore}-
      ${globalConfig.isUseHttpProxy}-
      ${globalConfig.httpProxyHost}-
      ${globalConfig.httpProxyPort}-
      ${globalConfig.httpProxyPassword}-
      ${globalConfig.httpProxyUsername}
      `,
      async () => {
        const createProviderResult = async (provider: any) => ({
          LLM: (await provider.LLM()) as LanguageModelV2,
          VectorStore: (await provider.VectorStore()) as LibSQLVector,
          Embeddings: (await provider.Embeddings()) as EmbeddingModelV2<string>,
          MarkdownSplitter: provider.MarkdownSplitter() as MarkdownTextSplitter,
          TokenTextSplitter: provider.TokenTextSplitter() as TokenTextSplitter,
          provider: provider as AiBaseModelProvider
        });

        switch (globalConfig.aiModelProvider) {
          case 'OpenAI':
            return createProviderResult(new OpenAIModelProvider({ globalConfig }));
          case 'AzureOpenAI':
            return createProviderResult(new AzureOpenAIModelProvider({ globalConfig }));
          case 'Ollama':
            return createProviderResult(new OllamaModelProvider({ globalConfig }));
          case 'DeepSeek':
            return createProviderResult(new DeepSeekModelProvider({ globalConfig }));
          case 'Anthropic':
            return createProviderResult(new AnthropicModelProvider({ globalConfig }));
          case 'Grok':
            return createProviderResult(new GrokModelProvider({ globalConfig }));
          case 'Gemini':
            return createProviderResult(new GeminiModelProvider({ globalConfig }));
          case 'OpenRouter':
            return createProviderResult(new OpenRouterModelProvider({ globalConfig }));
          case 'Perplexity':
            return createProviderResult(new PerplexityModelProvider({ globalConfig }));
          default:
            throw new Error(`Unsupported AI model provider: ${globalConfig.aiModelProvider}`);
        }
      },
      { ttl: 24 * 60 * 60 * 1000 },
    );
  }
  static async BaseChatAgent({ withTools = true, withOnlineSearch = false }: { withTools?: boolean; withOnlineSearch?: boolean }) {
    //globel.model.name cache
    const provider = await AiModelFactory.GetProvider();
    let tools: Record<string, any> = {};
    if (withTools) {
      tools = {
        tools: {
          upsertBlinkoTool,
          searchBlinkoTool,
          updateBlinkoTool,
          deleteBlinkoTool,
          webExtra,
          createCommentTool,
        },
      };
    }
    if (withOnlineSearch) {
      tools = {
        tools: { ...tools?.tools, webSearchTool },
      };
    }

    const globalConfig = await AiModelFactory.globalConfig();
    const defaultInstructions =
      `Today is ${dayjs().format('YYYY-MM-DD HH:mm:ss')}\n` +
      'You are a versatile AI assistant who can:\n' +
      '1. Answer questions and explain concepts\n' +
      '2. Provide suggestions and analysis\n' +
      '3. Help with planning and organizing ideas\n' +
      '4. Assist with content creation and editing\n' +
      '5. Perform basic calculations and reasoning\n\n' +
      "6. When using 'web-search-tool' to return results, use the markdown link format to mark the origin of the page" +
      "7. When using 'search-blinko-tool', The entire content of the note should not be returned unless specifically specified by the user " +
      "Always respond in the user's language.\n" +
      'Maintain a friendly and professional conversational tone.';

    const BlinkoAgent = new Agent({
      name: 'Blinko Chat Agent',
      instructions: `Today is ${dayjs().format('YYYY-MM-DD HH:mm:ss')}\n` + globalConfig.globalPrompt || defaultInstructions,
      model: provider?.LLM!,
      ...tools,
    });

    const mastra = new Mastra({
      agents: { BlinkoAgent },
    });
    return mastra.getAgent('BlinkoAgent');
  }

  static #createAgentFactory(
    name: string,
    systemPrompt: string | ((customPrompt?: string) => string),
    loggerName: string,
    options?: {
      tools?: Record<string, any>;
      isWritingAgent?: boolean;
    },
  ) {
    return async (type?: 'expand' | 'polish' | 'custom' | string) => {
      const provider = await AiModelFactory.GetProvider();
      const finalPrompt = typeof systemPrompt === 'function' ? systemPrompt(type!) : systemPrompt;

      const agent = new Agent({
        name: options?.isWritingAgent ? `${name} - ${type}` : name,
        instructions: finalPrompt,
        model: provider?.LLM!,
        ...(options?.tools || {}),
      });

      return new Mastra({
        agents: { agent },
      }).getAgent('agent');
    };
  }

  static TagAgent = AiModelFactory.#createAgentFactory(
    'Blinko Tagging Agent',
    (customPrompt?: string) => {
      console.log(customPrompt, 'customPrompt');
      if (customPrompt) {
        return customPrompt;
      }
      return `You are a precise label classification expert, and you will generate precisely matched content labels based on the content. Rules:
      1. **Core Selection Principle**: Select 5 to 8 tags from the existing tag list that are most relevant to the content theme. Carefully compare the key information, technical types, application scenarios, and other elements of the content to ensure that the selected tags accurately reflect the main idea of the content.
      2. **Language Matching Strategy**: If the language of the existing tags does not match the language of the content, give priority to using the language of the existing tags to maintain the consistency of the language style of the tag system.
      3. **Tag Structure Requirements**: When using existing tags, it is necessary to construct a parent-child hierarchical structure. For example, place programming language tags under parent tags such as #Code or #Programming, like #Code/JavaScript, #Programming/Python. When adding new tags, try to classify them under appropriate existing parent tags as well.
      4. **New Tag Generation Rules**: If there are no tags in the existing list that match the content, create new tags based on the key technologies, business fields, functional features, etc. of the content. The language of the new tags should be consistent with that of the content.
      5. **Response Format Specification**: Only return tags separated by commas. There should be no spaces between tags, and no formatting or code blocks should be used. Each tag should start with #, such as #JavaScript.
      6. **Example**: For JavaScript content related to web development, a reference response could be #Programming/Languages, #Web/Development, #Code/JavaScript, #Front-End Development/Frameworks (if applicable), #Browser Compatibility. It is strictly prohibited to respond in formats such as code blocks, JSON, or Markdown. Just provide the tags directly. 
          `;
    },
    'BlinkoTag',
  );

  static EmojiAgent = AiModelFactory.#createAgentFactory(
    'Blinko Emoji Agent',
    `You are an emoji recommendation expert. Rules:
     1. Analyze content theme and emotion
     2. Return 4-10 comma-separated emojis
     3. Use '💻,🔧' for tech content, '😊,🎉' for emotional content
     4. Must be separated by comma like '💻,🔧'`,
    'BlinkoEmoji',
  );

  static RelatedNotesAgent = AiModelFactory.#createAgentFactory(
    'Blinko Related Notes Agent',
    `You are a keyword extraction expert. Your task is to extract the most representative keywords from the provided note content.

    Rules:
    1. Analyze note content to identify core themes, concepts, and key information
    2. Extract 5-8 keywords or phrases that accurately summarize the content
    3. Ensure the extracted keywords are specific and can be used to find related notes
    4. Sort the extracted keywords by importance from high to low
    5. Return a comma-separated list of keywords without any additional formatting or explanation
    6. Keywords should accurately express the content theme, not too broad or specific
    7. If the note content includes professional terms or technical content, please ensure that the keywords include these terms

    Example output:
    machine learning, neural network, deep learning, TensorFlow, image recognition`,
    'BlinkoRelatedNotes',
  );

  static CommentAgent = AiModelFactory.#createAgentFactory(
    'Blinko Comment Agent',
    `You are Blinko Comment Assistant. Guidelines:
     1. Use Markdown formatting
     2. Include 1-2 relevant emojis
     3. Maintain professional tone
     4. Keep responses concise (50-150 words)
     5. Match user's language`,
    'BlinkoComment',
  );

  static SummarizeAgent = AiModelFactory.#createAgentFactory(
    'Blinko Summary Agent',
    `You are a conversation title summarizer. Rules:
      1. Summarize the content 
      2. Return the title only
      3. Generate titles based on the user's language
      4. Do not return any punctuation marks in the result
      5. Keep it short and concise`,
    'BlinkoSummary',
  );

  static WritingAgent = AiModelFactory.#createAgentFactory(
    'Blinko Writing Agent',
    (type) => {
      const prompts = {
        expand: `# Text Expansion Expert
          ## Original Content
          {content}

          ## Requirements
          1. Use same language as input
          2. Add details/examples without introducing new concepts
          3. Maintain original structure and style
          4. Use Markdown formatting
          5. Output format with markdown
          6. Do not add explanation`,

        polish: `# Text Refinement Specialist
          ## Input Text
          {content}

          ## Guidelines
          1. Optimize sentence flow and vocabulary
          2. Preserve core meaning
          3. Apply technical writing standards
          4. Use Markdown formatting
          5. Output format with markdown`,

        custom: `# Multi-Purpose Writing Assistant
            ## User Request
            {content}

            ## Requirements
            1. Create content as needed
            2. Follow industry-standard documentation
            3. Use Markdown formatting
            4. Output format with markdown`,
      };
      return prompts[type as 'expand' | 'polish' | 'custom'] || prompts['custom'];
    },
    'BlinkoWriting',
    { isWritingAgent: true },
  );

  static TestConnectAgent = AiModelFactory.#createAgentFactory('Blinko Test Connect Agent', `Test the api is working,return 1 words`, 'BlinkoTestConnect');

  static ImageEmbeddingAgent = AiModelFactory.#createAgentFactory(
    'Blinko Image Embedding Agent',
    `You are a vision assistant. When provided an image, you must:
1) Describe the image in detail (objects, scenes, layout, style, colors).
2) Extract and return all visible text in the image (OCR) accurately.
If the underlying model does not support image inputs, respond exactly with: not support image`,
    'BlinkoImageEmbedding',
  );

  static async readImage(
    imagePath: string,
    options?: { maxEdge?: number; quality?: number; toJPEG?: boolean; background?: string },
  ): Promise<{ dataUrl: string; mime: string }> {
    const { maxEdge = 1024, quality = 70, toJPEG = true, background = '#ffffff' } = options || {};
    try {
      let pipeline = sharp(imagePath).rotate();
      pipeline = pipeline.resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true });
      if (toJPEG) {
        // Remove alpha channel when converting to JPEG
        pipeline = pipeline.flatten({ background }).jpeg({ quality, mozjpeg: true });
      }
      const buffer = await pipeline.toBuffer();
      const mime = toJPEG ? 'image/jpeg' : path.extname(imagePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
      return { dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, mime };
    } catch (err) {
      // Fallback to original file if compression fails
      const fallbackMime = path.extname(imagePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
      return { dataUrl: `data:${fallbackMime};base64,${fs.readFileSync(imagePath, 'base64')}`, mime: fallbackMime };
    }
  }

  static async describeImage(imagePath: string): Promise<string> {
    try {
      const agent = await AiModelFactory.ImageEmbeddingAgent();
      console.log(imagePath, 'imagePath');
      const { dataUrl, mime } = await AiModelFactory.readImage(imagePath);
      const response = await agent.generate(
        [
          {
            role: 'user',
            content: [
              { type: 'image', image: dataUrl, mimeType: mime },
              {
                type: 'text',
                text: 'Describe the image in detail, and extract all the text in the image.',
              },
            ],
          },
        ],
        { temperature: 0.3 },
      );
      console.log(response.text?.trim(), 'response.text?.trim()');
      return response.text?.trim() || '';
    } catch (error) {
      console.log(error, 'error');
      // Fallback when model/provider does not support images or any error occurs
      return 'not support image';
    }
  }

  // static async GetAudioLoader(audioPath: string) {
  //   const globalConfig = await AiModelFactory.ValidConfig()
  //   if (globalConfig.aiModelProvider == 'OpenAI') {
  //     const provider = new OpenAIModelProvider({ globalConfig })
  //     return provider.AudioLoader(audioPath)
  //   } else {
  //     throw new Error('not support other loader')
  //   }
  // }
}
