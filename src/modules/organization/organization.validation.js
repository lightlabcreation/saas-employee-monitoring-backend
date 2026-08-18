const { z } = require('zod');

const organizationSchema = z.object({
    legalName: z.string().min(3, "Legal name must be at least 3 characters"),
    logo: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    organizationSize: z.string().nullable().optional(),
    timeZone: z.string().min(1, "Time zone is required"),
    workStartTime: z.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, "Invalid start time format"),
    workEndTime: z.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, "Invalid end time format"),
    workDays: z.array(z.string()).min(1, "At least one workday is required"),
    locationRestrictionEnabled: z.boolean().optional(),
    officeLatitude: z.number().nullable().optional(),
    officeLongitude: z.number().nullable().optional(),
    allowedRadius: z.number().optional(),
    requireGpsForAttendance: z.boolean().optional(),
    allowRemoteWorkOverride: z.boolean().optional(),
    screenRecordingEnabled: z.boolean().optional(),
    r2AccountId: z.string().nullable().optional(),
    r2AccessKeyId: z.string().nullable().optional(),
    r2SecretAccessKey: z.string().nullable().optional(),
    r2BucketName: z.string().nullable().optional(),
    r2Endpoint: z.string().nullable().optional(),
});

module.exports = {
    organizationSchema
};
