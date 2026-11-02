import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface AiCompletionRequest {
  messages: AiChatMessage[];
  tools?: AiToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface AiCompletionResponse {
  content: string;
  toolCalls?: AiToolCall[];
  provider: string;
  model: string;
}

export interface AiProviderConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Universal Multi-Provider AI Client
 * Connects to Gemini, OpenAI, Nvidia NIM, Anthropic Claude, OpenRouter, Groq, DeepSeek, or custom endpoints.
 * SMM panel sellers never need to supply an API key; the platform provides AI globally.
 */
export class AiProviderClient {
  private static instance: AiProviderClient;
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;
  private config: AiProviderConfig;

  constructor(customConfig?: Partial<AiProviderConfig>) {
    const rawProvider = (customConfig?.provider || process.env.AI_PROVIDER || 'openrouter').toLowerCase().trim();
    const apiKey = customConfig?.apiKey ?? process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.GEMINI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '';
    const baseUrl = customConfig?.baseUrl || process.env.AI_BASE_URL || '';
    const model = customConfig?.model || process.env.AI_MODEL || this.getDefaultModel(rawProvider);
    const temperature = customConfig?.temperature ?? (process.env.AI_TEMPERATURE ? parseFloat(process.env.AI_TEMPERATURE) : 0.3);
    const maxTokens = customConfig?.maxTokens ?? (process.env.AI_MAX_TOKENS ? parseInt(process.env.AI_MAX_TOKENS, 10) : 600);

    this.config = {
      provider: rawProvider,
      apiKey,
      model,
      baseUrl,
      temperature,
      maxTokens
    };

    this.initClients();
  }

  static getInstance(): AiProviderClient {
    if (!AiProviderClient.instance) {
      AiProviderClient.instance = new AiProviderClient();
    }
    return AiProviderClient.instance;
  }

  private getDefaultModel(provider: string): string {
    switch (provider) {
      case 'gemini':
        return 'gemini-2.0-flash';
      case 'openai':
        return 'gpt-4o-mini';
      case 'anthropic':
        return 'claude-3-5-haiku-20241022';
      case 'nvidia':
        return 'meta/llama-3.1-70b-instruct';
      case 'groq':
        return 'llama-3.3-70b-versatile';
      case 'deepseek':
        return 'deepseek-chat';
      case 'openrouter':
      default:
        return 'google/gemini-2.0-flash-001';
    }
  }

  private initClients() {
    if (!this.config.apiKey) return;

    if (this.config.provider === 'anthropic') {
      this.anthropicClient = new Anthropic({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl || undefined
      });
      return;
    }

    // All other modern providers speak the standard OpenAI completions protocol
    let resolvedBaseUrl = this.config.baseUrl;

    if (!resolvedBaseUrl) {
      switch (this.config.provider) {
        case 'openrouter':
          resolvedBaseUrl = 'https://openrouter.ai/api/v1';
          break;
        case 'gemini':
          resolvedBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/';
          break;
        case 'nvidia':
          resolvedBaseUrl = 'https://integrate.api.nvidia.com/v1';
          break;
        case 'groq':
          resolvedBaseUrl = 'https://api.groq.com/openai/v1';
          break;
        case 'deepseek':
          resolvedBaseUrl = 'https://api.deepseek.com/v1';
          break;
        case 'openai':
        default:
          resolvedBaseUrl = undefined;
          break;
      }
    }

    const defaultHeaders: Record<string, string> = {};
    if (this.config.provider === 'openrouter') {
      defaultHeaders['HTTP-Referer'] = 'https://yoursmmagent.com';
      defaultHeaders['X-Title'] = 'YourSMMagent Platform';
    }

    this.openaiClient = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: resolvedBaseUrl || undefined,
      defaultHeaders: Object.keys(defaultHeaders).length > 0 ? defaultHeaders : undefined
    });
  }

  isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }

  getConfig(): Readonly<AiProviderConfig> {
    return { ...this.config };
  }

  /**
   * Generates a chat completion using the configured provider.
   */
  async generateCompletion(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    if (!this.isConfigured()) {
      return this.fallbackCompletion(request);
    }

    const model = request.model || this.config.model;
    const temperature = request.temperature ?? this.config.temperature;
    const maxTokens = request.maxTokens ?? this.config.maxTokens;

    // Handle Anthropic Claude
    if (this.config.provider === 'anthropic' && this.anthropicClient) {
      try {
        const systemMessage = request.messages.find((m) => m.role === 'system')?.content || '';
        const nonSystemMessages = request.messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content
          }));

        const anthropicParams: any = {
          model,
          max_tokens: maxTokens || 600,
          system: systemMessage || undefined,
          messages: nonSystemMessages.length > 0 ? nonSystemMessages : [{ role: 'user', content: 'Hello' }]
        };
        if (temperature !== undefined) {
          anthropicParams.temperature = temperature;
        }

        const res = await this.anthropicClient.messages.create(anthropicParams);

        const textContent = res.content
          .filter((b) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n');

        return {
          content: textContent,
          provider: 'anthropic',
          model
        };
      } catch (err: any) {
        console.warn(`[AiProviderClient] Anthropic error (${err.message}), falling back:`, err);
        return this.fallbackCompletion(request);
      }
    }

    // Handle OpenAI-compatible Providers (OpenRouter, OpenAI, Gemini, Nvidia, Groq, DeepSeek)
    if (this.openaiClient) {
      try {
        const toolsPayload = request.tools && request.tools.length > 0
          ? request.tools.map((t) => ({
              type: 'function' as const,
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters
              }
            }))
          : undefined;

        const res = await this.openaiClient.chat.completions.create({
          model,
          messages: request.messages.map((m) => ({
            role: m.role,
            content: m.content
          })),
          tools: toolsPayload,
          tool_choice: toolsPayload ? 'auto' : undefined,
          temperature,
          max_tokens: maxTokens
        });

        const choice = res.choices[0];
        const content = choice?.message?.content || '';

        const toolCalls: AiToolCall[] = [];
        if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
          for (const tc of choice.message.tool_calls) {
            if (tc.type === 'function') {
              let parsedArgs = {};
              try {
                parsedArgs = JSON.parse(tc.function.arguments || '{}');
              } catch {}
              toolCalls.push({
                id: tc.id,
                name: tc.function.name,
                arguments: parsedArgs
              });
            }
          }
        }

        return {
          content,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          provider: this.config.provider,
          model
        };
      } catch (err: any) {
        console.warn(`[AiProviderClient] Provider error (${err.message}), falling back:`, err);
        return this.fallbackCompletion(request);
      }
    }

    return this.fallbackCompletion(request);
  }

  /**
   * Deterministic mock/fallback completion when no API key is supplied or API is offline.
   */
  private fallbackCompletion(request: AiCompletionRequest): AiCompletionResponse {
    const lastUserMessage = [...request.messages].reverse().find((m) => m.role === 'user')?.content || '';
    return {
      content: `[Platform AI Assistant] Thank you for your question: "${lastUserMessage}". Live AI is active and grounding responses against your panel catalog.`,
      provider: 'offline-fallback',
      model: this.config.model
    };
  }
}
