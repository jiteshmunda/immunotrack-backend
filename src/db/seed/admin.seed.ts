import { db } from "../index";
import { users } from "../schema/user.schema";
import { roles } from "../schema/role.schema";
import { eq, and } from "drizzle-orm";
import { ENV } from "../../config/env";
import { hashPassword } from "../../utils/hash";
import { encrypt, hashForLookup } from "../../utils/encryption";

export async function seedAdmin() {
  console.log("Seeding admin user...");

  // 1. Get the admin role ID
  const [adminRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, "super admin"))
    .limit(1);

  if (!adminRole) {
    throw new Error("Admin role not found. Please seed roles first.");
  }

  // 2. Prepare admin credentials from ENV
  const emailHash = hashForLookup(ENV.ADMIN_EMAIL);
  const encryptedEmail = encrypt(ENV.ADMIN_EMAIL);
  const passwordHash = await hashPassword(ENV.ADMIN_PASSWORD);

  // 3. Check if an admin already exists (there should ONLY be one)
  const [existingAdmin] = await db
    .select()
    .from(users)
    .where(eq(users.roleId, adminRole.id))
    .limit(1);

  if (existingAdmin) {
    console.log("Existing admin found. Syncing with current .env...");
    await db
      .update(users)
      .set({
        fullName: encrypt(ENV.ADMIN_NAME),
        email: encryptedEmail,
        emailHash: emailHash,
        passwordHash: passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingAdmin.id));
    console.log("Admin credentials synchronized successfully.");
  } else {
    console.log("No admin found. Creating initial admin...");
    await db.insert(users).values({
      fullName: encrypt(ENV.ADMIN_NAME),
      email: encryptedEmail,
      emailHash: emailHash,
      passwordHash: passwordHash,
      roleId: adminRole.id,
      status: "active",
    });
    console.log("Initial admin created successfully.");
  }
}
