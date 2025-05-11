import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { WhisperService } from '../whisper/whisper.service';
import { GptService } from '../gpt/gpt.service';
import { EmailService } from '../email/email.service';

/**
 * Service responsible for handling Telegram bot operations.
 * This service manages voice message processing, transcription, and email information extraction.
 * 
 * @class TelegramService
 * @implements {OnModuleInit}
 */
@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly bot: Telegraf;
  private readonly logger = new Logger(TelegramService.name);
  private readonly tmpDir: string;

  /**
   * Creates an instance of TelegramService.
   * 
   * @param {ConfigService} configService - Service for accessing configuration values
   * @param {WhisperService} whisperService - Service for voice message transcription
   * @param {GptService} gptService - Service for email information extraction
   * @param {EmailService} emailService - Service for sending emails
   * @throws {Error} If TELEGRAM_BOT_TOKEN is not defined in environment variables
   */
  constructor(
    private configService: ConfigService,
    private whisperService: WhisperService,
    private gptService: GptService,
    private emailService: EmailService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined');
    }
    this.bot = new Telegraf(token);
    this.tmpDir = path.resolve(__dirname, '../../../tmp');
    this.ensureTmpDirectory();
  }

  /**
   * Ensures the temporary directory exists for storing voice messages.
   * Creates the directory if it doesn't exist.
   * 
   * @private
   */
  private ensureTmpDirectory(): void {
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }
  }

  /**
   * Lifecycle hook that is called once the module has been initialized.
   * Sets up bot handlers and launches the bot.
   * 
   * @public
   */
  onModuleInit() {
    this.setupBotHandlers();
    this.bot.launch()
      .then(() => this.logger.log('🤖 Telegram bot successfully launched'))
      .catch((error) => this.logger.error('Failed to launch bot:', error));

    // Enable graceful stop
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }

  /**
   * Sets up all bot command and message handlers.
   * Configures start, help commands and voice message handling.
   * 
   * @private
   */
  private setupBotHandlers(): void {
    this.bot.start((ctx) => {
      ctx.reply(
        '👋 Welcome! I can help you with voice messages.\n\n' +
        '🎯 What I can do:\n' +
        '1. Transcribe voice messages to text\n' +
        '2. Extract email information from your voice\n' +
        '3. Send emails directly from voice messages\n\n' +
        'Just send me a voice message and I\'ll process it for you!\n\n' +
        'Use /help to see available commands.'
      );
    });

    this.bot.help((ctx) => {
      ctx.reply(
        '🎯 Available commands:\n\n' +
        '/start - Start the bot\n' +
        '/help - Show this help message\n\n' +
        '📝 How to use:\n' +
        '1. Send a voice message\n' +
        '2. I\'ll transcribe it\n' +
        '3. If it contains email information, I\'ll extract it\n' +
        '4. You can choose to send the email directly\n\n' +
        '💡 Tip: Speak clearly and mention the email details you want to include!'
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

  /**
   * Handles incoming voice messages.
   * Downloads, transcribes, and extracts email information from the voice message.
   * 
   * @param {Context & { message: Message.VoiceMessage }} ctx - Telegram context with voice message
   * @throws {Error} If voice message processing fails
   * @private
   */
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
        language: 'en',
        responseFormat: 'text',
      });

      // Send the transcription
      await ctx.reply(
        '✅ Here\'s your transcription:\n\n' +
        transcription
      );

      // Try to extract email information
      try {
        const emailInfo = await this.gptService.extractEmailFields(transcription);
        
        // Format the email information nicely
        const emailMessage = 
          '📧 I found email information in your message:\n\n' +
          `📨 To: ${emailInfo.data.to}\n` +
          `📝 Subject: ${emailInfo.data.subject}\n\n` +
          `📄 Body:\n${emailInfo.data.body}\n\n` +
          'Would you like to send this email? Reply with "yes" to send or "no" to cancel.';

        await ctx.reply(emailMessage);

        // Create a one-time message handler
        const messageHandler = this.bot.on('message', async (ctx) => {
          if (ctx.message && 'text' in ctx.message) {
            const text = ctx.message.text.toLowerCase();
            
            if (text === 'yes') {
              try {
                // Send the email
                const messageId = await this.emailService.sendEmail(emailInfo.data);
                await ctx.reply('✅ Email sent successfully!');
                this.logger.log(`Email sent with ID: ${messageId}`);
              } catch (error) {
                this.logger.error('Failed to send email:', error);
                await ctx.reply('❌ Failed to send email. Please try again later.');
              }
            } else if (text === 'no') {
              await ctx.reply('❌ Email cancelled.');
            } else {
              await ctx.reply('Please reply with "yes" to send the email or "no" to cancel.');
              return; // Keep listening
            }
          }
        });

      } catch (emailError) {
        this.logger.debug('No email information found in the message');
        await ctx.reply('No email information found in the message');
      }

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

  /**
   * Retrieves the download URL for a Telegram file.
   * 
   * @param {string} fileId - Telegram file ID
   * @returns {Promise<string>} The download URL for the file
   * @throws {Error} If file URL retrieval fails
   * @private
   */
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

  /**
   * Downloads a file from a URL to a specified destination.
   * 
   * @param {string} url - The URL to download from
   * @param {string} destination - The local path to save the file
   * @returns {Promise<void>}
   * @throws {Error} If file download fails
   * @private
   */
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
