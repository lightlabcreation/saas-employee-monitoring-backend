const prisma = require('../../config/db');

/**
 * Get payroll summary for an organization
 */
const getPayrollSummary = async (organizationId, params = {}) => {
    const { userId, teamId, startDate, endDate } = params;
    
    // Default: current month
    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const employeeWhere = { 
        organizationId,
        role: 'EMPLOYEE'  // Only include actual employees, not ADMIN or MANAGER
    };
    if (userId) {
        employeeWhere.OR = [
            { id: userId },
            { user: { id: userId } }
        ];
    } else if (teamId) {
        employeeWhere.teamId = teamId;
    }

    const employees = await prisma.employee.findMany({
        where: employeeWhere,
        include: {
            attendance: {
                where: { date: { gte: start, lte: end } }
            },
            manualTimeEntries: {
                where: {
                    startTime: { gte: start },
                    endTime: { lte: end }
                }
            }
        }
    });

    let totalGross = 0;
    let totalHours = 0;
    
    employees.forEach(emp => {
        // Attendance hours - Use netWorkingDuration
        const attSeconds = emp.attendance.reduce((acc, a) => {
            if (a.netWorkingDuration > 0) return acc + a.netWorkingDuration;
            if (a.clockIn && a.clockOut) {
                return acc + Math.floor((new Date(a.clockOut) - new Date(a.clockIn)) / 1000) - (a.totalBreakDuration || 0);
            }
            if (a.clockIn && !a.clockOut) {
                return acc + Math.floor((new Date() - new Date(a.clockIn)) / 1000) - (a.totalBreakDuration || 0);
            }
            return acc;
        }, 0);

        // Manual time hours
        const manualSeconds = (emp.manualTimeEntries || []).reduce((acc, m) => acc + (m.duration || 0), 0);
        const empHours = (attSeconds + manualSeconds) / 3600;
        const rate = typeof emp.hourlyRate === 'number' && emp.hourlyRate > 0 ? emp.hourlyRate : 0;

        totalHours += empHours;
        totalGross += empHours * rate;
    });

    const avgRate = employees.length > 0
        ? employees.reduce((acc, e) => acc + (typeof e.hourlyRate === 'number' && e.hourlyRate > 0 ? e.hourlyRate : 0), 0) / employees.length
        : 0;

    return {
        totalPayroll: Math.round(totalGross * 100) / 100,
        avgHourlyRate: Math.round(avgRate * 10) / 10,
        staffCount: employees.length,
        trend: 5.2,
        avgRateTrend: 1.2
    };
};

/**
 * Get payroll records for employees with timesheets & rates
 */
const getPayrollRecords = async (organizationId, startDate, endDate, params = {}) => {
    const { userId, teamId } = params;
    
    // Default: current month
    const now = new Date();
    const start = startDate instanceof Date ? startDate : (startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1));
    start.setHours(0, 0, 0, 0);
    const end = endDate instanceof Date ? endDate : (endDate ? new Date(endDate) : new Date());
    end.setHours(23, 59, 59, 999);

    const employeeWhere = { 
        organizationId,
        role: 'EMPLOYEE'  // Only include actual employees, not ADMIN or MANAGER
    };
    if (userId) {
        employeeWhere.OR = [
            { id: userId },
            { user: { id: userId } }
        ];
    } else if (teamId) {
        employeeWhere.teamId = teamId;
    }

    const employees = await prisma.employee.findMany({
        where: employeeWhere,
        include: {
            attendance: {
                where: { date: { gte: start, lte: end } }
            },
            manualTimeEntries: {
                where: {
                    startTime: { gte: start },
                    endTime: { lte: end }
                }
            },
            team: { select: { name: true } },
            organization: { select: { legalName: true } }
        }
    });

    return employees.map(emp => {
        // Attendance (clock-in/out) seconds - Use netWorkingDuration
        const attSeconds = emp.attendance.reduce((acc, a) => {
            if (a.netWorkingDuration > 0) return acc + a.netWorkingDuration;
            if (a.clockIn && a.clockOut) {
                return acc + Math.floor((new Date(a.clockOut) - new Date(a.clockIn)) / 1000) - (a.totalBreakDuration || 0);
            }
            if (a.clockIn && !a.clockOut) {
                return acc + Math.floor((new Date() - new Date(a.clockIn)) / 1000) - (a.totalBreakDuration || 0);
            }
            return acc;
        }, 0);
        
        // Manual time seconds
        const manualSeconds = (emp.manualTimeEntries || []).reduce((acc, m) => acc + (m.duration || 0), 0);
        const totalSeconds = attSeconds + manualSeconds;
        const totalHours = Math.round((totalSeconds / 3600) * 100) / 100;

        // Calculate overtime: anything over 8h/day is OT
        const workDays = emp.attendance.length;
        const regularSeconds = workDays * 8 * 3600;
        const overtimeSeconds = Math.max(0, attSeconds - regularSeconds);
        const overtimeHours = Math.round((overtimeSeconds / 3600) * 100) / 100;

        const payType = emp.payType || (emp.monthlyRate > 0 ? 'MONTHLY' : 'HOURLY');
        const rate = typeof emp.hourlyRate === 'number' && emp.hourlyRate > 0 ? emp.hourlyRate : 25;
        const mRate = typeof emp.monthlyRate === 'number' && emp.monthlyRate > 0 ? emp.monthlyRate : Math.round(rate * 160);
        
        const grossPay = payType === 'MONTHLY' 
            ? mRate 
            : Math.round(totalHours * rate * 100) / 100;
        const deductions = 0;
        const netPay = grossPay;

        // Calculate 1-month Pay Period (e.g. Aug 13 – Sep 13, 2026)
        const pStart = emp.createdAt ? new Date(emp.createdAt) : start;
        const pEnd = new Date(pStart);
        pEnd.setMonth(pEnd.getMonth() + 1);
        const periodLabel = `${pStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${pEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

        return {
            id: emp.id,
            employee: emp.fullName,
            role: emp.role,
            team: emp.team?.name || 'Software Team',
            organizationName: emp.organization?.legalName || 'Insightful Corp',
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.fullName)}&background=random`,
            period: periodLabel,
            totalHours,
            overTime: overtimeHours,
            payType,
            hourlyRate: rate,
            monthlyRate: mRate,
            grossPay,
            deductions,
            netPay,
            status: (totalHours > 0 || payType === 'MONTHLY') ? 'Ready' : 'Pending',
        };
    });
};

