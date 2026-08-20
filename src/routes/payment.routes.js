const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const Razorpay = require('razorpay');
const prisma = require('../config/db');
const { generateToken } = require('../utils/jwt');
const { successResponse, errorResponse } = require('../utils/response');
const authMiddleware = require('../middlewares/auth.middleware');

// Initialize Razorpay client with keys
const razorpay = new Razorpay({
    key_id: 'rzp_live_T2CGGz8NLUuopj',
    key_secret: 'CaKT2baCx1GxiPs8LX7cE1Bu'
});

// Helper: Get Price based on Plan Name
const getPriceByPlan = (planName) => {
    if (!planName) return 999;
    const name = planName.toLowerCase();
    if (name.includes('free') || name.includes('trial') || name.includes('0')) return 0;
    if (name.includes('999') || name.includes('starter')) return 999;
    if (name.includes('1299') || name.includes('growth')) return 1299;
    if (name.includes('1499') || name.includes('pro')) return 1499;
    if (name.includes('custom')) return 0;
    return 999; // Default fallback
};

const LANDING_FEATURED_PLANS = ['7 Days Free Trial', 'Starter', 'Growth', 'Pro', 'Custom Plan'];
const PLAN_DISPLAY_ORDER = {
    '7 days free trial': 1,
    'starter': 2,
    'growth': 3,
    'pro': 4,
    'custom plan': 5,
    'custom': 5
};

const filterAndSortLandingPlans = (plansList, currentPlan = null) => {
    const filtered = plansList.filter(p => {
        const matchesLanding = LANDING_FEATURED_PLANS.some(fn => p.name.toLowerCase() === fn.toLowerCase());
        const isCurrent = currentPlan && p.id === currentPlan.id;
        return matchesLanding || isCurrent;
    });

    return filtered.sort((a, b) => {
        const orderA = PLAN_DISPLAY_ORDER[a.name.toLowerCase()] || 99;
        const orderB = PLAN_DISPLAY_ORDER[b.name.toLowerCase()] || 99;
        return orderA - orderB;
    });
};

/**
 * GET /api/payments/plans
 * Get all available active plans matching landing page
 */
router.get('/plans', async (req, res) => {
    try {
        const rawPlans = await prisma.saasPlan.findMany({
            where: { status: 'ACTIVE' }
        });
        const plans = filterAndSortLandingPlans(rawPlans);
        return successResponse(res, plans, 'Active plans retrieved successfully');
    } catch (err) {
        console.error('Error fetching plans:', err);
        return errorResponse(res, err.message || 'Failed to fetch plans', 500);
    }
});

/**
 * GET /api/payments/my-subscription
 * Get current organization subscription & payment history
 */
router.get('/my-subscription', authMiddleware, async (req, res) => {
    try {
        let organizationId = req.user.organizationId;
        
        if (!organizationId && req.user.employeeId) {
            const emp = await prisma.employee.findUnique({
                where: { id: req.user.employeeId },
                select: { organizationId: true }
            });
            if (emp) organizationId = emp.organizationId;
        }

        if (!organizationId) {
            const userWithEmp = await prisma.user.findUnique({
                where: { id: req.user.userId },
                include: { employee: true }
            });
            if (userWithEmp?.employee?.organizationId) {
                organizationId = userWithEmp.employee.organizationId;
            }
        }

        if (!organizationId) {
            return errorResponse(res, 'Organization not found for current user', 404);
        }

        const subscription = await prisma.saasSubscription.findUnique({
            where: { organizationId }
        });

        let plan = null;
        if (subscription?.planId) {
            plan = await prisma.saasPlan.findUnique({
                where: { id: subscription.planId }
            });
        }

        const payments = await prisma.saasPayment.findMany({
            where: { organizationId },
            orderBy: { paymentDate: 'desc' }
        });

        const employeeCount = await prisma.employee.count({
            where: { organizationId, role: 'EMPLOYEE' }
        });

        const rawPlans = await prisma.saasPlan.findMany({
            where: { status: 'ACTIVE' }
        });

        const allPlans = filterAndSortLandingPlans(rawPlans, plan);

        return successResponse(res, {
            subscription,
            plan,
            payments,
            employeeCount,
            allPlans
        }, 'Subscription details retrieved successfully');
    } catch (err) {
        console.error('Error fetching my subscription:', err);
        return errorResponse(res, err.message || 'Failed to fetch subscription', 500);
    }
});

