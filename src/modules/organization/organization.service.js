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

        if (org) {
            if (org.r2SecretAccessKey) org.r2SecretAccessKey = "********";
            if (org.cloudinaryApiSecret) org.cloudinaryApiSecret = "********";
        }

        return org;
    }

    async updateOrganization(id, data) {
        // If secret key is masked, preserve the original one from database
        if (data.r2SecretAccessKey === "********" || data.cloudinaryApiSecret === "********") {
            const existing = await prisma.organization.findUnique({
                where: { id },
                select: { r2SecretAccessKey: true, cloudinaryApiSecret: true }
            });
            if (data.r2SecretAccessKey === "********") data.r2SecretAccessKey = existing?.r2SecretAccessKey;
            if (data.cloudinaryApiSecret === "********") data.cloudinaryApiSecret = existing?.cloudinaryApiSecret;
        }

        // Convert workDays array to string for Prisma
        const updateData = {
            ...data,
            workDays: Array.isArray(data.workDays) ? data.workDays.join(',') : data.workDays
        };

        if (updateData.complianceSetting) {
            delete updateData.complianceSetting; // avoid prisma nested write issue
        }

        // Validate screen video recording feature availability against active subscription plan
        if (updateData.screenRecordingEnabled === true) {
            const activeSub = await prisma.saasSubscription.findUnique({
                where: { organizationId: id }
            });
            if (activeSub) {
                const plan = await prisma.saasPlan.findUnique({
                    where: { id: activeSub.planId }
                });
                const isProPlan = plan && (
                    plan.videoRecording === true || 
                    plan.name.toLowerCase().includes('pro') || 
                    plan.name.toLowerCase().includes('custom') ||
                    plan.name.toLowerCase().includes('enterprise')
                );
                if (!isProPlan) {
                    throw new Error(`Screen Video Recording is only available on Pro & Custom subscription plans. Current plan (${plan?.name || 'Free Trial'}) does not support video recording.`);
                }
            }
        }

        const org = await prisma.organization.update({
            where: { id },
            data: updateData
        });

        if (org) {
            if (org.r2SecretAccessKey) org.r2SecretAccessKey = "********";
            if (org.cloudinaryApiSecret) org.cloudinaryApiSecret = "********";
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

        if (org) {
            if (org.r2SecretAccessKey) org.r2SecretAccessKey = "********";
            if (org.cloudinaryApiSecret) org.cloudinaryApiSecret = "********";
        }

        return org;
    }
}

module.exports = new OrganizationService();
