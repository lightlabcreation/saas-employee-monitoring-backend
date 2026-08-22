const prisma = require('../../config/db');
const bcrypt = require('bcrypt');
const { getIO } = require('../../socket/server');

/**
 * Get all employees for an organization with optional filtering
 */
const getEmployees = async (organizationId, filter = {}) => {
    return await prisma.employee.findMany({
        where: {
            organizationId,
            ...filter
        },
        include: {
            team: true,
            user: {
                select: {
                    id: true,
                    email: true,
                    role: true
                }
            },
            agent: true,
            tracking: {
                orderBy: { timestamp: 'desc' },
                take: 1
            },
            liveActivities: {
                orderBy: { createdAt: 'desc' },
                take: 1
            }
        },
        orderBy: {
            fullName: 'asc'
        }
    });
};

/**
 * Get a single employee by ID
 */
const getEmployeeById = async (id) => {
    return await prisma.employee.findUnique({
        where: { id },
        include: {
            team: true,
            user: {
                select: {
                    id: true,
                    email: true,
                    role: true
                }
            },
            agent: true
        }
    });
};

/**
 * Invite a new employee (creates employee record with INVITED status)
 */
const inviteEmployee = async (data) => {
    // ── Check Organization Subscription & Employee Limit ───────────────────
    if (data.organizationId) {
        const activeSub = await prisma.saasSubscription.findFirst({
            where: { organizationId: data.organizationId, status: 'ACTIVE' }
        });
        if (activeSub) {
            const plan = await prisma.saasPlan.findUnique({ where: { id: activeSub.planId } });
            if (plan && plan.employeeLimit) {
                const currentCount = await prisma.employee.count({
                    where: {
                        organizationId: data.organizationId,
                        status: { not: 'DEACTIVATED' }
                    }
                });
                if (currentCount >= plan.employeeLimit) {
                    const err = new Error(`Employee creation limit reached for your active plan (${plan.name}). Maximum allowed: ${plan.employeeLimit}. Please upgrade your subscription plan.`);
                    err.statusCode = 400;
                    throw err;
                }
            }
        }
    }

    // Find the default tracking setting for this computer type in the organization
    let trackingSetting = await prisma.trackingSetting.findFirst({
        where: {
            organizationId: data.organizationId,
            computerType: data.computerType.toLowerCase(),
            isDefault: true
        }
    });

    // Fallback: If no default, pick the first one of that type
    if (!trackingSetting) {
        trackingSetting = await prisma.trackingSetting.findFirst({
            where: {
                organizationId: data.organizationId,
                computerType: data.computerType.toLowerCase()
            }
        });
    }

    const workMode = data.location || 'Remote';

    return await prisma.employee.create({
        data: {
            fullName: data.fullName,
            email: data.email,
            organizationId: data.organizationId,
            teamId: data.teamId,
            workMode,
            location: null,
            computerType: data.computerType || 'PERSONAL',
            deviceOwnership: data.deviceOwnership || (data.computerType === 'COMPANY' ? 'COMPANY_DEVICE' : 'PERSONAL_DEVICE'),
            trackingSettingId: trackingSetting?.id,
            role: 'EMPLOYEE',
            status: 'INVITED'
        }
    });
};

/**
 * Update an existing employee and their linked user record
 */
