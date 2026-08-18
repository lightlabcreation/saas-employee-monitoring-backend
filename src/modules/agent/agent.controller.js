const agentService = require('./agent.service');
const { successResponse, errorResponse } = require('../../utils/response');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const prisma = require('../../config/db');
const { getIO } = require('../../socket/server');
const { getOrganizationId } = require('../../utils/orgId');

const invitationService = require('../auth/invitation.service');
const newInvitationService = require('../invitations/invitations.service');

const register = async (req, res) => {
    try {
        const { employeeId, email, password, name, deviceId, systemInfo, inviteToken, organizationCode } = req.body;
        
        let targetEmployeeId = employeeId;
        let user = null;
        let isPersonal = false;
        let organizationId = null;

        if (!email || !deviceId) {
            return errorResponse(res, 'Email and Device ID are required', 400);
        }

        // 1. Personal Computer Invitation Flow (Phase 5)
        if (inviteToken) {
            isPersonal = true;
            try {
                // Validate invitation token & password (from Phase 3 set password)
                const inviteData = await newInvitationService.validateInvitationToken(inviteToken);
                if (inviteData.employeeEmail.toLowerCase() !== email.toLowerCase()) {
                    return errorResponse(res, 'Email does not match the invited address', 400);
                }

                // Verify password against the password saved in Phase 3
                const dbInvite = await prisma.invitation.findUnique({ where: { token: inviteToken } });
                if (!dbInvite || !dbInvite.password) {
                    return errorResponse(res, 'Account activation password not found. Please activate your account first.', 400);
                }

                const isPasswordValid = await bcrypt.compare(password, dbInvite.password);
                if (!isPasswordValid) {
                    return errorResponse(res, 'Invalid password. Please use the password you created during activation.', 401);
                }

                targetEmployeeId = inviteData.employeeId;
                organizationId = inviteData.organizationId;

                // Create or update User login account (Phase 5: Create employee login account)
                user = await prisma.user.findUnique({ where: { email } });
                if (!user) {
                    user = await prisma.user.create({
                        data: {
                            email,
                            password: dbInvite.password, // already hashed
                            role: 'EMPLOYEE',
                            employeeId: targetEmployeeId
                        }
                    });
                } else {
                    await prisma.user.update({
                        where: { email },
                        data: {
                            password: dbInvite.password,
                            employeeId: targetEmployeeId
                        }
                    });
                }

                // Activate employee profile & set deviceOwnership = PERSONAL_DEVICE
                await prisma.employee.update({
                    where: { id: targetEmployeeId },
                    data: {
                        status: 'ACTIVE',
                        deviceOwnership: 'PERSONAL_DEVICE',
                        computerType: 'PERSONAL'
                    }
                });

                // Mark invitation as used (ACTIVATED, usedAt = now)
                await prisma.invitation.update({
                    where: { token: inviteToken },
                    data: {
                        status: 'ACTIVATED',
                        usedAt: new Date()
                    }
                });
            } catch (invErr) {
                return errorResponse(res, invErr.message, 400);
            }
        } 
        // 2. Company Computer Activation Code Flow (Phase 8)
        else if (organizationCode) {
            // Find organization by workspaceId (Organization Code)
            const org = await prisma.organization.findUnique({
                where: { workspaceId: organizationCode }
            });
            if (!org) {
                return errorResponse(res, 'Invalid Organization Activation Code', 400);
            }
            organizationId = org.id;

            // Find or create employee
            let existingEmployee = await prisma.employee.findUnique({ where: { email } });
            if (!existingEmployee) {
                existingEmployee = await prisma.employee.create({
                    data: {
                        fullName: name || email.split('@')[0],
                        email,
                        organizationId,
                        role: 'EMPLOYEE',
                        status: 'ACTIVE',
                        computerType: 'COMPANY',
                        deviceOwnership: 'COMPANY_DEVICE'
                    }
                });
            } else {
                existingEmployee = await prisma.employee.update({
                    where: { id: existingEmployee.id },
                    data: {
                        status: 'ACTIVE',
                        deviceOwnership: 'COMPANY_DEVICE',
                        computerType: 'COMPANY'
                    }
                });
            }
            targetEmployeeId = existingEmployee.id;

            // Create User record if password is provided
            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                user = await prisma.user.findUnique({ where: { email } });
                if (!user) {
                    await prisma.user.create({
                        data: {
                            email,
                            password: hashedPassword,
                            role: 'EMPLOYEE',
                            employeeId: targetEmployeeId
                        }
                    });
                } else {
                    await prisma.user.update({
                        where: { email },
                        data: {
                            password: hashedPassword,
                            employeeId: targetEmployeeId
                        }
                    });
                }
            }
        } 
        // 3. Company Computer Email + Password Flow (Phase 8 fallback)
        else {
            if (!password) {
                return errorResponse(res, 'Password is required', 400);
            }

            // ── INVITATION FALLBACK ──────────────────────────────────────────────
            // Agar User table mein account nahi hai, toh check karo ki koi
            // pending invitation toh nahi hai is email ke liye (jab employee ne
            // activate page pe password set kiya ho lekin inviteToken agent ko
            // nahi mila — e.g. agent direct open kiya bina deep-link ke)
            user = await prisma.user.findUnique({
                where: { email },
                include: { employee: true }
            });

            if (!user) {
                // Check pending invitation with a saved password (set on activate page)
                const pendingInvitation = await prisma.invitation.findFirst({
                    where: {
                        employee: { email },
                        status: 'PENDING',
                        password: { not: null }
                    },
                    include: {
                        employee: true
                    }
                });

                if (pendingInvitation) {
                    // Verify password against the one set on the activate page
                    const isPasswordValid = await bcrypt.compare(password, pendingInvitation.password);
                    if (!isPasswordValid) {
                        return errorResponse(res, 'Invalid password. Please use the password you created during activation.', 401);
                    }

                    targetEmployeeId = pendingInvitation.employeeId;
                    organizationId = pendingInvitation.organizationId;

                    // Create User login account (same as Flow 1)
                    user = await prisma.user.findUnique({ where: { email } });
                    if (!user) {
                        user = await prisma.user.create({
                            data: {
                                email,
                                password: pendingInvitation.password, // already hashed
                                role: 'EMPLOYEE',
                                employeeId: targetEmployeeId
                            }
                        });
                    }

                    // Activate employee profile
                    await prisma.employee.update({
                        where: { id: targetEmployeeId },
                        data: {
                            status: 'ACTIVE',
                            deviceOwnership: 'PERSONAL_DEVICE',
                            computerType: 'PERSONAL'
                        }
                    });

                    // Mark invitation as ACTIVATED
                    await prisma.invitation.update({
                        where: { id: pendingInvitation.id },
                        data: {
                            status: 'ACTIVATED',
                            usedAt: new Date()
                        }
                    });

                    // Skip rest of Flow 3 — jump straight to agent registration
                    const existingDeviceAgentEarly = await prisma.agent.findUnique({ where: { deviceId } });
                    if (existingDeviceAgentEarly && existingDeviceAgentEarly.employeeId !== targetEmployeeId) {
                        await prisma.agent.delete({ where: { deviceId } });
                    }
                    const agent = await agentService.registerAgent(targetEmployeeId, deviceId, systemInfo);
                    const agentToken = Buffer.from(`${targetEmployeeId}:${deviceId}:INSIGHTFUL`).toString('base64');
                    return successResponse(res, { agent, token: agentToken }, 'Agent registration received and active');
                }

                return errorResponse(res, 'Account not found. Please verify your email or use your invitation link.', 401);
            }

            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                return errorResponse(res, 'Invalid password. Please use your portal login credentials.', 401);
            }

            if (!user.employee) {
                let existingEmployee = await prisma.employee.findUnique({ where: { email } });
                if (!existingEmployee) {
                    const org = await prisma.organization.findFirst();
                    existingEmployee = await prisma.employee.create({
                        data: {
                            fullName: name || email.split('@')[0],
                            email,
                            organizationId: org ? org.id : 'default-org-id',
                            role: 'EMPLOYEE',
                            status: 'ACTIVE',
                            computerType: 'COMPANY',
                            deviceOwnership: 'COMPANY_DEVICE'
                        }
                    });
                } else {
                    existingEmployee = await prisma.employee.update({
                        where: { id: existingEmployee.id },
                        data: {
                            status: 'ACTIVE',
                            deviceOwnership: 'COMPANY_DEVICE',
                            computerType: 'COMPANY'
                        }
                    });
                }
                
                await prisma.user.update({
                    where: { id: user.id },
                    data: { employeeId: existingEmployee.id }
                });
                targetEmployeeId = existingEmployee.id;
            } else {
                targetEmployeeId = user.employee.id;
                // Automatically update existing employee to Company device
                await prisma.employee.update({
                    where: { id: targetEmployeeId },
                    data: {
                        deviceOwnership: 'COMPANY_DEVICE',
                        computerType: 'COMPANY',
                        status: 'ACTIVE'
                    }
                });
            }
        }

        // Register / Link Device
        // Clear any existing agent on this device to prevent duplicate key constraint
        const existingDeviceAgent = await prisma.agent.findUnique({
            where: { deviceId }
        });
        
        if (existingDeviceAgent && existingDeviceAgent.employeeId !== targetEmployeeId) {
            console.log(`Removing old agent record for device: ${deviceId} (previously employee: ${existingDeviceAgent.employeeId})`);
            await prisma.agent.delete({ where: { deviceId } });
        }

        // Register Agent (set as active/approved immediately for onboarding system)
        const agent = await agentService.registerAgent(targetEmployeeId, deviceId, systemInfo);
        
        // Simple base64 token for agent security
        const agentToken = Buffer.from(`${targetEmployeeId}:${deviceId}:INSIGHTFUL`).toString('base64');
        
        return successResponse(res, { agent, token: agentToken }, 'Agent registration received and active');
    } catch (error) {
        console.error('Agent register error:', error);
        return errorResponse(res, error.message || 'Failed to register agent', 500);
    }
};

