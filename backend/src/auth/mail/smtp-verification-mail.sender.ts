import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

import type { AppEnvironment } from '../../config/environment.js';
import type { VerificationMailSender } from './verification-mail.sender.js';

@Injectable()
export class SmtpVerificationMailSender implements VerificationMailSender {
  private readonly transporter: Transporter;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(
    @Inject(ConfigService) config: ConfigService<AppEnvironment, true>,
  ) {
    this.fromAddress = config.getOrThrow('SMTP_FROM_ADDRESS');
    this.fromName = config.getOrThrow('SMTP_FROM_NAME');
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow('SMTP_HOST'),
      port: config.getOrThrow('SMTP_PORT'),
      secure: config.getOrThrow('SMTP_SECURE'),
      auth: {
        user: config.getOrThrow('SMTP_USERNAME'),
        pass: config.getOrThrow('SMTP_AUTH_CODE'),
      },
    });
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    await this.transporter.sendMail({
      from: {
        name: this.fromName,
        address: this.fromAddress,
      },
      to: email,
      subject: '【小蓝书】您的登录验证码',
      text: `您的小蓝书登录验证码是：${code}\n\n验证码在10分钟内有效。如非本人操作，请忽略此邮件。`,
      html: [
        '<p>您的小蓝书登录验证码是：</p>',
        `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>`,
        '<p>验证码在10分钟内有效。如非本人操作，请忽略此邮件。</p>',
      ].join(''),
    });
  }
}
