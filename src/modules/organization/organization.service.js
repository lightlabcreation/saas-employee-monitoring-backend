const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class OrganizationService {
    async getOrganization(organizationId) {
        if (!organizationId) {
            throw new Error('Organization ID is required');
        }
        let org = await prisma.organization.findUnique({
            where: { id: organizationId },
            include: {
                complianceSetting: true
            }
        });

        if (!org) {
            // Create a default one if none exists (for development / new registration)
            org = await prisma.organization.create({
                data: {
                    id: organizationId,
                    legalName: "Insightful Corp",
                    timeZone: "UTC+5:30 (IST)",
                    workStartTime: "09:00",
                    workEndTime: "18:00",
                    workDays: "Monday,Tuesday,Wednesday,Thursday,Friday"
                },
                include: {
                    complianceSetting: true
                }
            });
        }

        if (org && org.r2SecretAccessKey) {
            org.r2SecretAccessKey = "********";
        }

        return org;
    }

    async updateOrganization(id, data) {
        // If secret key is masked, preserve the original one from database
        if (data.r2SecretAccessKey === "********") {
            const existing = await prisma.organization.findUnique({
                where: { id },
                select: { r2SecretAccessKey: true }
            });
            data.r2SecretAccessKey = existing?.r2SecretAccessKey;
        }

        // Convert workDays array to string for Prisma
        const updateData = {
            ...data,
            workDays: Array.isArray(data.workDays) ? data.workDays.join(',') : data.workDays
        };

        if (updateData.complianceSetting) {
            delete updateData.complianceSetting; // avoid prisma nested write issue
        }

        const org = await prisma.organization.update({
            where: { id },
            data: updateData
        });

        if (org && org.r2SecretAccessKey) {
            org.r2SecretAccessKey = "********";
        }

        return org;
    }

    async createOrganization(data) {
        const org = await prisma.organization.create({
            data: {
                ...data,
                workDays: Array.isArray(data.workDays) ? data.workDays.join(',') : data.workDays
            }
        });

        if (org && org.r2SecretAccessKey) {
            org.r2SecretAccessKey = "********";
        }

        return org;
    }
}

module.exports = new OrganizationService();
