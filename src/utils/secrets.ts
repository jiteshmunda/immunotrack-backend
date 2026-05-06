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
        VersionStage: "AWSCURRENT",
      })
    );

    let secrets: any;
    if (response.SecretString) {
      secrets = JSON.parse(response.SecretString);
    } else if (response.SecretBinary) {
      const decodedBinarySecret = Buffer.from(response.SecretBinary).toString('utf-8');
      secrets = JSON.parse(decodedBinarySecret);
    } else {
      throw new Error("Secret found but it is empty");
    }

    const host = secrets.host || secrets.endpoint;
    const user = secrets.username || secrets.user;
    const pass = secrets.password;
    const dbname = secrets.dbname || secrets.database || secrets.dbInstanceIdentifier || "";
    const port = secrets.port || 5432;

    if (!secrets.DATABASE_URL && host && user && pass) {
      let cleanHost = host.replace(/^postgresql?:\/\//, "").split(":")[0].split("/")[0];
      secrets.DATABASE_URL = `postgresql://${user}:${encodeURIComponent(pass)}@${cleanHost}:${port}/${dbname}`;
      console.log("[AWS Secrets Manager] Successfully built DATABASE_URL from individual keys.");
    }

    return secrets;
  } catch (error: any) {
    console.error(`[AWS Secrets Manager] Error fetching secret "${secretName}":`, error.message);
    throw error;
  }
}
