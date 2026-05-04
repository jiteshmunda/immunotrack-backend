import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

/**
 * Fetches secrets from AWS Secrets Manager
 * @param secretName The name or ARN of the secret
 * @param region The AWS region
 */
export async function getSecretsFromAWS(secretName: string, region: string = "us-east-1") {
  const client = new SecretsManagerClient({ region });

  try {
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: secretName,
        VersionStage: "AWSCURRENT", // Default to the latest version
      })
    );

    if (response.SecretString) {
      return JSON.parse(response.SecretString);
    }
    
    if (response.SecretBinary) {
      const decodedBinarySecret = Buffer.from(response.SecretBinary).toString('utf-8');
      return JSON.parse(decodedBinarySecret);
    }

    throw new Error("Secret found but it is empty");
  } catch (error: any) {
    console.error(`[AWS Secrets Manager] Error fetching secret "${secretName}":`, error.message);
    throw error;
  }
}