const heartbeat = async (req, res) => {
    try {
        const { deviceId } = req.body;
        if (!deviceId) return errorResponse(res, 'Device ID is required', 400);

        const agent = await prisma.agent.findUnique({ where: { deviceId } });
        if (!agent) return errorResponse(res, 'Agent not found', 404);

        // Check if Approved
        if (agent.status !== 'active') {
            return errorResponse(res, 'Agent is not approved. Please contact admin.', 403);
        }

        await agentService.heartbeat(deviceId);
        return successResponse(res, null, 'Heartbeat received');
    } catch (error) {
        console.error('Agent heartbeat error:', error);
        return errorResponse(res, error.message || 'Heartbeat failed', 500);
    }
};

const logActivity = async (req, res) => {
    try {
        const { employeeId, data } = req.body;
        const authHeader = req.headers['x-agent-auth'] || req.headers['X-Agent-Auth'];

        if (!employeeId || !data) return errorResponse(res, 'Employee ID and Data are required', 400);

        // Check Agent Status
        const agent = await prisma.agent.findUnique({ 
            where: { employeeId },
            include: { employee: true }
        });
        if (!agent || agent.status !== 'active') {
            return errorResponse(res, 'Agent is not active or approved', 403);
        }

        const organizationId = agent.employee.organizationId;

        // Token verification
        if (!authHeader) return errorResponse(res, 'Unauthorized', 401);
        const decoded = Buffer.from(authHeader, 'base64').toString('ascii');
        if (!decoded.includes(employeeId) || !decoded.includes('INSIGHTFUL')) {
            return errorResponse(res, 'Unauthorized', 401);
        }

        const logResult = await agentService.logActivity(employeeId, data);

        // Emit Real-time Socket Events
        const io = getIO();
        if (io && organizationId) {
            const room = `org_${organizationId}`;
            
            // 1. Notify about new screenshot
            if (logResult?.screenshotSaved && logResult?.finalScreenshotUrl) {
                io.to(room).emit('screenshot:new', {
                    employeeId,
                    imageUrl: logResult.finalScreenshotUrl,
                    capturedAt: data.timestamp || new Date(),
                    productivity: 'NEUTRAL',
                    employeeName: agent.employee.fullName
                });
            } else if (data.screenshotUrl) {
                // Helps debug live mismatch: agent sent screenshot but DB/storage save failed.
                console.warn(`[AgentController] Screenshot event skipped (not persisted) for employee ${employeeId}`);
            }

            // 2. Update activity stream (resolved app name from service)
            io.to(room).emit('activity:update', {
                employeeId,
                activeApp: logResult?.cleanAppName || data.activeApp || 'Unknown',
                activeWindow: data.activeWindow || 'Unknown',
                idleTime: data.idleTime || 0,
                productivity: logResult?.productivity || 'NEUTRAL',
                location: data.location ? `${data.location.city}, ${data.location.country}` : 'Remote',
                timestamp: new Date()
            });

            // 3. Ensure employee shows as ONLINE
            io.to(room).emit('employee:status', {
                employeeId,
                status: (data.idleTime || 0) > 60 ? 'idle' : 'online'
            });
        }

        return successResponse(res, null, 'Activity logged');
    } catch (error) {
        console.error('Agent logActivity error:', error);
        return errorResponse(res, error.message || 'Failed to log activity', 500);
    }
};

