import { db } from "../index";
import { roles } from "../schema/role.schema";
import { eq } from "drizzle-orm";

const defaultRoles = [
  { name: "admin", description: "System administrator with full access" },
  { name: "clinician", description: "Healthcare professional managing patients" },
  { name: "patient", description: "User receiving care and tracking symptoms" },
];

export async function seedRoles() {
  console.log(" Seeding roles...");

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