/**
 * 1. Create Razorpay Order
 * POST /api/payments/create-order
 */
router.post('/create-order', async (req, res) => {
    try {
        const { planName } = req.body;
        if (!planName) {
            return errorResponse(res, 'Plan name is required', 400);
        }

        const price = getPriceByPlan(planName);
        if (price === 0) {
            // Free plan doesn't require Razorpay checkout order
            return successResponse(res, { isFree: true }, 'Free plan - checkout order not required');
        }

        const options = {
            amount: price * 100, // in paise
            currency: 'INR',
            receipt: `rcpt_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);
        return successResponse(res, {
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            isFree: false
        }, 'Order created successfully');
    } catch (err) {
        console.error('Error creating Razorpay order:', err);
        return errorResponse(res, err.message || 'Failed to create order', 500);
    }
});

/**
 * POST /api/payments/verify-upgrade
 * Verify Razorpay payment and upgrade existing Admin organization subscription
 */
router.post('/verify-upgrade', authMiddleware, async (req, res) => {
    try {
        const { planName, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
        if (!planName) {
            return errorResponse(res, 'Plan name is required', 400);
        }

        let organizationId = req.user.organizationId;
        if (!organizationId && req.user.employeeId) {
            const emp = await prisma.employee.findUnique({
                where: { id: req.user.employeeId },
                select: { organizationId: true }
            });
            if (emp) organizationId = emp.organizationId;
        }

        if (!organizationId) {
            const userWithEmp = await prisma.user.findUnique({
                where: { id: req.user.userId },
                include: { employee: true }
            });
            if (userWithEmp?.employee?.organizationId) {
                organizationId = userWithEmp.employee.organizationId;
            }
        }

        if (!organizationId) {
            return errorResponse(res, 'Organization not found for current user', 404);
        }

        const price = getPriceByPlan(planName);

        // Verification step if paid plan
        if (price > 0 && razorpay_payment_id) {
            if (!razorpay_order_id || !razorpay_signature) {
                return errorResponse(res, 'Payment verification details missing', 400);
            }
            const generatedSignature = crypto
                .createHmac('sha256', 'CaKT2baCx1GxiPs8LX7cE1Bu')
                .update(razorpay_order_id + "|" + razorpay_payment_id)
                .digest('hex');

            if (generatedSignature !== razorpay_signature) {
                return errorResponse(res, 'Payment verification failed! Invalid signature.', 400);
            }
        }

        // Find plan from DB
        let dbPlan = await prisma.saasPlan.findFirst({
            where: { name: { equals: planName, mode: 'insensitive' } }
        });
        if (!dbPlan) {
            dbPlan = await prisma.saasPlan.findFirst({
                where: { status: 'ACTIVE' }
            });
        }

        const startDate = new Date();
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + (dbPlan?.duration?.toLowerCase()?.includes('7') ? 7 : 30));

        // Update Subscription
        const updatedSub = await prisma.saasSubscription.upsert({
            where: { organizationId },
            update: {
                planId: dbPlan.id,
                status: 'ACTIVE',
                startDate,
                expiryDate
            },
            create: {
                organizationId,
                planId: dbPlan.id,
                status: 'ACTIVE',
                startDate,
                expiryDate
            }
        });

        // Record Payment invoice
        await prisma.saasPayment.create({
            data: {
                organizationId,
                adminId: req.user.userId || 'admin',
                planId: dbPlan.id,
                amount: price,
                paymentMethod: price === 0 ? 'Free Plan' : 'Razorpay',
                invoiceId: `INV-${Date.now()}`,
                paymentDate: new Date(),
                expiryDate,
                status: 'PAID'
            }
        });

        return successResponse(res, { subscription: updatedSub, plan: dbPlan }, 'Subscription upgraded successfully', 200);
    } catch (err) {
        console.error('Error verifying subscription upgrade:', err);
        return errorResponse(res, err.message || 'Failed to upgrade subscription', 500);
    }
});

/**
 * 2. Verify Payment and Register Company + Admin
 * POST /api/payments/verify-and-register
 */
router.post('/verify-and-register', async (req, res) => {
    try {
        const {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            companyName,
            adminName, // Extracted for Admin name
            city,
            email,
            mobile,
            password,
            selectedPlan,
            startDate
        } = req.body;

        if (!companyName || !email || !password || !selectedPlan) {
            return errorResponse(res, 'Required registration fields are missing', 400);
        }

        // Validate plan price
        const price = getPriceByPlan(selectedPlan);

        // Verification step (Only when Razorpay payment details are explicitly provided)
        if (price > 0) {
            if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
                return errorResponse(res, 'A verified Razorpay payment is required for this plan.', 400);
            }
            // Verify payment signature
            const generated_signature = crypto
                .createHmac('sha256', 'CaKT2baCx1GxiPs8LX7cE1Bu')
                .update(razorpay_order_id + "|" + razorpay_payment_id)
                .digest('hex');

            if (generated_signature !== razorpay_signature) {
                return errorResponse(res, 'Payment verification failed. Invalid signature.', 400);
            }
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return errorResponse(res, 'User already exists with this email address', 400);
        }

        // Encrypt password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Setup dates
        const subStartDate = startDate ? new Date(startDate) : new Date();
        const subExpiryDate = new Date(subStartDate.getTime() + (price === 0 ? 7 : 30) * 24 * 60 * 60 * 1000); // 7 days for Free/Custom, 30 days for Paid

        // Create organization, admin, plan, subscription, payment inside a transaction
        const registrationResult = await prisma.$transaction(async (tx) => {
            // Find or create default SaasPlan matching name
            let plan = await tx.saasPlan.findFirst({
                where: { name: selectedPlan }
            });

            if (!plan) {
                plan = await tx.saasPlan.create({
                    data: {
                        name: selectedPlan,
                        price: price,
                        duration: price === 0 ? '7 Days' : 'Monthly',
                        employeeLimit: price === 0 ? (selectedPlan.includes('Free') ? 5 : 9999) : (selectedPlan.includes('Starter') ? 15 : selectedPlan.includes('Growth') ? 25 : selectedPlan.includes('Pro') ? 40 : 9999),
                        screenshotLimit: price === 0 ? 5 : (selectedPlan.includes('Starter') ? 10 : selectedPlan.includes('Growth') ? 25 : selectedPlan.includes('Pro') ? 50 : 1000),
                        activityTracking: true,
                        productivityReports: true,
                        attendanceModule: true,
                        videoRecording: selectedPlan.includes('Pro') || selectedPlan.includes('Custom'),
                        status: 'ACTIVE'
                    }
                });
            }

            // 1. Create Organization
            const organization = await tx.organization.create({
                data: {
                    legalName: companyName,
                    timeZone: "UTC+5:30 (IST)",
                    workStartTime: "09:00",
                    workEndTime: "18:00",
                    workDays: "Monday,Tuesday,Wednesday,Thursday,Friday"
                }
            });

            // 2. Create Employee
            const employee = await tx.employee.create({
                data: {
                    fullName: adminName || email.split('@')[0], // Use adminName or fallback to username prefix
                    email,
                    role: 'ADMIN',
                    location: city || 'Remote',
                    workMode: 'Remote',
                    organizationId: organization.id,
                    status: 'ACTIVE',
                    hourlyRate: 0.0
                }
            });

            // 3. Create User linked to Employee
            const user = await tx.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    role: 'ADMIN',
                    employeeId: employee.id,
                    name: adminName || email.split('@')[0]
                }
            });

            // 4. Create AdminProfile to store mobile/phone info
            await tx.adminProfile.create({
                data: {
                    userId: user.id,
                    mobile: mobile || 'N/A'
                }
            });

            // 5. Create SaaS Subscription
            await tx.saasSubscription.create({
                data: {
                    organizationId: organization.id,
                    planId: plan.id,
                    status: 'ACTIVE',
                    startDate: subStartDate,
                    expiryDate: subExpiryDate
                }
            });

            // 6. Create SaaS Payment Record
            const invoiceId = `INV-${Date.now()}`;
            await tx.saasPayment.create({
                data: {
                    organizationId: organization.id,
                    adminId: user.id,
                    planId: plan.id,
                    amount: price,
                    paymentMethod: price === 0 ? 'Free Trial' : (razorpay_payment_id ? 'Razorpay' : 'Direct Registration'),
                    invoiceId: invoiceId,
                    paymentDate: new Date(),
                    expiryDate: subExpiryDate,
                    status: 'PAID'
                }
            });

            // Generate Login Token
            const token = generateToken({
                userId: user.id,
                role: user.role,
                employeeId: employee.id,
                organizationId: employee.organizationId
            });

            return {
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    fullName: employee.fullName,
                    name: employee.fullName,
                    employeeId: employee.id,
                    organizationId: employee.organizationId
                }
            };
        });

        // ── Send notification emails (non-blocking — do not fail registration) ──
        const planDisplayPrice  = price === 0 ? 'Free' : `₹${price}`;
        const planPriceFull     = price === 0 ? 'Free (10-Day Trial)' : `₹${price}/month`;
        const paymentStatus     = price === 0 ? 'TRIAL ACTIVE' : 'PAID';
        const transactionId     = razorpay_payment_id || 'N/A (Free Trial)';
        const recipientName     = registrationResult.user?.fullName || adminName || email.split('@')[0];
        const loginUrl          = (process.env.FRONTEND_URL || 'http://localhost:5173') + '/login';

        // Format dates as "DD MMM YYYY"
        const fmtDate = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const startLabel = fmtDate(subStartDate);
        const endLabel   = fmtDate(subExpiryDate);

        // ── 1. Welcome / Subscription Confirmation email → user ────────────────
        const userSubject = `Your subscription to Kiaan Technology Pvt Ltd is confirmed!`;
        const userHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 100%);padding:32px 40px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Employee-Monitor-System</h1>
            <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px;">by Kiaan Technology Pvt Ltd</p>
          </td>
        </tr>

        <!-- Thank You Message -->
        <tr>
          <td style="padding:28px 40px 16px;text-align:center;">
            <p style="margin:0;font-size:15px;color:#334155;line-height:1.6;">
              Thank you for subscribing to <strong>Kiaan Technology Pvt Ltd</strong>!
              Your subscription for <strong>${selectedPlan}</strong> is now confirmed.
              Below are your complete plan, pricing, and validity details.
            </p>
          </td>
        </tr>

        <!-- Plan Card -->
        <tr>
          <td style="padding:0 40px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">

              <!-- Plan Header Row -->
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;">SELECTED PLAN</span><br/>
                        <span style="font-size:17px;font-weight:800;color:#1e293b;margin-top:4px;display:block;">${selectedPlan}</span>
                      </td>
                      <td align="right" valign="middle">
                        <span style="background:#10b981;color:#fff;font-size:15px;font-weight:700;padding:6px 14px;border-radius:20px;display:inline-block;">
                          ${planDisplayPrice}
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Field Rows -->
              <tr>
                <td style="padding:0 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">

                    <tr style="border-bottom:1px solid #e2e8f0;">
                      <td style="padding:12px 0;font-size:13px;color:#64748b;font-weight:600;width:45%;">
                        <span style="margin-right:8px;">👤</span> User Email
                      </td>
                      <td style="padding:12px 0;font-size:13px;color:#2563eb;font-weight:600;">${email}</td>
                    </tr>

                    <tr style="border-bottom:1px solid #e2e8f0;">
                      <td style="padding:12px 0;font-size:13px;color:#64748b;font-weight:600;">
                        <span style="margin-right:8px;">👤</span> Contact Name
                      </td>
                      <td style="padding:12px 0;font-size:13px;color:#1e293b;font-weight:500;">${recipientName}</td>
                    </tr>

                    <tr style="border-bottom:1px solid #e2e8f0;">
                      <td style="padding:12px 0;font-size:13px;color:#64748b;font-weight:600;">
                        <span style="margin-right:8px;">🏢</span> Business Name
                      </td>
                      <td style="padding:12px 0;font-size:13px;color:#1e293b;font-weight:500;">${companyName}</td>
                    </tr>

                    <tr style="border-bottom:1px solid #e2e8f0;">
                      <td style="padding:12px 0;font-size:13px;color:#64748b;font-weight:600;">
                        <span style="margin-right:8px;">📱</span> Mobile Number
                      </td>
                      <td style="padding:12px 0;font-size:13px;color:#1e293b;font-weight:500;">${mobile || 'N/A'}</td>
                    </tr>

                    <tr style="border-bottom:1px solid #e2e8f0;">
                      <td style="padding:12px 0;font-size:13px;color:#64748b;font-weight:600;">
                        <span style="margin-right:8px;">💰</span> Plan Price / Paid
                      </td>
                      <td style="padding:12px 0;font-size:13px;color:#1e293b;font-weight:500;">${planPriceFull}</td>
                    </tr>

                    <tr style="border-bottom:1px solid #e2e8f0;">
                      <td style="padding:12px 0;font-size:13px;color:#64748b;font-weight:600;">
                        <span style="margin-right:8px;">📅</span> Start Date
                      </td>
                      <td style="padding:12px 0;font-size:13px;color:#1e293b;font-weight:500;">${startLabel}</td>
                    </tr>

                    <tr style="border-bottom:1px solid #e2e8f0;">
                      <td style="padding:12px 0;font-size:13px;color:#64748b;font-weight:600;">
                        <span style="margin-right:8px;">📆</span> Valid Until (End Date)
                      </td>
                      <td style="padding:12px 0;font-size:13px;color:#2563eb;font-weight:600;">${endLabel}</td>
                    </tr>

                    <tr style="border-bottom:1px solid #e2e8f0;">
                      <td style="padding:12px 0;font-size:13px;color:#64748b;font-weight:600;">
                        <span style="margin-right:8px;">💳</span> Payment Status
                      </td>
                      <td style="padding:12px 0;">
                        <span style="background:#dcfce7;color:#166534;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;border:1px solid #bbf7d0;">${paymentStatus}</span>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:12px 0;font-size:13px;color:#64748b;font-weight:600;">
                        <span style="margin-right:8px;">🔖</span> Transaction ID
                      </td>
                      <td style="padding:12px 0;font-size:12px;color:#1e293b;font-family:monospace;word-break:break-all;">${transactionId}</td>
                    </tr>

                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- Account Credentials & Login Section -->
        <tr>
          <td style="padding:0 40px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="padding:14px 20px;border-bottom:1px solid #fde68a;background:#fef3c7;">
                  <span style="font-size:13px;font-weight:700;color:#92400e;">🔐 Account Credentials &amp; Login</span>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:13px;color:#64748b;padding-bottom:8px;width:120px;font-weight:600;">Login Email:</td>
                      <td style="font-size:13px;color:#1e293b;padding-bottom:8px;font-weight:600;">${email}</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#64748b;font-weight:600;">Password:</td>
                      <td style="font-size:13px;color:#64748b;font-style:italic;">The password you set during registration</td>
                    </tr>
                  </table>
                  <div style="margin-top:16px;text-align:center;">
                    <a href="${loginUrl}" style="background:#1d4ed8;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">
                      Login to Dashboard →
                    </a>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;background:#f1f5f9;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              © ${new Date().getFullYear()} Kiaan Technology Pvt Ltd. All rights reserved.<br/>
              If you have questions, reply to this email or contact support.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

        // ── 2. Owner notification email ─────────────────────────────────────────
        const ownerSubject = `[New Registration] ${companyName} — ${selectedPlan}`;
        const ownerHtml = `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f6fb;padding:24px;">
  <div style="max-width:580px;margin:0 auto;background:#fff;border-radius:10px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.07);">
    <h2 style="color:#1e3a8a;margin-top:0;">📋 New User Registration Alert</h2>
    <p style="color:#64748b;font-size:14px;">A new admin has registered on Employee-Monitor-System.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin-top:12px;">
      <tr style="background:#f1f5f9;"><td style="padding:10px 14px;font-weight:600;color:#64748b;width:40%;border-bottom:1px solid #e2e8f0;">Admin Name</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">${recipientName}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Email</td><td style="padding:10px 14px;color:#2563eb;border-bottom:1px solid #e2e8f0;">${email}</td></tr>
      <tr style="background:#f1f5f9;"><td style="padding:10px 14px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Mobile</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">${mobile || 'N/A'}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Company</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">${companyName}</td></tr>
      <tr style="background:#f1f5f9;"><td style="padding:10px 14px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Selected Plan</td><td style="padding:10px 14px;font-weight:700;border-bottom:1px solid #e2e8f0;">${selectedPlan}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Plan Price</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">${planPriceFull}</td></tr>
      <tr style="background:#f1f5f9;"><td style="padding:10px 14px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Start Date</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">${startLabel}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">End Date</td><td style="padding:10px 14px;color:#2563eb;font-weight:600;border-bottom:1px solid #e2e8f0;">${endLabel}</td></tr>
      <tr style="background:#f1f5f9;"><td style="padding:10px 14px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Payment Status</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;"><span style="background:#dcfce7;color:#166534;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">${paymentStatus}</span></td></tr>
      <tr><td style="padding:10px 14px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Transaction ID</td><td style="padding:10px 14px;font-family:monospace;font-size:12px;border-bottom:1px solid #e2e8f0;">${transactionId}</td></tr>
      <tr style="background:#f1f5f9;"><td style="padding:10px 14px;font-weight:600;color:#64748b;">Registered At</td><td style="padding:10px 14px;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</td></tr>
    </table>
  </div>
</body></html>`;

        // Fire-and-forget — registration already succeeded, don't block response
        const ownerEmail = process.env.OWNER_EMAIL || 'info@kiaantechnology.com';
        Promise.all([
            sendMail({ to: email,      subject: userSubject,  html: userHtml  }),
            sendMail({ to: ownerEmail, subject: ownerSubject, html: ownerHtml })
        ]).then(results => {
            console.log(`[Payment] Welcome email to user (${email}): ${results[0]?.sent ? '✓ sent via Brevo' : 'simulated/failed'}`);
            console.log(`[Payment] Admin alert to owner: ${results[1]?.sent ? '✓ sent via Brevo' : 'simulated/failed'}`);
        }).catch(err => {
            console.error('[Payment] Email notification error (non-fatal):', err.message);
        });

        return successResponse(res, registrationResult, 'Registration and payment successfully verified', 201);

    } catch (err) {
        console.error('Error in payment verification & registration:', err);
        return errorResponse(res, err.message || 'Failed to verify and register', 500);
    }
});

module.exports = router;