const getVersion = async (req, res) => {
    try {
        const packageJsonPath = path.join(__dirname, '../../../../agent-source/package.json');
        let version = '1.0.2';
        if (fs.existsSync(packageJsonPath)) {
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            version = pkg.version || '1.0.2';
        }
        
        return successResponse(res, {
            version,
            buildNumber: '1',
            releaseDate: '2026-06-01',
            downloadUrl: '/api/agent/download'
        }, 'Agent version retrieved');
    } catch (error) {
        console.error('Agent getVersion error:', error);
        return errorResponse(res, 'Failed to get version metadata', 500);
    }
};

const getHealth = async (req, res) => {
    return successResponse(res, { status: 'healthy' }, 'Agent health checked successfully');
};

const downloadAgent = async (req, res) => {
    try {
        const filePath = path.join(__dirname, '../../../public/agent/EMS-Tracker-latest.exe');
        
        if (!fs.existsSync(filePath)) {
            return errorResponse(res, 'Agent installer not found. Please contact administrator.', 404);
        }
        
        res.download(filePath, 'EMS-Tracker-latest.exe');
    } catch (error) {
        console.error('Agent download error:', error);
        return errorResponse(res, 'Failed to download agent', 500);
    }
};

const getRecordingSettingsForEmployee = async (employeeId) => {
    try {
        const employee = await prisma.employee.findUnique({
            where: { id: employeeId },
            include: { organization: true }
        });

        if (!employee) return null;

        const isEnabled = !!employee.organization.screenRecordingEnabled;

        return {
            RECORDING_ENABLED: isEnabled,
            RECORDING_CHUNK_MINUTES: parseInt(process.env.RECORDING_CHUNK_MINUTES, 10) || 5,
            RECORDING_FPS: parseInt(process.env.RECORDING_FPS, 10) || 10,
            RECORDING_WIDTH: parseInt(process.env.RECORDING_WIDTH, 10) || 1280,
            RECORDING_HEIGHT: parseInt(process.env.RECORDING_HEIGHT, 10) || 720,
            RECORDING_BITRATE: parseInt(process.env.RECORDING_BITRATE, 10) || 500000,
            MAX_LOCAL_RECORDING_STORAGE: parseInt(process.env.MAX_LOCAL_RECORDING_STORAGE, 10) || 1024 * 1024 * 1024,
            UPLOAD_RETRY_COUNT: parseInt(process.env.UPLOAD_RETRY_COUNT, 10) || 3
        };
    } catch (e) {
        console.error('Error fetching recording settings:', e);
        return null;
    }
};

