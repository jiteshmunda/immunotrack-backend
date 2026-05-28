import { db } from "../../db";
import { users } from "../../db/schema/user.schema";
import { clinicians } from "../../db/schema/profile.schema";
import { clinics } from "../../db/schema/clinic.schema";
import { roles } from "../../db/schema/role.schema";
import { hashForLookup, encrypt, decrypt } from "../../utils/encryption";
import { hashPassword, generateTempPassword } from "../../utils/hash";
import { eq } from "drizzle-orm";
import { CreateClinicianInput } from "../clinician/clinician.schema";

export class AdminService {
  async createAdmin(input: CreateClinicianInput) {
    const tempPassword = generateTempPassword();
    
    const emailHash = hashForLookup(input.email);
    const encryptedEmail = encrypt(input.email);
    const hashedPassword = await hashPassword(tempPassword);

    const [adminRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, "admin"))
      .limit(1);

    if (!adminRole) {
      throw new Error("Admin role not found in system");
    }

    return await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({
          fullName: encrypt(input.fullName),
          email: encryptedEmail,
          emailHash: emailHash,
          passwordHash: hashedPassword,
          roleId: adminRole.id,
          status: "active",
          isTempPassword: true,
          passwordChangedAt: new Date(),
        })
        .returning();

      // Handle Clinic linking or creation
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

      // Create Admin's Profile in clinicians table
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
        adminId: newUser.id,
        tempPassword,
      };
    });
  }

  async getClinicians(adminId: string) {
    const adminClinicians = await db
      .select({
        id: clinicians.id,
        user_id: users.id,
        full_name: users.fullName,
        email: users.email,
        status: users.status,
        clinical_role: clinicians.clinicalRole,
        specialty: clinicians.specialty,
        npi_number: clinicians.npiNumber,
        state_of_licensure: clinicians.stateOfLicensure,
        created_at: clinicians.createdAt,
      })
      .from(clinicians)
      .innerJoin(users, eq(clinicians.userId, users.id))
      .where(eq(clinicians.createdBy, adminId));

    // Decrypt sensitive fields before returning
    return adminClinicians.map((clinician) => ({
      ...clinician,
      full_name: decrypt(clinician.full_name!),
      email: decrypt(clinician.email!),
      npi_number: clinician.npi_number ? decrypt(clinician.npi_number) : null,
    }));
  }
}
