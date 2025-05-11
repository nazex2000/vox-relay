import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { ExtractedEmail } from '../gpt/gpt.service';
import { z } from 'zod';

/**
 * Email sending options with additional configuration.
 * 
 * @interface EmailOptions
 */
interface EmailOptions {
  /** Whether to send as HTML instead of plain text */
  html?: boolean;
  /** CC recipients */
  cc?: string[];
  /** BCC recipients */
  bcc?: string[];
  /** Email attachments */
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

/**
 * Service responsible for handling email operations.
 * Provides functionality for sending emails with various options and formats.
 * 
 * @class EmailService
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly defaultFrom: string;

  // Validation schemas
  private readonly emailSchema = z.object({
    to: z.string().email('Invalid email address'),
    subject: z.string().min(1, 'Subject cannot be empty'),
    body: z.string().min(1, 'Body cannot be empty'),
  });

  private readonly emailOptionsSchema = z.object({
    html: z.boolean().optional(),
    cc: z.array(z.string().email('Invalid CC email address')).optional(),
    bcc: z.array(z.string().email('Invalid BCC email address')).optional(),
    attachments: z.array(z.object({
      filename: z.string(),
      content: z.union([z.instanceof(Buffer), z.string()]),
      contentType: z.string().optional(),
    })).optional(),
  });

  /**
   * Creates an instance of EmailService.
   * 
   * @param {ConfigService} configService - Service for accessing configuration values
   * @throws {Error} If required SMTP configuration is missing
   */
  constructor(private configService: ConfigService) {
    const smtpConfig = this.validateSmtpConfig();
    this.defaultFrom = smtpConfig.user;

    this.transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
    });

    // Verify SMTP connection
    this.verifyConnection();
  }

  /**
   * Validates SMTP configuration from environment variables.
   * 
   * @returns {Object} Validated SMTP configuration
   * @throws {Error} If required configuration is missing
   * @private
   */
  private validateSmtpConfig() {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const secure = this.configService.get<boolean>('SMTP_SECURE', false);

    if (!host || !port || !user || !pass) {
      throw new Error('Missing required SMTP configuration');
    }

    return { host, port, user, pass, secure };
  }

  /**
   * Verifies SMTP connection on service initialization.
   * 
   * @private
   */
  private async verifyConnection() {
    try {
      await this.transporter.verify();
      this.logger.log('✅ SMTP connection verified successfully');
    } catch (error) {
      this.logger.error('❌ Failed to verify SMTP connection:', error.message);
      throw new Error('SMTP connection verification failed');
    }
  }

  /**
   * Sends an email using the provided email data and options.
   * 
   * @param {ExtractedEmail} email - Email data to send
   * @param {EmailOptions} options - Additional email options
   * @returns {Promise<string>} Message ID of the sent email
   * @throws {BadRequestException} If email data is invalid
   * @throws {Error} If email sending fails
   */
  async sendEmail(email: ExtractedEmail, options: EmailOptions = {}): Promise<string> {
    try {
      // Validate email data
      const validatedEmail = this.emailSchema.parse(email);
      const validatedOptions = this.emailOptionsSchema.parse(options);

      const mailOptions: nodemailer.SendMailOptions = {
        from: this.defaultFrom,
        to: validatedEmail.to,
        subject: validatedEmail.subject,
        ...(validatedOptions.html ? { html: validatedEmail.body } : { text: validatedEmail.body }),
        ...(validatedOptions.cc && { cc: validatedOptions.cc }),
        ...(validatedOptions.bcc && { bcc: validatedOptions.bcc }),
        ...(validatedOptions.attachments && { attachments: validatedOptions.attachments }),
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`📧 Email sent successfully to ${validatedEmail.to} (${info.messageId})`);
      
      return info.messageId;
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.logger.error('Invalid email data:', error.errors);
        throw new BadRequestException('Invalid email data: ' + error.errors.map(e => e.message).join(', '));
      }

      this.logger.error(`❌ Failed to send email: ${error.message}`);
      throw new Error('Email sending failed: ' + error.message);
    }
  }

  /**
   * Sends an HTML email.
   * 
   * @param {ExtractedEmail} email - Email data to send
   * @param {Omit<EmailOptions, 'html'>} options - Additional email options
   * @returns {Promise<string>} Message ID of the sent email
   */
  async sendHtmlEmail(email: ExtractedEmail, options: Omit<EmailOptions, 'html'> = {}): Promise<string> {
    return this.sendEmail(email, { ...options, html: true });
  }

  /**
   * Sends an email with attachments.
   * 
   * @param {ExtractedEmail} email - Email data to send
   * @param {Buffer[]} attachments - Array of file buffers to attach
   * @param {string[]} filenames - Array of filenames for the attachments
   * @param {Omit<EmailOptions, 'attachments'>} options - Additional email options
   * @returns {Promise<string>} Message ID of the sent email
   */
  async sendEmailWithAttachments(
    email: ExtractedEmail,
    attachments: Buffer[],
    filenames: string[],
    options: Omit<EmailOptions, 'attachments'> = {},
  ): Promise<string> {
    if (attachments.length !== filenames.length) {
      throw new BadRequestException('Number of attachments must match number of filenames');
    }

    const emailAttachments = attachments.map((content, index) => ({
      filename: filenames[index],
      content,
    }));

    return this.sendEmail(email, { ...options, attachments: emailAttachments });
  }

  /**
   * Gets the current SMTP configuration (without sensitive data).
   * 
   * @returns {Object} Current SMTP configuration
   */
  getConfig() {
    const config = this.validateSmtpConfig();
    return {
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user,
    };
  }
}