const getStatus = async (req, res) => {
    try {
        const employeeId = req.params.employeeId || req.user.employeeId;
        const status = await agentService.getAgentStatus(employeeId);
        
        if (status.status === 'missing') {
            return errorResponse(res, 'Agent record not found', 404);
        }

        const recordingSettings = await getRecordingSettingsForEmployee(employeeId);

        let trackingEnabled = true;

        // Dynamic Personal Computer Rule: 
        // If PERSONAL_DEVICE, tracking is paused (trackingEnabled: false) when clocked out or on break
        if (status.status === 'active') {
            const employee = await prisma.employee.findUnique({
                where: { id: employeeId },
                include: {
                    attendance: {
                        where: {
                            clockOut: null
                        },
                        orderBy: { clockIn: 'desc' },
                        take: 1
                    }
                }
            });

            if (employee && employee.deviceOwnership === 'PERSONAL_DEVICE') {
                const todayAttendance = employee.attendance[0];
                const isClockedIn = todayAttendance && todayAttendance.clockIn && !todayAttendance.clockOut;
                const isOnBreak = employee.status?.toUpperCase() === 'BREAK';

                if (!isClockedIn || isOnBreak) {
                    trackingEnabled = false;
                }
            }
        }
        
        return successResponse(res, {
            ...status,
            status: 'active', // Force active status to bypass awaiting approval UI
            trackingEnabled,
            recordingSettings
        }, 'Agent status retrieved');
    } catch (error) {
        console.error('Get agent status error:', error);
        return errorResponse(res, error.message || 'Failed to get status', 500);
    }
};

