import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramModule } from './modules/telegram/telegram.module';
import { WhisperModule } from './modules/whisper/whisper.module';
import * as Joi from 'joi';

const logger = new Logger('AppModule');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        // Telegram
        TELEGRAM_BOT_TOKEN: Joi.string().required(),
        
        // OpenAI
        OPENAI_API_KEY: Joi.string().required(),
        
        // Application
        NODE_ENV: Joi.string()
          .valid('development', 'production')
          .default('development'),
        PORT: Joi.number().default(3000),
      }),
    }),
    TelegramModule,
    WhisperModule,
  ],
})
export class AppModule {
  constructor() {
    logger.log('🤖 Voice Transcription Bot initialized');
  }
}
