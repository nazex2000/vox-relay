import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { z } from 'zod';

// Types
export interface ExtractedEmail {
    to: string;
    subject: string;
    body: string;
}

export interface GptResponse<T> {
    data: T;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

// Validation schemas
const emailSchema = z.object({
    to: z.string().email('Invalid email address'),
    subject: z.string().min(1, 'Subject cannot be empty'),
    body: z.string().min(1, 'Body cannot be empty'),
});

const gptConfigSchema = z.object({
    model: z.string().default('gpt-4'),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().optional(),
});

@Injectable()
export class GptService {
    private readonly logger = new Logger(GptService.name);
    private readonly openai: OpenAI;
    private readonly defaultConfig: z.infer<typeof gptConfigSchema>;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY');
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is not defined in environment variables');
        }

        this.openai = new OpenAI({ apiKey });

        // Default configuration
        this.defaultConfig = {
            model: 'gpt-4',
            temperature: 0.7,
            maxTokens: 1000,
        };
    }

    /**
     * Extract email fields from transcribed text
     * @param text - The transcribed text to process
     * @param config - Optional configuration for GPT
     * @returns Extracted email fields with usage statistics
     */
    async extractEmailFields(
        text: string,
        config?: Partial<z.infer<typeof gptConfigSchema>>
    ): Promise<GptResponse<ExtractedEmail>> {
        if (!text?.trim()) {
            throw new BadRequestException('Text cannot be empty');
        }

        const mergedConfig = { ...this.defaultConfig, ...config };
        const validatedConfig = gptConfigSchema.parse(mergedConfig);

        const prompt = this.buildEmailExtractionPrompt(text);

        try {
            const response = await this.openai.chat.completions.create({
                model: validatedConfig.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: validatedConfig.temperature,
                max_tokens: validatedConfig.maxTokens,
            });

            const rawText = response.choices[0]?.message?.content;

            if (!rawText) {
                throw new Error('No response from GPT');
            }

            console.log("======================= VOX RELAY - Copywrite =========================");
            console.log("GPT Response");
            console.log(rawText);
            console.log("================================================");

            // Parse and validate the response
            const parsedResponse = JSON.parse(rawText);
            const validatedEmail = emailSchema.parse(parsedResponse);

            return {
                data: validatedEmail,
                usage: {
                    promptTokens: response.usage?.prompt_tokens ?? 0,
                    completionTokens: response.usage?.completion_tokens ?? 0,
                    totalTokens: response.usage?.total_tokens ?? 0,
                },
            };
        } catch (error) {
            this.logger.error('Failed to extract email fields:', {
                error: error.message,
                stack: error.stack,
            });

            if (error instanceof z.ZodError) {
                throw new BadRequestException('Invalid response format from GPT');
            }

            if (error instanceof SyntaxError) {
                throw new BadRequestException('Invalid JSON response from GPT');
            }

            throw new Error(`Failed to extract email fields: ${error.message}`);
        }
    }

    /**
     * Build the prompt for email extraction
     * @param text - The transcribed text
     * @returns Formatted prompt string
     */
    private buildEmailExtractionPrompt(text: string): string {
        return `
            You are a helpful assistant that receives a transcribed voice message. 
            Your job is to extract an email draft from the following text.

            Guidelines:
            1. Extract a valid email address for the "to" field
            2. Create a concise and relevant subject line
            3. Format the body text appropriately with paragraphs
            4. Remove any filler words or hesitations from the transcription

            Return the output in this exact JSON format:
            {
                "to": "example@example.com",
                "subject": "Email subject here",
                "body": "Full email message here"
            }

            Transcribed text:
            """
            ${text}
            """`;
    }

    /**
     * Get the current configuration
     * @returns Current GPT configuration
     */
    getConfig(): z.infer<typeof gptConfigSchema> {
        return { ...this.defaultConfig };
    }
}