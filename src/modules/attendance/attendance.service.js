const prisma = require('../../config/db');
const { getIO, updateSessionStatus } = require('../../socket/server');

const attendanceService = {
    clockIn: async (employeeId, organizationId, latitude, longitude) => {
        const now = new Date();
        const org = await prisma.organization.findUnique({ where: { id: organizationId } });

        const getTimezoneOffsetMinutes = (timezoneStr) => {
            if (!timezoneStr || timezoneStr === 'UTC') return 0;
            const match = timezoneStr.match(/UTC([+-])(\d+):(\d+)/);
            if (!match) return 0;
            const sign = match[1] === '+' ? 1 : -1;
            const hours = parseInt(match[2], 10);
            const minutes = parseInt(match[3], 10);
            return sign * (hours * 60 + minutes);
        };

        const offsetMinutes = getTimezoneOffsetMinutes(org?.timeZone);
        // Shift now to target timezone local time
        const localTime = new Date(now.getTime() + offsetMinutes * 60000);
        // Set today using the timezone-shifted date values
        const today = new Date(Date.UTC(localTime.getUTCFullYear(), localTime.getUTCMonth(), localTime.getUTCDate(), 0, 0, 0));

        // Check if there is already an active (unclosed) session - search for ANY active session for this employee
        const active = await prisma.attendance.findFirst({
            where: {
                employeeId,
                clockOut: null,
            },
            orderBy: { clockIn: 'desc' }
        });
        
        if (active) {
            throw new Error('Already clocked in (active session exists)');
        }

        const employeeInfo = await prisma.employee.findUnique({ where: { id: employeeId } });
        if (!employeeInfo) throw new Error('Employee not found');
        
        let distance = null;
        const bypassGps = employeeInfo.allowRemoteAttendance === true;

        // GPS Validation for Clock In
        if (!bypassGps && org && org.locationRestrictionEnabled && org.requireGpsForAttendance) {
            if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
                throw new Error('Location permission is required to clock in.');
            }
            if (org.officeLatitude != null && org.officeLongitude != null) {
                const { calculateDistance } = require('../../utils/haversine.util');
                distance = calculateDistance(latitude, longitude, org.officeLatitude, org.officeLongitude);
                if (distance > org.allowedRadius) {
                    throw new Error('You are outside the allowed office location.');
                }
            }
        }

        // Get employee's shift for today to detect lateness
        const shift = await prisma.shift.findFirst({
            where: {
                employeeId,
                date: today,
            }
        });

        let late = false;
        if (shift) {
            const [sHour, sMin] = shift.startTime.split(':').map(Number);
            const shiftStartTime = new Date(now);
            shiftStartTime.setHours(sHour, sMin, 0, 0);

            if (now > shiftStartTime) {
                late = true;
            }
        }

        const attendance = await prisma.attendance.create({
            data: {
                employeeId,
                organizationId,
                date: today,
                clockIn: now,
                status: 'PRESENT',
                late,
                clockInLatitude: latitude !== undefined ? latitude : null,
                clockInLongitude: longitude !== undefined ? longitude : null,
                clockInDistance: distance !== null ? distance : null,
                attendanceType: bypassGps ? 'Remote' : 'Office',
            }
        });

        // Update employee status to ACTIVE (Guard: Ensure not deactivated)
        const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { status: true } });
        if (employee && employee.status !== 'DEACTIVATED') {
            await prisma.employee.update({
                where: { id: employeeId },
                data: { status: 'ACTIVE' }
            });
        }

        // Emit real-time events
        const io = getIO();
        if (io) {
            io.to(`org_${organizationId}`).emit('attendance:update', { 
                employeeId, 
                type: 'CLOCK_IN',
                employeeName: employeeInfo.fullName || 'An employee'
            });
            io.to(`org_${organizationId}`).emit('employee:status', { employeeId, status: 'ACTIVE' });
            io.to(`employee_${employeeId}`).emit('agent:resume');
        }

        return attendance;
    },

    clockOut: async (employeeId, latitude, longitude) => {
        const now = new Date();

        // Find the most recent active session regardless of date
        const attendance = await prisma.attendance.findFirst({
            where: {
                employeeId,
                clockOut: null,
            },
            orderBy: {
                clockIn: 'desc'
            }
        });

        if (!attendance) {
            throw new Error('No active clock-in session found');
        }

        const employeeInfo = await prisma.employee.findUnique({ where: { id: employeeId } });
        if (!employeeInfo) throw new Error('Employee not found');
        
        const org = await prisma.organization.findUnique({ where: { id: attendance.organizationId } });
        let distance = null;
        const bypassGps = employeeInfo.allowRemoteAttendance === true;

        // GPS Validation for Clock Out
        if (!bypassGps && org && org.locationRestrictionEnabled && org.requireGpsForAttendance) {
            if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
                throw new Error('Location permission is required to clock out.');
            }
            if (org.officeLatitude != null && org.officeLongitude != null) {
                const { calculateDistance } = require('../../utils/haversine.util');
                distance = calculateDistance(latitude, longitude, org.officeLatitude, org.officeLongitude);
                if (distance > org.allowedRadius) {
                    throw new Error('You are outside the allowed office location.');
                }
            }
        }

        const duration = Math.floor((now - attendance.clockIn) / 1000); // in seconds
        
        let finalBreaks = attendance.breaks || [];
        let totalBreakDuration = attendance.totalBreakDuration || 0;
        
        // If there is an open break, close it
        if (Array.isArray(finalBreaks) && finalBreaks.length > 0) {
            const lastBreak = finalBreaks[finalBreaks.length - 1];
            if (!lastBreak.end) {
                lastBreak.end = now.toISOString();
                lastBreak.duration = Math.floor((now - new Date(lastBreak.start)) / 1000);
                totalBreakDuration += lastBreak.duration;
            }
        }

        const updatedAttendance = await prisma.attendance.update({
            where: { id: attendance.id },
            data: {
                clockOut: now,
                duration,
                breaks: finalBreaks,
                totalBreakDuration,
                netWorkingDuration: Math.max(0, duration - totalBreakDuration),
                clockOutLatitude: latitude !== undefined ? latitude : attendance.clockOutLatitude,
                clockOutLongitude: longitude !== undefined ? longitude : attendance.clockOutLongitude,
                clockOutDistance: distance !== null ? distance : attendance.clockOutDistance
            }
        });

        // Update employee status to OFFLINE (Guard: Ensure not deactivated)
        const empInfo = await prisma.employee.findUnique({ where: { id: employeeId }, select: { status: true } });
        if (empInfo && empInfo.status !== 'DEACTIVATED') {
            await prisma.employee.update({
                where: { id: employeeId },
                data: { status: 'OFFLINE' }
            });
        }

        // Emit real-time events
        const io = getIO();
        if (io) {
            io.to(`org_${attendance.organizationId}`).emit('attendance:update', { 
                employeeId, 
                type: 'CLOCK_OUT',
                employeeName: employeeInfo.fullName || 'An employee'
            });
            io.to(`org_${attendance.organizationId}`).emit('employee:status', { employeeId, status: 'OFFLINE' });
            io.to(`employee_${employeeId}`).emit('agent:pause');
        }

        return updatedAttendance;
    },

    getTimesheets: async (organizationId, filters = {}) => {
        const where = { organizationId };

        if (filters.employeeId) where.employeeId = filters.employeeId;
        if (filters.teamId) where.employee = { teamId: filters.teamId };
        if (filters.startDate && filters.endDate) {
            const start = new Date(`${filters.startDate}T00:00:00.000Z`);
            const end = new Date(`${filters.endDate}T23:59:59.999Z`);
            where.date = { gte: start, lte: end };
        }

        const records = await prisma.attendance.findMany({
            where,
            include: {
                employee: {
                    select: {
                        fullName: true,
                        location: true,
                        teamId: true,
                        team: {
                            select: { name: true, description: true },
                        },
                    },
                },
            },
            orderBy: [{ date: 'desc' }, { clockIn: 'desc' }],
        });

        return records.map(r => ({
            ...r,
            latitude: r.clockInLatitude,
            longitude: r.clockInLongitude,
            distanceFromOffice: r.clockInDistance,
        }));
    },

    /**
     * One row per employee per day (merged sessions, correct total hours).
     */
    getTimesheetsGrouped: async (organizationId, filters = {}) => {
        const where = { organizationId };
        if (filters.employeeId) where.employeeId = filters.employeeId;
        if (filters.teamId) where.employee = { teamId: filters.teamId };
        if (filters.startDate && filters.endDate) {
            const start = new Date(`${filters.startDate}T00:00:00.000Z`);
            const end = new Date(`${filters.endDate}T23:59:59.999Z`);
            where.date = { gte: start, lte: end };
        }

        const records = await prisma.attendance.findMany({
            where,
            include: {
                employee: {
                    select: {
                        fullName: true,
                        location: true,
                        teamId: true,
                        team: { select: { name: true, description: true } },
                    },
                },
            },
            orderBy: [{ date: 'desc' }, { clockIn: 'asc' }],
        });

        const map = new Map();
        const now = Date.now();

        records.forEach((row) => {
            const dateKey = new Date(row.date).toISOString().split('T')[0];
            const key = `${row.employeeId}_${dateKey}`;

            if (!map.has(key)) {
                map.set(key, {
                    id: key,
                    employeeId: row.employeeId,
                    organizationId: row.organizationId,
                    employee: row.employee,
                    date: row.date,
                    clockIn: row.clockIn,
                    clockOut: null,
                    duration: 0,
                    totalBreakDuration: 0,
                    netWorkingDuration: 0,
                    breaks: [],
                    sessionCount: 0,
                    late: false,
                    hasOpen: false,
                    latitude: row.clockInLatitude,
                    longitude: row.clockInLongitude,
                    distanceFromOffice: row.clockInDistance,
                    attendanceType: row.attendanceType,
                });
            }

            const agg = map.get(key);
            agg.sessionCount += 1;
            if (row.late) agg.late = true;

            // Merge breaks
            if (row.breaks && Array.isArray(row.breaks)) {
                agg.breaks = [...agg.breaks, ...row.breaks];
            }
            agg.totalBreakDuration += row.totalBreakDuration || 0;

            if (row.clockIn && (!agg.clockIn || new Date(row.clockIn) < new Date(agg.clockIn))) {
                agg.clockIn = row.clockIn;
                agg.latitude = row.clockInLatitude;
                agg.longitude = row.clockInLongitude;
                agg.distanceFromOffice = row.clockInDistance;
                agg.attendanceType = row.attendanceType;
            }

            if (!row.clockOut) {
                agg.hasOpen = true;
                agg.clockOut = null;
                agg.duration += Math.floor((now - new Date(row.clockIn).getTime()) / 1000);
            } else {
                const seg =
                    row.duration ||
                    Math.floor((new Date(row.clockOut) - new Date(row.clockIn)) / 1000);
                agg.duration += seg;
                if (!agg.hasOpen) {
                    if (!agg.clockOut || new Date(row.clockOut) > new Date(agg.clockOut)) {
                        agg.clockOut = row.clockOut;
                    }
                }
            }
        });

        return Array.from(map.values())
            .map(({ hasOpen, ...agg }) => {
                const net = Math.max(0, agg.duration - agg.totalBreakDuration);
                return {
                    ...agg,
                    netWorkingDuration: net,
                    isGrouped: true,
                };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    addManualTime: async (data) => {
        const { employeeId, organizationId, startDate, startTime, endDate, endTime, timezone, type, description } = data;

        const start = new Date(`${startDate} ${startTime}`);
        const end = new Date(`${endDate} ${endTime}`);
        const duration = Math.floor((end - start) / 1000);

        const manualTime = await prisma.manualTime.create({
            data: {
                employeeId,
                organizationId,
                startTime: start,
                endTime: end,
                timezone,
                type: type || 'Regular',
                duration: duration > 0 ? duration : 0,
                note: description,
            }
        });

        // Emit real-time event
        const io = getIO();
        if (io) {
            io.to(`org_${organizationId}`).emit('attendance:update', { employeeId, type: 'manual-time' });
        }

        return manualTime;
    },

    getManualTimes: async (filters) => {
        const where = { organizationId: filters.organizationId };
        if (filters.employeeId) where.employeeId = filters.employeeId;
        if (filters.teamId) where.employee = { teamId: filters.teamId };
        
        if (filters.startDate && filters.endDate) {
            where.startTime = {
                gte: new Date(filters.startDate),
            };
            where.endTime = {
                lte: new Date(`${filters.endDate} 23:59:59`),
            };
        }

        return await prisma.manualTime.findMany({
            where,
            include: {
                employee: {
                    select: { fullName: true }
                }
            },
            orderBy: { startTime: 'desc' }
        });
    },

    getShifts: async (organizationId, filters = {}) => {
        const where = { organizationId };
        if (filters.employeeId) where.employeeId = filters.employeeId;
        if (filters.startDate && filters.endDate) {
            where.date = {
                gte: new Date(filters.startDate),
                lte: new Date(filters.endDate),
            };
        }

        return await prisma.shift.findMany({
            where,
            include: {
                employee: { select: { fullName: true } }
            },
            orderBy: { date: 'asc' }
        });
    },

    createShift: async (data) => {
        const shift = await prisma.shift.create({
            data: {
                employeeId: data.employeeId,
                organizationId: data.organizationId,
                startTime: data.startTime,
                endTime: data.endTime,
                date: new Date(data.date),
            },
            include: { employee: { select: { fullName: true } } }
        });

        // Emit real-time event
        const io = getIO();
        if (io) {
            io.to(`org_${data.organizationId}`).emit('attendance:update', { employeeId: data.employeeId, type: 'shift-new' });
        }

        return shift;
    },

    createTimeOff: async (data) => {
        const timeOff = await prisma.timeOff.create({
            data: {
                employeeId: data.employeeId,
                organizationId: data.organizationId,
                startDate: new Date(data.startDate),
                endDate: new Date(data.endDate),
                type: data.type || 'Days',
                timeOffType: data.timeOffType || null,
                timezone: data.timezone || null,
                note: data.note || null,
                singleDay: data.singleDay || false,
            },
            include: { employee: { select: { fullName: true } } }
        });

        // Emit real-time event
        const io = getIO();
        if (io) {
            io.to(`org_${data.organizationId}`).emit('attendance:update', { employeeId: data.employeeId, type: 'time-off-new' });
        }

        return timeOff;
    },

    getTimeOffs: async (organizationId, filters = {}) => {
        const where = { organizationId };
        if (filters.employeeId) where.employeeId = filters.employeeId;
        if (filters.startDate && filters.endDate) {
            where.startDate = { lte: new Date(filters.endDate) };
            where.endDate = { gte: new Date(filters.startDate) };
        }

        return await prisma.timeOff.findMany({
            where,
            include: { employee: { select: { fullName: true } } },
            orderBy: { startDate: 'asc' }
        });
    },

    startBreak: async (employeeId, organizationId) => {
        // Validation: Ensure valid IDs are passed
        if (!employeeId || employeeId === '') {
            console.error('[AttendanceService] startBreak failed: employeeId is missing or empty');
            throw new Error('Employee ID is required to start a break');
        }
        if (!organizationId) {
            console.warn('[AttendanceService] startBreak: organizationId is missing, using default');
        }

        console.log(`[AttendanceService] Starting break for employee: ${employeeId}, org: ${organizationId}`);

        try {
            // Update employee status to BREAK (Must match Enum exactly: BREAK)
            // Guard: Ensure not deactivated
            const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { status: true } });
            if (emp && emp.status === 'DEACTIVATED') {
                throw new Error('Deactivated employees cannot start a break');
            }

            await prisma.employee.update({
                where: { id: employeeId },
                data: { status: 'BREAK' }
            });

            // Create an activity log for the break start
            const log = await prisma.activityLog.create({
                data: {
                    employeeId,
                    organizationId: organizationId || 'default-org-id',
                    activityType: 'BREAK',
                    productivity: 'NEUTRAL',
                    duration: 0,
                    timestamp: new Date(),
                    appWebsite: 'Break'
                }
            });

            // Find active attendance and append an open break
            const activeAttendance = await prisma.attendance.findFirst({
                where: { employeeId, clockOut: null },
                orderBy: { clockIn: 'desc' }
            });

            if (activeAttendance) {
                const breaksArray = Array.isArray(activeAttendance.breaks) ? activeAttendance.breaks : [];
                breaksArray.push({
                    start: new Date().toISOString(),
                    end: null,
                    duration: 0
                });
                await prisma.attendance.update({
                    where: { id: activeAttendance.id },
                    data: { breaks: breaksArray }
                });
            }

            // Notify real-time
            updateSessionStatus(employeeId, 'BREAK');

            // Fetch employee name for notification
            const empForNotif = await prisma.employee.findUnique({ where: { id: employeeId }, select: { fullName: true } });

            const io = getIO();
            if (io) {
                io.to(`org_${organizationId}`).emit('attendance:update', { 
                    employeeId, 
                    type: 'BREAK_START',
                    employeeName: empForNotif?.fullName || 'An employee'
                });
                io.to(`employee_${employeeId}`).emit('agent:pause');
            }

            return log;
        } catch (error) {
            console.error('[AttendanceService] startBreak Error:', error);
            // Hint for common enum error
            if (error.message.includes('Value \'\' not found in enum')) {
                console.error('[AttendanceService] Critical error: An enum field (likely EmployeeStatus) is being set to an empty string. Please check database data.');
            }
            throw error;
        }
    },

    endBreak: async (employeeId) => {
        if (!employeeId || employeeId === '') {
            console.error('[AttendanceService] endBreak failed: employeeId is missing or empty');
            throw new Error('Employee ID is required to end a break');
        }

        // Fetch employee to get organizationId for socket
        const employee = await prisma.employee.findUnique({
            where: { id: employeeId },
            select: { organizationId: true }
        });

        if (!employee) {
            throw new Error('Employee not found');
        }

        console.log(`[AttendanceService] Ending break for employee: ${employeeId}, org: ${employee.organizationId}`);

        try {
            // Update employee status back to ACTIVE (Guard: Ensure not deactivated)
            const empInfo = await prisma.employee.findUnique({ where: { id: employeeId }, select: { status: true } });
            if (empInfo && empInfo.status !== 'DEACTIVATED') {
                await prisma.employee.update({
                    where: { id: employeeId },
                    data: { status: 'ACTIVE' }
                });
            }

            // Find the last BREAK activity log for this employee that has 0 duration
            const lastBreak = await prisma.activityLog.findFirst({
                where: {
                    employeeId,
                    activityType: 'BREAK',
                    duration: 0
                },
                orderBy: { timestamp: 'desc' }
            });

            if (lastBreak) {
                const now = new Date();
                const duration = Math.floor((now - lastBreak.timestamp) / 1000);
                await prisma.activityLog.update({
                    where: { id: lastBreak.id },
                    data: { duration }
                });
            }

            // Find active attendance and close the open break
            const activeAttendance = await prisma.attendance.findFirst({
                where: { employeeId, clockOut: null },
                orderBy: { clockIn: 'desc' }
            });

            if (activeAttendance && Array.isArray(activeAttendance.breaks) && activeAttendance.breaks.length > 0) {
                const breaksArray = activeAttendance.breaks;
                const lastBreak = breaksArray[breaksArray.length - 1];
                if (!lastBreak.end) {
                    const now = new Date();
                    lastBreak.end = now.toISOString();
                    lastBreak.duration = Math.floor((now - new Date(lastBreak.start)) / 1000);
                    
                    await prisma.attendance.update({
                        where: { id: activeAttendance.id },
                        data: { 
                            breaks: breaksArray,
                            totalBreakDuration: (activeAttendance.totalBreakDuration || 0) + lastBreak.duration
                        }
                    });
                }
            }

            // Notify real-time
            updateSessionStatus(employeeId, 'ACTIVE');

            const io = getIO();
            if (io) {
                io.to(`org_${employee.organizationId}`).emit('attendance:update', { 
                    employeeId, 
                    type: 'BREAK_END',
                    employeeName: (await prisma.employee.findUnique({ where: { id: employeeId }, select: { fullName: true } }))?.fullName || 'An employee'
                });
                io.to(`employee_${employeeId}`).emit('agent:resume');
            }

            return { success: true };
        } catch (error) {
            console.error('[AttendanceService] endBreak Error:', error);
            throw error;
        }
    }
};

module.exports = attendanceService;
