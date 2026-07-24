export interface VerificationMailSender {
  sendVerificationCode(email: string, code: string): Promise<void>;
}
