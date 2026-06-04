import { db } from "../index";
import { roles } from "../schema/role.schema";
import { eq } from "drizzle-orm";

const defaultRoles = [
  { name: "super admin", description: "System administrator with full access" },
  { name: "admin", description: "Clinic administrator managing clinicians" },
  { name: "system_admin", description: "Pure clinic administrator without a clinician profile" },
  { name: "clinician", description: "Healthcare professional managing patients" },
  { name: "patient", description: "User receiving care and tracking symptoms" },
];

export async function seedRoles() {
  console.log(" Seeding roles...");

  // Removed legacy conversion logic as 'admin' is now its own independent role

  for (const role of defaultRoles) {
    const existing = await db
      .select()
      .from(roles)
      .where(eq(roles.name, role.name))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(roles).values(role);
      console.log(`Created role: ${role.name}`);
    } else {
      console.log(`Role already exists: ${role.name}`);
    }
  }
}
