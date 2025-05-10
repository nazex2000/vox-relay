import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { ExtractedEmail } from '../gpt/gpt.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT'),
      secure: false,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendEmail(email: ExtractedEmail): Promise<void> {
    try {
      const mailOptions = {
        from: this.configService.get<string>('SMTP_USER'),
        to: email.to,
        subject: email.subject,
        text: email.body,
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`📧 Email sent to ${email.to}: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send email to ${email.to}: ${error.message}`);
      throw new Error('Email sending failed');
    }
  }
}