const updateEmployee = async (id, data) => {
    const { password, ...employeeData } = data;

    // Filter and prepare employee update data
    const updateData = {};
    if (employeeData.fullName !== undefined) updateData.fullName = employeeData.fullName;
    if (employeeData.teamId !== undefined) {
        updateData.teamId = (employeeData.teamId === 'unassigned' || employeeData.teamId === '' || employeeData.teamId === 'none') ? null : employeeData.teamId;
    }
    if (employeeData.location !== undefined) updateData.location = employeeData.location;
    if (employeeData.status !== undefined) updateData.status = employeeData.status;
    if (employeeData.payType !== undefined) updateData.payType = employeeData.payType;
    if (employeeData.hourlyRate !== undefined) updateData.hourlyRate = employeeData.hourlyRate;
    if (employeeData.monthlyRate !== undefined) updateData.monthlyRate = employeeData.monthlyRate;

    // Auto sync hourly/monthly if payType is explicitly updated
    if (employeeData.payType === 'MONTHLY' && employeeData.monthlyRate > 0) {
        updateData.hourlyRate = Math.round((employeeData.monthlyRate / 160) * 100) / 100;
    } else if (employeeData.payType === 'HOURLY' && employeeData.hourlyRate > 0) {
        updateData.monthlyRate = Math.round(employeeData.hourlyRate * 160 * 100) / 100;
    }

    if (employeeData.avatar !== undefined) updateData.avatar = employeeData.avatar;
    if (employeeData.allowRemoteAttendance !== undefined) updateData.allowRemoteAttendance = employeeData.allowRemoteAttendance;
    if (employeeData.allowRemoteLogin !== undefined) updateData.allowRemoteLogin = employeeData.allowRemoteLogin;
    if (employeeData.deviceOwnership !== undefined) updateData.deviceOwnership = employeeData.deviceOwnership;

    // Update employee record
    const employee = await prisma.employee.update({
        where: { id },
        data: updateData,
        include: { user: true }
    });

    // Handle password update or creation of User record
    if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        if (employee.user) {
            // Update existing user
            await prisma.user.update({
                where: { id: employee.user.id },
                data: { 
                    password: hashedPassword,
                    email: employee.email // Ensure email stays in sync
                }
            });
        } else {
            // Create new user for this employee if none exists
            await prisma.user.create({
                data: {
                    email: employee.email,
                    password: hashedPassword,
                    role: employee.role,
                    name: employee.fullName,
                    employeeId: employee.id
                }
            });
        }
    }

    // If team was changed, emit notification for employee
    if (employeeData.teamId !== undefined && updateData.teamId) {
        const io = getIO();
        if (io) {
            const teamInfo = await prisma.team.findUnique({ where: { id: updateData.teamId }, select: { name: true, organizationId: true } });
            if (teamInfo) {
                io.to(`org_${teamInfo.organizationId}`).emit('team:update', { 
                    type: 'MEMBER_ADDED',
                    teamName: teamInfo.name,
                    employeeId: id
                });
            }
        }
    }

    return await getEmployeeById(id);
};

/**
 * Permanently delete an employee and all their associated data
 */
const deleteEmployee = async (id) => {
    const employee = await prisma.employee.findUnique({
        where: { id },
        include: { user: true }
    });

    if (!employee) {
        throw new Error('Employee not found');
    }

    // Step-by-step cleanup of related records (cascading)
    await prisma.activityLog.deleteMany({ where: { employeeId: id } });
    await prisma.appUsageLog.deleteMany({ where: { employeeId: id } });
    await prisma.attendance.deleteMany({ where: { employeeId: id } });
    await prisma.locationLog.deleteMany({ where: { employeeId: id } });
    await prisma.screenshot.deleteMany({ where: { employeeId: id } });
    await prisma.liveActivity.deleteMany({ where: { employeeId: id } });
    await prisma.manualTime.deleteMany({ where: { employeeId: id } });
    await prisma.shift.deleteMany({ where: { employeeId: id } });
    await prisma.projectAssignment.deleteMany({ where: { employeeId: id } });
    await prisma.projectTimeLog.deleteMany({ where: { employeeId: id } });
    await prisma.payrollRecord.deleteMany({ where: { employeeId: id } });
    await prisma.timeOff.deleteMany({ where: { employeeId: id } });
    await prisma.auditLog.deleteMany({ where: { userId: id } });
    await prisma.agent.deleteMany({ where: { employeeId: id } });
    await prisma.tracking.deleteMany({ where: { employeeId: id } });
    await prisma.videoRecording.deleteMany({ where: { employeeId: id } });
    
    // De-assign from tasks instead of deleting tasks
    await prisma.task.updateMany({
        where: { employeeId: id },
        data: { employeeId: null }
    });

    // Delete User record if exists
    if (employee.user) {
        await prisma.user.delete({
            where: { id: employee.user.id }
        });
    }

    // Finally delete the employee
    return await prisma.employee.delete({
        where: { id }
    });
};

module.exports = {
    getEmployees,
    getEmployeeById,
    inviteEmployee,
    updateEmployee,
    deleteEmployee
};
