import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import { createReadStream } from 'fs';
import axios, { AxiosError } from 'axios';
import * as FormData from 'form-data';

interface TranscriptionOptions {
  language?: string;
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
  temperature?: number;
  prompt?: string;
}

@Injectable()
export class WhisperService {
  private readonly logger = new Logger(WhisperService.name);
  private readonly tmpDir: string;
  private readonly supportedFormats = ['.ogg', '.mp3', '.wav', '.m4a', '.webm'];
  private readonly maxFileSize = 25 * 1024 * 1024; // 25MB (Whisper API limit)

  constructor(private configService: ConfigService) {
    this.tmpDir = path.resolve(__dirname, '../../../tmp');
    this.ensureTmpDirectory();
    this.configureFFmpeg();
  }

  private configureFFmpeg() {
    // Set FFmpeg path for macOS
    const ffmpegPath = '/opt/homebrew/bin/ffmpeg';
    if (fs.existsSync(ffmpegPath)) {
      ffmpeg.setFfmpegPath(ffmpegPath);
      this.logger.log('FFmpeg configured successfully');
    } else {
      this.logger.warn('FFmpeg not found in default path, using system PATH');
    }
  }

  private ensureTmpDirectory(): void {
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }
  }

  async transcribe(
    audioPath: string,
    options: TranscriptionOptions = {},
  ): Promise<string> {
    try {
      await this.validateAudioFile(audioPath);
      
      const fileExtension = path.extname(audioPath).toLowerCase();
      const mp3Path = this.getMp3Path(audioPath);

      if (fileExtension !== '.mp3') {
        await this.convertToMp3(audioPath, mp3Path);
      } else {
        // If it's already MP3, just copy it to the temp directory
        fs.copyFileSync(audioPath, mp3Path);
      }

      const transcription = await this.sendToWhisper(mp3Path, options);
      
      // Cleanup
      if (fs.existsSync(mp3Path)) {
        fs.unlinkSync(mp3Path);
      }

      return transcription;
    } catch (error) {
      this.logger.error(`Transcription failed: ${error.message}`);
      throw error;
    }
  }

  private async validateAudioFile(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      throw new BadRequestException('Audio file not found');
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      throw new BadRequestException('Audio file is empty');
    }

    if (stats.size > this.maxFileSize) {
      throw new BadRequestException(`Audio file is too large. Maximum size is ${this.maxFileSize / 1024 / 1024}MB`);
    }

    const extension = path.extname(filePath).toLowerCase();
    if (!this.supportedFormats.includes(extension)) {
      throw new BadRequestException(
        `Unsupported file format. Supported formats are: ${this.supportedFormats.join(', ')}`,
      );
    }
  }

  private getMp3Path(originalPath: string): string {
    const fileName = path.basename(originalPath, path.extname(originalPath));
    return path.join(this.tmpDir, `${fileName}_${Date.now()}.mp3`);
  }

  private convertToMp3(input: string, output: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(input)
        .toFormat('mp3')
        .audioBitrate('128k')
        .audioChannels(1)
        .audioFrequency(16000)
        .on('start', (commandLine) => {
          this.logger.debug(`FFmpeg started with command: ${commandLine}`);
        })
        .on('progress', (progress) => {
          this.logger.debug(`FFmpeg progress: ${JSON.stringify(progress)}`);
        })
        .on('error', (err) => {
          this.logger.error('FFmpeg error:', err.message);
          reject(new Error(`Failed to convert audio: ${err.message}`));
        })
        .on('end', () => {
          this.logger.log(`Converted ${input} to ${output}`);
          resolve();
        })
        .save(output);
    });
  }

  private async sendToWhisper(
    mp3Path: string,
    options: TranscriptionOptions = {},
  ): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const form = new FormData();
    form.append('file', createReadStream(mp3Path));
    form.append('model', 'whisper-1');

    // Add optional parameters if provided
    if (options.language) form.append('language', options.language);
    if (options.responseFormat) form.append('response_format', options.responseFormat);
    if (options.temperature) form.append('temperature', options.temperature.toString());
    if (options.prompt) form.append('prompt', options.prompt);

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        form,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            ...form.getHeaders(),
          },
          timeout: 30000, // 30 seconds timeout
        },
      );

      //Return to console the response
      console.log("======================= VOX RELAY =========================");
      console.log("Transcription Response");
      console.log(response.data);
      console.log("================================================");

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 401) {
          throw new Error('Invalid OpenAI API key');
        } else if (error.response?.status === 429) {
          throw new Error('OpenAI API rate limit exceeded');
        } else if (error.code === 'ECONNABORTED') {
          throw new Error('OpenAI API request timed out');
        }
      }
      this.logger.error(`Whisper API failed: ${error.message}`);
      throw new Error('Failed to transcribe audio with Whisper');
    }
  }
}
