import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { WhisperService } from '../whisper/whisper.service';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly bot: Telegraf;
  private readonly logger = new Logger(TelegramService.name);
  private readonly tmpDir: string;

  constructor(
    private configService: ConfigService,
    private whisperService: WhisperService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined');
    }
    this.bot = new Telegraf(token);
    this.tmpDir = path.resolve(__dirname, '../../../tmp');
    this.ensureTmpDirectory();
  }

  private ensureTmpDirectory(): void {
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }
  }

  onModuleInit() {
    this.setupBotHandlers();
    this.bot.launch()
      .then(() => this.logger.log('🤖 Telegram bot successfully launched'))
      .catch((error) => this.logger.error('Failed to launch bot:', error));

    // Enable graceful stop
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }

  private setupBotHandlers(): void {
    this.bot.start((ctx) => {
      ctx.reply(
        '👋 Welcome! I can transcribe your voice messages to text.\n\n' +
        'Just send me a voice message and I\'ll convert it to text for you.\n\n' +
        'Use /help to see available commands.'
      );
    });

    this.bot.help((ctx) => {
      ctx.reply(
        '🎯 Available commands:\n\n' +
        '/start - Start the bot\n' +
        '/help - Show this help message\n\n' +
        'Just send a voice message to get it transcribed!'
      );
    });

    this.bot.on('voice', async (ctx) => {
      try {
        await this.handleVoiceMessage(ctx);
      } catch (error) {
        this.logger.error('Error processing voice message:', error);
        await ctx.reply('❌ Sorry, I encountered an error while processing your voice message. Please try again later.');
      }
    });

    // Handle bot errors
    this.bot.catch((err: Error, ctx) => {
      this.logger.error(`Bot error: ${err.message}`);
      ctx.reply('❌ An error occurred. Please try again later.');
    });
  }

  private async handleVoiceMessage(ctx: Context & { message: Message.VoiceMessage }): Promise<void> {
    const fileId = ctx.message.voice.file_id;
    const fileUrl = await this.getFileUrl(fileId);
    const filePath = path.join(this.tmpDir, `${fileId}.ogg`);

    try {
      // Send initial response
      await ctx.reply('⏳ Processing your voice message...');

      // Download the voice message
      await this.downloadFile(fileUrl, filePath);
      this.logger.log(`Voice message downloaded successfully: ${filePath}`);

      // Transcribe the voice message
      const transcription = await this.whisperService.transcribe(filePath, {
        language: 'en', // Default to English
        responseFormat: 'text',
      });

      // Send the transcription
      await ctx.reply(
        '✅ Here\'s your transcription:\n\n' +
        transcription
      );

    } catch (error) {
      this.logger.error(`Failed to process voice message: ${error.message}`);
      await ctx.reply('❌ Failed to process your voice message. Please try again.');
      throw error;
    } finally {
      // Cleanup: Remove the temporary file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  private async getFileUrl(fileId: string): Promise<string> {
    try {
      const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
      const resp = await axios.get(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
      
      if (!resp.data?.result?.file_path) {
        throw new Error('Invalid response from Telegram API');
      }

      return `https://api.telegram.org/file/bot${token}/${resp.data.result.file_path}`;
    } catch (error) {
      this.logger.error(`Failed to get file URL: ${error.message}`);
      throw new Error('Failed to retrieve voice message from Telegram');
    }
  }

  private async downloadFile(url: string, destination: string): Promise<void> {
    const writer = fs.createWriteStream(destination);
    
    try {
      const response = await axios.get(url, { 
        responseType: 'stream',
        timeout: 30000 // 30 seconds timeout
      });
      
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          this.logger.log(`File downloaded successfully to ${destination}`);
          resolve();
        });
        writer.on('error', (error) => {
          this.logger.error(`Error writing file: ${error.message}`);
          reject(error);
        });
      });
    } catch (error) {
      this.logger.error(`Download failed: ${error.message}`);
      throw new Error('Failed to download voice message');
    }
  }
}
