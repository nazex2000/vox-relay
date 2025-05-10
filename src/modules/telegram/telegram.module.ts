import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { WhisperModule } from '../whisper/whisper.module';

@Module({
  imports: [WhisperModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}