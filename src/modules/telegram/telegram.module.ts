import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { WhisperModule } from '../whisper/whisper.module';
import { GptModule } from '../gpt/gpt.module';
import { EmailModule } from '../email/email.module';

/**
 * Module responsible for Telegram bot functionality.
 * Integrates voice message processing, transcription, and email extraction capabilities.
 * 
 * @class TelegramModule
 */
@Module({
  imports: [
    ConfigModule,
    WhisperModule,
    GptModule,
    EmailModule
  ],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}