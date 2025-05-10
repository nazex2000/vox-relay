import { Module } from '@nestjs/common';
import { GptService } from './gpt.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [GptService],
  exports: [GptService],
})
export class GptModule {}