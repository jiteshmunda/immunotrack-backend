import * as ses from "@aws-sdk/client-ses";
import { ENV } from "../config/env";

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  textBody?: string;
  isHtml?: boolean;
}

/**
 * HIPAA-Compliant Email Service
 * Uses AWS SES (Simple Email Service) SDK directly for maximum reliability.
 */
export class EmailService {
  private sesClient: ses.SESClient;

  constructor() {
    // Initialize AWS SES Client
    this.sesClient = new ses.SESClient({
      region: ENV.AWS_REGION,
      credentials: {
        accessKeyId: ENV.AWS_ACCESS_KEY_ID,
        secretAccessKey: ENV.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  async sendEmail({ to, subject, body, textBody, isHtml = true }: SendEmailParams): Promise<void> {
    try {
      const command = new ses.SendEmailCommand({
        Source: `ImmunoTrack AI <${ENV.SES_FROM_EMAIL}>`,
        Destination: {
          ToAddresses: [to],
        },
        ReplyToAddresses: ["support@immunotrack.ai"],
        Message: {
          Subject: {
            Data: subject,
            Charset: "UTF-8",
          },
          Body: {
            Html: {
              Data: body,
              Charset: "UTF-8",
            },
            Text: {
              Data: textBody || body.replace(/<[^>]*>/g, ""), // strip tags as plain-text fallback
              Charset: "UTF-8",
            },
          },
        },
      });

      const response = await this.sesClient.send(command);
      console.log(`[EmailService] Email sent to ${to} via AWS SES. MessageId: ${response.MessageId}`);
    } catch (error: any) {
      console.error("AWS SES Direct Delivery Error:", error.message);
      // In production, we re-throw to trigger a retry if using a queue
      if (ENV.NODE_ENV === "production") {
        throw new Error("FAILED_TO_SEND_EMAIL");
      }
    }
  }

  async sendLoginMfaEmail(to: string, otp: string, firstName: string): Promise<void> {
    const subject = "Your ImmunoTrack Login Code";
    const body = this.getOtpTemplate(
      otp,
      "ImmunoTrack Login Verification",
      `Hi ${firstName},<br><br>You are attempting to log in. Please use the following 6-character code to complete your login:`,
      "This code will expire in 10 minutes. If you did not attempt to log in, please secure your account immediately."
    );
    await this.sendEmail({ to, subject, body });
  }

  async sendClinicianWelcomeEmail(to: string, name: string, tempPassword: string): Promise<void> {
    const subject = "Welcome to ImmunoTrack - Your Temporary Password";
    const body = this.getOtpTemplate(
      tempPassword,
      "Welcome to ImmunoTrack",
      `Hi ${name},<br><br>An administrator has created an account for you. Please use the following temporary password to log in for the first time. You will be prompted to change it immediately after logging in.`,
      "If you received this in error, please contact your clinic administrator.",
      true
    );
    await this.sendEmail({ to, subject, body });
  }

  /**
   * Generates a HIPAA-compliant invitation email template matching exact specification requirements
   */
  getInviteTemplate(
    patientFirstName: string,
    clinicianName: string,
    clinicName: string,
    displayCode: string,
    rawCode: string,
    expiryTimestamp: string,
    personalMessage?: string
  ): string {
    const clinicianIntro = `Your doctor, ${clinicianName} at ${clinicName}, has invited you to join ImmunoTrack — an AI-powered allergy and asthma monitoring platform designed to help track your symptoms between appointments.`;

    const messageBlock = personalMessage
      ? `
        <!-- Styled blockquote for personal message -->
        <div style="border-left: 3px solid #7FE3C5; background-color: #E8F8F2; padding: 15px 20px; margin: 25px 0;">
          <p style="margin: 0; font-style: italic; color: #333333; font-size: 13px; line-height: 1.6;">${personalMessage}</p>
        </div>`
      : "";

    const deepLink = `https://dev-api.immunotrack.ai/invite?code=${rawCode}`;
    // const deepLink = `https://immunotrack.ai/invite?code=${displayCode}`;

    // Format exact expiration date and time
    const expiryDate = new Date(expiryTimestamp);
    const dateFormatted = expiryDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
    const timeFormatted = expiryDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
    const fullExpiryString = `${dateFormatted} at ${timeFormatted}`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="color-scheme" content="light dark">
        <meta name="supported-color-schemes" content="light dark">
        <title>ImmunoTrack Invitation</title>
        <style>
          @media (prefers-color-scheme: dark) {
            body { background-color: #111111 !important; color: #f4f6f8 !important; }
            .email-container { background-color: #1e1e1e !important; border-color: #333333 !important; }
            .text-primary { color: #f4f6f8 !important; }
            .text-secondary { color: #a1a1aa !important; }
            .bg-accent { background-color: #2d3748 !important; border-color: #4a5568 !important; }
          }
        </style>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1B1E54; margin: 0; padding: 0; background-color: #f4f6f8; -webkit-font-smoothing: antialiased;">
        <div style="max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px rgba(27,30,84,0.05);">
          
          <!-- Branded Logo Header -->
          <div style="background-color: #1B1E54; padding: 25px 30px; text-align: center; border-bottom: 1px solid #111438;">
            <h1 style="margin: 0; display: inline-block; font-family: 'Montserrat', 'Poppins', 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; vertical-align: middle;">
              <span style="color: #ffffff;">Immuno</span><span style="color: #4ebcb6;">Track</span>
            </h1>
            <img src="https://dev-api.immunotrack.ai/public/assets/logo.png" alt="ImmunoTrack Logo" style="max-height: 40px; width: auto; vertical-align: middle; margin-left: 12px; display: inline-block;">
          </div>

          <!-- Email Content Body -->
          <div style="padding: 40px 40px 30px 40px;">
            
            <!-- 1. Personal Greeting -->
            <p style="font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 20px; color: #1B1E54;">Hi ${patientFirstName},</p>
            
            <!-- 2. Clinician Introduction -->
            <p style="font-size: 16px; margin-bottom: 20px; color: #334155; line-height: 1.6;">${clinicianIntro}</p>

            <!-- 3. Personal Message (if provided) -->
            ${messageBlock}

            <!-- 4. What ImmunoTrack does -->
            <p style="font-size: 16px; margin-bottom: 20px; color: #334155; line-height: 1.6;">
              With ImmunoTrack you can: log your daily symptoms, track your medications, and receive personalized insights to help you and your care team stay on top of your condition.
            </p>

            <!-- 5. Non-diagnostic Disclaimer -->
            <p style="font-size: 14px; margin-bottom: 30px; color: #64748B; font-style: italic; line-height: 1.5; border-left: 3px solid #CBD5E1; padding-left: 12px;">
              ImmunoTrack does not diagnose conditions or recommend treatments. All AI-generated insights are reviewed by your clinician.
            </p>

            <!-- 6. Invite Code (large display) -->
            <div style="background-color: #f8fafc; padding: 25px; border-radius: 12px; border: 2px dashed #CBD5E1; text-align: center; margin: 30px 0 10px 0;">
              <span style="font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; color: #64748B; font-weight: 700; display: block; margin-bottom: 10px;">Your Invite Code</span>
              <span style="font-size: 24px; font-weight: bold; color: #1B1E54; letter-spacing: 2px; font-family: 'Courier New', Courier, monospace; display: block; -webkit-user-select: all; user-select: all;">${displayCode}</span>
            </div>
            
            <!-- 7. Expiry Warning -->
            <p style="margin-top: 0; margin-bottom: 35px; font-size: 12px; color: #C0392B; text-align: center; font-weight: bold;">
              This invitation code expires in 72 hours — by ${fullExpiryString} UTC.
            </p>

            <!-- 8. Primary CTA Button -->
            <div style="text-align: center; margin: 35px 0 25px 0;">
              <a href="${deepLink}" style="background-color: #2C2F7F; color: #ffffff; padding: 16px 36px; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block; box-shadow: 0 4px 12px rgba(27,30,84,0.15); transition: background-color 0.2s; width: 100%; max-width: 280px; box-sizing: border-box; line-height: 16px;">
                Open ImmunoTrack
              </a>
            </div>

            <!-- 9. App Download Links -->
            <div style="text-align: center; margin: 30px 0; border-top: 1px solid #E2E8F0; padding-top: 25px;">
              <p style="font-size: 13px; color: #64748B; margin-top: 0; margin-bottom: 15px; font-weight: 600;">If app is not installed:</p>
              <div style="display: inline-block; margin: 0 8px 10px 8px;">
                <a href="https://apps.apple.com/app/id6766438796" style="display: inline-block; text-decoration: none;">
                  <span style="background-color: #000000; color: #ffffff; padding: 10px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; display: inline-block; border: 1px solid #333; line-height: 1.2; text-align: left;">
                    <span style="font-size: 9px; display: block; color: #a1a1a1; font-weight: 400;">Download on the</span>
                    App Store
                  </span>
                </a>
              </div>
              <div style="display: inline-block; margin: 0 8px 10px 8px;">
                <a href="https://play.google.com/store/apps/details?id=ai.immunotrack.app" style="display: inline-block; text-decoration: none;">
                  <span style="background-color: #000000; color: #ffffff; padding: 10px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; display: inline-block; border: 1px solid #333; line-height: 1.2; text-align: left;">
                    <span style="font-size: 9px; display: block; color: #a1a1a1; font-weight: 400;">GET IT ON</span>
                    Google Play
                  </span>
                </a>
              </div>
            </div>

            <!-- 10. Manual code entry instruction -->
            <p style="font-size: 13px; color: #64748B; text-align: center; line-height: 1.5; margin-bottom: 35px; max-width: 460px; margin-left: auto; margin-right: auto;">
              Or enter this code manually in the ImmunoTrack app: <strong>${displayCode}</strong>
            </p>

            <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 35px 0;">

            <!-- 11. Privacy statement -->
            <p style="font-size: 12px; color: #94A3B8; text-align: center; line-height: 1.6; margin-bottom: 20px;">
              Your privacy is important to us. This invitation was sent by your clinician as part of your care. ImmunoTrack handles your health information in accordance with HIPAA. View our <a href="https://immunotrack.ai/privacy" style="color: #1B1E54; text-decoration: underline; font-weight: 600;">Privacy Policy</a>.
            </p>

            <!-- 12. Support footer -->
            <div style="font-size: 12px; color: #94A3B8; text-align: center; line-height: 1.6;">
              Questions? Contact us at <a href="mailto:support@immunotrack.ai" style="color: #1B1E54; text-decoration: none; font-weight: 600;">support@immunotrack.ai</a> or call your clinic directly.
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generates a HIPAA-compliant OTP email template
   */
  getOtpTemplate(
    otp: string,
    title = "Password Reset Request",
    description = "We received a request to reset your password. Use the verification code below to proceed. This code is valid for 10 minutes.",
    footerWarning = "If you did not request a password reset, please ignore this email or contact support if you have concerns.",
    isLongFormat = false
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="color-scheme" content="light dark">
        <meta name="supported-color-schemes" content="light dark">
        <title>ImmunoTrack Verification Code</title>
        <style>
          @media (prefers-color-scheme: dark) {
            body { background-color: #111111 !important; color: #f4f6f8 !important; }
            .email-container { background-color: #1e1e1e !important; border-color: #333333 !important; }
            .text-primary { color: #f4f6f8 !important; }
            .text-secondary { color: #a1a1aa !important; }
            .bg-accent { background-color: #2d3748 !important; border-color: #4a5568 !important; }
          }
        </style>
      </head>
      <body style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1B1E54; margin: 0; padding: 0; background-color: #f9f9f9;">
        <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e1e1e1; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          
          <!-- Header -->
          <div style="background-color: #1B1E54; padding: 25px 30px; text-align: center; border-bottom: 1px solid #111438;">
            <h1 style="margin: 0; display: inline-block; font-family: 'Montserrat', 'Poppins', 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; vertical-align: middle;">
              <span style="color: #ffffff;">Immuno</span><span style="color: #4ebcb6;">Track</span>
            </h1>
            <img src="https://dev-api.immunotrack.ai/public/assets/logo.png" alt="ImmunoTrack Logo" style="max-height: 40px; width: auto; vertical-align: middle; margin-left: 12px; display: inline-block;">
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <p style="font-size: 18px; font-weight: 600; margin-bottom: 20px;">${title}</p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">${description}</p>

            <div style="background-color: #F0F9F7; padding: 30px; border-radius: 8px; text-align: center; border: 1px dashed #7FE3C5; margin: 30px 0;">
              <p style="margin-top: 0; margin-bottom: 10px; font-size: 14px; color: #666; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">${isLongFormat ? 'Your Temporary Password' : 'Your Verification Code'}</p>
              <div style="font-size: ${isLongFormat ? '28px' : '48px'}; font-weight: 800; color: #1B1E54; letter-spacing: ${isLongFormat ? '2px' : '8px'}; font-family: monospace;">${otp}</div>
            </div>

            <p style="font-size: 14px; color: #666; font-style: italic;">
               ${footerWarning}
            </p>

            <hr style="border: 0; border-top: 1px solid #eee; margin: 40px 0;">

            <!-- Footer -->
            <div style="font-size: 12px; color: #999; text-align: center;">
              <p>This is an automated security notification. ImmunoTrack handles your health information in accordance with HIPAA.</p>
              <p style="margin-top: 15px;">Questions? Contact us at support@immunotrack.ai</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generates a HIPAA-compliant security notification email template
   */
  getSecurityNotificationTemplate(
    title: string,
    message: string,
    supportEmail = "support@immunotrack.ai"
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ImmunoTrack Security Alert</title>
        <style>
          body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1B1E54; margin: 0; padding: 0; background-color: #f9f9f9; }
          .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e1e1e1; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          .header { background-color: #1B1E54; padding: 25px 30px; text-align: center; border-bottom: 1px solid #111438; }
          .header h1 { color: #7FE3C5; margin: 0; display: inline-block; font-size: 28px; font-weight: 800; letter-spacing: 1px; vertical-align: middle; }
          .header img { max-height: 40px; width: auto; vertical-align: middle; margin-right: 12px; display: inline-block; }
          .content { padding: 40px 30px; }
          .title { font-size: 18px; font-weight: 600; margin-bottom: 20px; color: #e11d48; }
          .message { font-size: 16px; margin-bottom: 20px; }
          .footer { font-size: 12px; color: #999; text-align: center; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; display: inline-block; font-family: 'Montserrat', 'Poppins', 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; vertical-align: middle;">
              <span style="color: #ffffff;">Immuno</span><span style="color: #4ebcb6;">Track</span>
            </h1>
            <img src="https://dev-api.immunotrack.ai/public/assets/logo.png" alt="ImmunoTrack Logo">
          </div>
          <div class="content">
            <p class="title">${title}</p>
            <p class="message">${message}</p>
            <p class="message">If this was you, no further action is required.</p>
            <p class="message"><strong>If you did not authorize this change, please contact us immediately at <a href="mailto:${supportEmail}">${supportEmail}</a>.</strong></p>
            <div class="footer">
              <p>This is an automated security notification. ImmunoTrack handles your health information in accordance with HIPAA.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