const listAgents = async (req, res) => {
    try {
        const organizationId = await getOrganizationId(req);
        const agents = await agentService.getAllAgents(organizationId);
        return successResponse(res, agents, 'Agents list retrieved');
    } catch (error) {
        console.error('List agents error:', error);
        return errorResponse(res, error.message || 'Failed to list agents', 500);
    }
};

const checkDevice = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const agent = await agentService.findAgentByDeviceId(deviceId);
        
        if (!agent) {
            return errorResponse(res, 'Device not registered', 404);
        }

        const agentToken = Buffer.from(`${agent.employeeId}:${agent.deviceId}:INSIGHTFUL`).toString('base64');
        const recordingSettings = await getRecordingSettingsForEmployee(agent.employeeId);

        return successResponse(res, {
            employeeId: agent.employeeId,
            employeeName: agent.employee.fullName,
            employeeEmail: agent.employee.email,
            status: agent.status,
            token: agentToken,
            recordingSettings
        }, 'Device recognized');
    } catch (error) {
        console.error('Check device error:', error);
        return errorResponse(res, error.message || 'Check failed', 500);
    }
};

const updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const agent = await agentService.updateAgentStatus(id, status);
        
        // If approved, notify the agent immediately via socket
        if (status === 'active') {
            const io = getIO();
            if (io) {
                console.log(`Emitting agent:approved for employee: ${agent.employeeId}`);
                io.to(`employee_${agent.employeeId}`).emit('agent:approved');
                
                // Also notify dashboard
                io.to(`org_${agent.organizationId || 'default'}`).emit('employee:status', {
                    employeeId: agent.employeeId,
                    status: 'online'
                });
            }
        }

        res.status(200).json({ success: true, data: agent });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const update = async (req, res) => {
    try {
        const { id } = req.params;
        const agent = await agentService.updateAgent(id, req.body);
        return successResponse(res, agent, 'Agent and employee updated successfully');
    } catch (error) {
        return errorResponse(res, error.message || 'Update failed', 500);
    }
};

const remove = async (req, res) => {
// ... existing code ...
};

const stopTracking = async (req, res) => {
    try {
        const { employeeId } = req.body;
        if (!employeeId) return errorResponse(res, 'Employee ID is required', 400);

        await agentService.stopTracking(employeeId);
        return successResponse(res, null, 'Tracking stopped and employee clocked out');
    } catch (error) {
        console.error('Agent stopTracking error:', error);
        return errorResponse(res, error.message || 'Stop tracking failed', 500);
    }
};

module.exports = {
    register,
    heartbeat,
    logActivity,
    downloadAgent,
    getVersion,
    getHealth,
    getStatus,
    listAgents,
    updateStatus,
    update,
    remove,
    checkDevice,
    stopTracking
};
