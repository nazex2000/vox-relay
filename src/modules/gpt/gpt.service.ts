import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Configuration, OpenAIApi } from 'openai';

export interface ExtractedEmail {
    to: string;
    subject: string;
    body: string;
}

@Injectable()
export class GptService {
    private readonly logger = new Logger(GptService.name);
    private readonly openai: OpenAIApi;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY');
        const configuration = new Configuration({ apiKey });
        this.openai = new OpenAIApi(configuration);
    }

    async extractEmailFields(text: string): Promise<ExtractedEmail> {
        const prompt = `
            You are a helpful assistant that receives a transcribed voice message. 
            Your job is to extract an email draft from the following text.

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

        try {
            const response = await this.openai.createChatCompletion({
                model: 'gpt-4',
                messages: [{ role: 'user', content: prompt }],
            });

            const rawText = response.data.choices[0].message?.content ?? '';
            this.logger.log(`GPT Response: ${rawText}`);

            return JSON.parse(rawText);
        } catch (error) {
            this.logger.error('Failed to extract email fields:', error.message);
            throw new Error('Failed to extract email fields from text');
        }
    }
}