const { sendMail } = require('../../utils/email.service');

const sendSalarySlip = async (data, employee, orgName) => {
    const { period, hourlyRate, totalHours, overTime, grossPay, deductions, netPay } = data;
    const recipientEmail = employee.email;

    if (!recipientEmail) {
        throw new Error('Employee email not found');
    }

    const periodLabel = period || 'Current Pay Period';

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
            <div style="background-color: #001B6D; color: white; padding: 24px; text-align: center;">
                <h1 style="margin: 0; font-size: 20px; font-weight: bold; text-transform: uppercase;">${orgName || 'Kiaan Technology'}</h1>
                <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9;">Salary Slip Statement</p>
            </div>
            
            <div style="padding: 24px; background-color: #ffffff;">
                <div style="margin-bottom: 20px; border-bottom: 1px solid #f1f5f9; padding-bottom: 16px;">
                    <p style="margin: 0 0 6px 0; font-size: 14px; color: #64748b;">Employee Name: <strong style="color: #0f172a;">${employee.fullName}</strong></p>
                    <p style="margin: 0 0 6px 0; font-size: 14px; color: #64748b;">Role: <strong style="color: #0f172a;">${employee.role}</strong></p>
                    <p style="margin: 0; font-size: 14px; color: #64748b;">Pay Period: <strong style="color: #0f172a;">${periodLabel}</strong></p>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
                    <thead>
                        <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                            <th style="padding: 10px; text-align: left; font-weight: bold; color: #475569;">Description</th>
                            <th style="padding: 10px; text-align: right; font-weight: bold; color: #475569;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 10px; color: #334155;">Regular Pay (${totalHours}h @ $${hourlyRate}/hr)</td>
                            <td style="padding: 10px; text-align: right; color: #0f172a; font-weight: bold;">$${parseFloat(grossPay).toFixed(2)}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 10px; color: #334155;">Overtime (${overTime || 0}h)</td>
                            <td style="padding: 10px; text-align: right; color: #0f172a; font-weight: bold;">$0.00</td>
                        </tr>
                    </tbody>
                </table>

                <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 15px; font-weight: bold; color: #166534;">NET PAYABLE:</span>
                    <span style="font-size: 20px; font-weight: 800; color: #15803d;">$${parseFloat(netPay || grossPay).toFixed(2)}</span>
                </div>
            </div>

            <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-t: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
                This is an automated salary slip. For queries, contact HR support.
            </div>
        </div>
    `;

    const info = await sendMail({
        to: recipientEmail,
        subject: `Salary Slip - ${periodLabel}`,
        html
    });

    return {
        emailSent: true,
        recipient: recipientEmail,
        messageId: info?.messageId || 'sent'
    };
};

module.exports = {
  getPayrollSummary,
  getPayrollRecords,
  sendSalarySlip
};
