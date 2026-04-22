import { db } from "../../db";
import { users } from "../../db/schema/user.schema";
import { clinicians } from "../../db/schema/profile.schema";
import { clinics } from "../../db/schema/clinic.schema";
import { roles } from "../../db/schema/role.schema";
import { hashForLookup, encrypt } from "../../utils/encryption";
import { hashPassword } from "../../utils/hash";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { CreateClinicianInput } from "./clinician.schema";

export class ClinicianService {
  async createClinician(input: CreateClinicianInput) {
    // 1. Generate secure random 16-character temporary password
    const tempPassword = crypto.randomBytes(8).toString("hex");
    
    const emailHash = hashForLookup(input.email);
    const encryptedEmail = encrypt(input.email);
    const hashedPassword = await hashPassword(tempPassword);

    // 2. Fetch the 'clinician' role ID
    const [clinicianRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, "clinician"))
      .limit(1);

    if (!clinicianRole) {
      throw new Error("Clinician role not found in system");
    }

    return await db.transaction(async (tx) => {
      // 3. Create base User (Encrypted fullName for consistency)
      const [newUser] = await tx
        .insert(users)
        .values({
          fullName: encrypt(input.fullName),
          email: encryptedEmail,
          emailHash: emailHash,
          passwordHash: hashedPassword,
          roleId: clinicianRole.id,
          status: "active",
          isTempPassword: true,
          passwordChangedAt: new Date(),
        })
        .returning();

      // 4. Handle Clinic linking or creation
      let clinicId: string | null = null;
      if (input.organizationName) {
        const [existingClinic] = await tx
          .select({ id: clinics.id })
          .from(clinics)
          .where(eq(clinics.name, input.organizationName))
          .limit(1);

        if (existingClinic) {
          clinicId = existingClinic.id;
        } else {
          const [newClinic] = await tx
            .insert(clinics)
            .values({ name: input.organizationName })
            .returning({ id: clinics.id });
          clinicId = newClinic.id;
        }
      }

      // 5. Create Clinician Profile
      const encryptedLicense = input.licenseNumber ? encrypt(input.licenseNumber) : null;
      const encryptedNpi = encrypt(input.npiNumber);
      const encryptedPhone = input.phone ? encrypt(input.phone) : null;

      await tx.insert(clinicians).values({
        userId: newUser.id,
        clinicId: clinicId,
        licenseNumber: encryptedLicense,
        npiNumber: encryptedNpi,
        phone: encryptedPhone,
        stateOfLicensure: input.stateOfLicensure,
        clinicalRole: input.role,
        specialty: input.specialty,
        organizationName: input.organizationName,
      });

      return {
        clinicianId: newUser.id,
        tempPassword,
      };
    });
  }
}
