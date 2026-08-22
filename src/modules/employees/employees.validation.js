const { z } = require('zod');

const inviteEmployeeSchema = z.object({
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    teamId: z.string({ required_error: "Please select a team first", invalid_type_error: "Please select a team first" }).min(1, "Please select a team first"),
    location: z.string().optional().default('Remote'),
    computerType: z.enum(['COMPANY', 'PERSONAL']).default('PERSONAL'),
    organizationId: z.string(),
    role: z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']).default('EMPLOYEE'),
    deviceOwnership: z.enum(['COMPANY_DEVICE', 'PERSONAL_DEVICE']).optional(),
    payType: z.enum(['HOURLY', 'MONTHLY']).optional().default('HOURLY'),
    hourlyRate: z.number().optional(),
    monthlyRate: z.number().optional(),
});

const updateEmployeeSchema = z.object({
    fullName: z.string().optional(),
    teamId: z.string().optional(),
    location: z.string().optional(),
    status: z.enum(['INVITED', 'ACTIVE', 'OFFLINE', 'IDLE', 'DEACTIVATED', 'MERGED']).optional(),
    payType: z.enum(['HOURLY', 'MONTHLY']).optional(),
    hourlyRate: z.number().optional(),
    monthlyRate: z.number().optional(),
    avatar: z.string().optional(),
    password: z.string().min(6).optional(),
    allowRemoteAttendance: z.boolean().optional(),
    allowRemoteLogin: z.boolean().optional(),
    deviceOwnership: z.enum(['COMPANY_DEVICE', 'PERSONAL_DEVICE']).optional(),
});

module.exports = {
    inviteEmployeeSchema,
    updateEmployeeSchema,
};
