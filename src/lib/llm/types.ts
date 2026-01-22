export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export interface LLMGenerateInput {
  messages: ChatMessage[];
  temperature: number;
  maxOutputTokens: number;
}

export interface LLMGenerateOutput {
  text: string;
}
