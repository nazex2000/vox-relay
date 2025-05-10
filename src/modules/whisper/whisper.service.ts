import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import { createReadStream } from 'fs';
import axios, { AxiosError } from 'axios';
import * as FormData from 'form-data';

/**
 * Options for audio transcription.
 * 
 * @interface TranscriptionOptions
 */
interface TranscriptionOptions {
  /** Language code for transcription (e.g., 'en', 'pt') */
  language?: string;
  /** Format of the transcription response */
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
  /** Temperature for transcription (0-1) */
  temperature?: number;
  /** Optional prompt to guide transcription */
  prompt?: string;
}

/**
 * Service responsible for audio transcription using OpenAI's Whisper API.
 * Handles audio file validation, conversion, and transcription.
 * 
 * @class WhisperService
 */
@Injectable()
export class WhisperService {
  private readonly logger = new Logger(WhisperService.name);
  private readonly tmpDir: string;
  private readonly supportedFormats = ['.ogg', '.mp3', '.wav', '.m4a', '.webm'];
  private readonly maxFileSize = 25 * 1024 * 1024; // 25MB (Whisper API limit)

  /**
   * Creates an instance of WhisperService.
   * 
   * @param {ConfigService} configService - Service for accessing configuration values
   */
  constructor(private configService: ConfigService) {
    this.tmpDir = path.resolve(__dirname, '../../../tmp');
    this.ensureTmpDirectory();
    this.configureFFmpeg();
  }

  /**
   * Configures FFmpeg path for macOS systems.
   * Sets the FFmpeg path if found in the default location.
   * 
   * @private
   */
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

  /**
   * Ensures the temporary directory exists for storing audio files.
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
   * Transcribes an audio file to text using OpenAI's Whisper API.
   * 
   * @param {string} audioPath - Path to the audio file
   * @param {TranscriptionOptions} options - Optional transcription parameters
   * @returns {Promise<string>} The transcribed text
   * @throws {BadRequestException} If the audio file is invalid
   * @throws {Error} If transcription fails
   */
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

  /**
   * Validates an audio file for transcription.
   * Checks file existence, size, and format.
   * 
   * @param {string} filePath - Path to the audio file
   * @throws {BadRequestException} If validation fails
   * @private
   */
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

  /**
   * Generates a unique path for the MP3 file in the temporary directory.
   * 
   * @param {string} originalPath - Original audio file path
   * @returns {string} Path for the MP3 file
   * @private
   */
  private getMp3Path(originalPath: string): string {
    const fileName = path.basename(originalPath, path.extname(originalPath));
    return path.join(this.tmpDir, `${fileName}_${Date.now()}.mp3`);
  }

  /**
   * Converts an audio file to MP3 format using FFmpeg.
   * 
   * @param {string} input - Path to the input audio file
   * @param {string} output - Path for the output MP3 file
   * @returns {Promise<void>}
   * @throws {Error} If conversion fails
   * @private
   */
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

  /**
   * Sends an audio file to OpenAI's Whisper API for transcription.
   * 
   * @param {string} mp3Path - Path to the MP3 file
   * @param {TranscriptionOptions} options - Transcription options
   * @returns {Promise<string>} The transcribed text
   * @throws {Error} If API request fails
   * @private
   */
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
      console.log("======================= VOX RELAY - Whisper =========================");
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
