import { Module } from '@nestjs/common';
import { WhisperService } from './whisper.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [WhisperService],
  exports: [WhisperService],
})
export class WhisperModule {}