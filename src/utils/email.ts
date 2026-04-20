import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import "isomorphic-fetch";

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  isHtml?: boolean;
}

/**
 * HIPAA-Compliant Email Service
 * Supports Microsoft Graph API with a development Mock fallback.
 */
export class EmailService {
  private client: Client | null = null;
  private senderEmail: string | null = null;

  constructor() {
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    this.senderEmail = process.env.SES_FROM_EMAIL || "noreply@immunotrack.ai";

    if (tenantId && clientId && clientSecret && this.senderEmail) {
      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
      this.client = Client.initWithMiddleware({
        authProvider: {
          getAccessToken: async () => {
            const token = await credential.getToken("https://graph.microsoft.com/.default");
            return token.token;
          },
        },
      });
    }
  }

  async sendEmail({ to, subject, body, isHtml = true }: SendEmailParams): Promise<void> {
    if (this.client && this.senderEmail) {
      // Real Microsoft Graph Mode
      try {
        const emailData = {
          message: {
            subject,
            body: {
              contentType: isHtml ? "HTML" : "Text",
              content: body,
            },
            toRecipients: [{ emailAddress: { address: to } }],
            from: { emailAddress: { address: this.senderEmail, name: "ImmunoTrack AI" } },
            replyTo: [{ emailAddress: { address: "support@immunotrack.ai" } }],
          },
        };

        await this.client.api(`/users/${this.senderEmail}/sendMail`).post(emailData);
      } catch (error: any) {
        console.error("Microsoft Graph Email Error:", error.message);
        throw new Error("Failed to send email via Graph API");
      }
    } else {
      // Mock Mode (For Local Development & Testing)
      console.log("\n" + "=".repeat(60));
      console.log("EMAIL SENT (MOCK MODE)");
      console.log("-".repeat(60));
      console.log(`From:    ImmunoTrack AI <${this.senderEmail}>`);
      console.log(`ReplyTo: support@immunotrack.ai`);
      console.log(`To:      ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Content: \n${body}`);
      console.log("=".repeat(60) + "\n");
    }
  }

  /**
   * Generates a HIPAA-compliant invitation email template 
   */
  getInviteTemplate(
    patientFirstName: string,
    clinicianName: string,
    displayCode: string,
    expiryTimestamp: string,
    personalMessage?: string
  ): string {
    const clinicianIntro = `Your doctor, ${clinicianName}, has invited you to join ImmunoTrack — an AI-powered allergy and asthma monitoring platform designed to help track your symptoms between appointments.`;

    const messageBlock = personalMessage
      ? `<blockquote style="border-left: 4px solid #7FE3C5; padding-left: 15px; margin: 20px 0; font-style: italic; color: #555;">${personalMessage}</blockquote>`
      : "";

    const deepLink = `immunotrack://invite?code=${displayCode.replace(/-/g, "")}`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ImmunoTrack Invitation</title>
      </head>
      <body style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1B1E54; margin: 0; padding: 0; background-color: #f9f9f9;">
        <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e1e1e1; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          
          <!-- Header -->
          <div style="background-color: #1B1E54; padding: 30px; text-align: center;">
            <h1 style="color: #7FE3C5; margin: 0; font-size: 28px; letter-spacing: 1px;">ImmunoTrack</h1>
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <p style="font-size: 18px; font-weight: 600; margin-bottom: 20px;">Hi ${patientFirstName},</p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">${clinicianIntro}</p>

            ${messageBlock}

            <p style="font-size: 16px; margin-bottom: 25px;">
              With ImmunoTrack you can log your daily symptoms, track your medications, and receive personalized insights to help you and your care team stay on top of your condition.
            </p>

            <div style="background-color: #F0F9F7; padding: 30px; border-radius: 8px; text-align: center; border: 1px dashed #7FE3C5; margin: 30px 0;">
              <p style="margin-top: 0; margin-bottom: 10px; font-size: 14px; color: #666; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">Your Invite Code</p>
              <div style="font-size: 32px; font-weight: 800; color: #1B1E54; letter-spacing: 2px; font-family: monospace;">${displayCode}</div>
              <p style="margin-top: 15px; margin-bottom: 0; font-size: 13px; color: #cc3300;">This code expires on ${new Date(expiryTimestamp).toLocaleString()} UTC.</p>
            </div>

            <div style="text-align: center; margin: 40px 0;">
              <a href="${deepLink}" style="background-color: #7FE3C5; color: #1B1E54; padding: 16px 32px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 16px; display: inline-block;">Open ImmunoTrack</a>
            </div>

            <p style="font-size: 14px; color: #666; font-style: italic;">
               Note: ImmunoTrack does not diagnose conditions or recommend treatments. All AI-generated insights are reviewed by your clinician.
            </p>

            <hr style="border: 0; border-top: 1px solid #eee; margin: 40px 0;">

            <!-- Footer -->
            <div style="font-size: 12px; color: #999; text-align: center;">
              <p>Your privacy is important to us. This invitation was sent by your clinician as part of your care. ImmunoTrack handles your health information in accordance with HIPAA.</p>
              <p style="margin-top: 15px;">Questions? Contact us at support@immunotrack.ai</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
