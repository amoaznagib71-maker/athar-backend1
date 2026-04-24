const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const admin = require('firebase-admin');
const tiktokService = require('./services/tiktokService');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const emailService = require('./services/emailService');
const fs = require('fs');

// Ensure uploads directory exists (Only if NOT on Vercel)
if (!process.env.VERCEL) {
    const UPLOADS_DIR = path.join(__dirname, 'uploads', 'results');
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
}

// Initialize JSON files if they don't exist (Only if NOT on Vercel)
if (!process.env.VERCEL) {
    const FILES_TO_INIT = ['orders.json', 'subscriptions.json', 'users.json'];
    FILES_TO_INIT.forEach(f => {
        const p = path.join(__dirname, f);
        if (!fs.existsSync(p)) fs.writeFileSync(p, '[]');
    });
}

// Multer Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 * 1024 } // 5GB Limit
});

const app = express();
app.use(cors({
    origin: ['https://athar-01.netlify.app', 'http://localhost:5500', 'http://127.0.0.1:5500'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Root route to check if server is alive
app.get('/', (req, res) => {
    res.send('Athar Backend is running on Vercel! 🚀');
});

// Rate Limiting for Security
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 requests per windowMs
    message: { error: 'كثير من المحاولات، يرجى المحاولة لاحقاً' }
});

app.use('/api/auth/', authLimiter);
app.use('/api/admin/', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Firebase Admin Setup
try {
    const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: "athar-agency.appspot.com" // Update with actual bucket
    });
    console.log("Firebase Admin initialized");
} catch (error) {
    console.warn("Firebase Admin NOT initialized. Please provide serviceAccountKey.json");
}

const db = admin.apps.length ? admin.firestore() : null;

// Payment Verification Endpoint (Keep for compatibility but check manual status)
app.get('/api/payments/verify', async (req, res) => {
    try {
        const { sessionId } = req.query;
        if (!sessionId) return res.status(400).json({ error: "Session ID required" });

        const orders = readOrders();
        const order = orders.find(o => o.id === sessionId || o.transactionId === sessionId);
        
        if (order && (order.status === 'paid' || order.status === 'completed')) {
            res.json({ verified: true, amount: order.amount });
        } else {
            res.json({ verified: false, message: "Payment not verified yet" });
        }
    } catch (error) {
        res.status(500).json({ verified: false, error: error.message });
    }
});

// --- Manual Payment Integration (Vodafone Cash / InstaPay) ---
app.post('/api/payments/manual', async (req, res) => {
    try {
        const { method, transactionId, amount, customerData, packageName } = req.body;

        if (!method || !transactionId || !amount || !customerData.email) {
            return res.status(400).json({ error: "جميع البيانات مطلوبة" });
        }

        const newOrder = {
            id: 'manual_' + Date.now(),
            method: method, // 'vodafone_cash' or 'instapay'
            transactionId: transactionId,
            amount: amount,
            email: customerData.email,
            customerName: `${customerData.first_name || ''} ${customerData.last_name || ''}`,
            phone: customerData.phone_number || '',
            packageName: packageName,
            status: 'pending_verification', // New status for manual review
            timestamp: new Date().toISOString()
        };

        const orders = readOrders();
        orders.unshift(newOrder);
        writeData(ORDERS_FILE, orders);

        // Notify admin (console for now, could be email)
        console.log(`🔔 New Manual Payment! Method: ${method}, ID: ${transactionId}`);

        res.json({ success: true, message: "تم استلام طلبك وبانتظار مراجعة التحويل" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Stripe Verification (Disabled since you moved to Manual Payments) ---
app.get('/api/stripe/verify-session', async (req, res) => {
    res.json({ verified: false, message: "Stripe is disabled. Use manual payment." });
});

// --- Auth & OTP Management ---
const OTP_STORE = new Map(); // Store OTPs temporarily in memory

app.post('/api/auth/request-otp', async (req, res) => {
    const { email } = req.body;
    console.log(`[AUTH] OTP requested for: ${email}`);
    if (!email) return res.status(400).json({ error: 'البريد الإلكتروني مطلوب' });

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    OTP_STORE.set(email, { otp, expiresAt });

    const sent = await emailService.sendOTP(email, otp);
    if (sent) {
        res.json({ success: true, message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني' });
    } else {
        res.status(500).json({ error: 'فشل إرسال البريد الإلكتروني. تأكد من إعدادات SMTP.' });
    }
});

app.post('/api/auth/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    
    const record = OTP_STORE.get(email);
    if (!record) return res.status(400).json({ error: 'لم يتم طلب رمز لهذا البريد' });
    
    if (Date.now() > record.expiresAt) {
        OTP_STORE.delete(email);
        return res.status(400).json({ error: 'انتهت صلاحية الرمز' });
    }

    if (record.otp === otp.trim()) {
        OTP_STORE.delete(email);
        
        saveUserRecord(email);
        
        // Send login alert
        await emailService.sendLoginAlert(email);
        
        res.json({ success: true, user: { email } });
    } else {
        res.status(400).json({ error: 'الرمز غير صحيح' });
    }
});

// --- Subscription & Order Management ---
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const SUBS_FILE = path.join(__dirname, 'subscriptions.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// Helpers
const readData = (file) => {
    try {
        if (!fs.existsSync(file)) return [];
        return JSON.parse(fs.readFileSync(file));
    } catch (e) { return []; }
};

const writeData = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

const readOrders = () => readData(ORDERS_FILE);
const readSubscriptions = () => readData(SUBS_FILE);
const readUsers = () => readData(USERS_FILE);

const saveUserRecord = (email) => {
    const users = readUsers();
    if (!users.some(u => u.email === email)) {
        users.unshift({ email, joinedAt: new Date().toISOString() });
        writeData(USERS_FILE, users);
    }
};

const saveOrder = (order) => {
    const orders = readOrders();
    orders.unshift({ ...order, id: Date.now(), status: 'new' });
    writeData(ORDERS_FILE, orders);

    // Also update/create subscription
    if (order.email) {
        const subs = readSubscriptions();
        const existingIndex = subs.findIndex(s => s.email === order.email);
        
        const now = new Date();
        const expiry = new Date();
        expiry.setDate(now.getDate() + 30); // 30 days subscription

        const newSub = {
            email: order.email,
            packageName: order.packageName || 'غير محدد',
            startDate: now.toISOString(),
            endDate: expiry.toISOString(),
            status: 'active'
        };

        if (existingIndex > -1) {
            subs[existingIndex] = newSub;
        } else {
            subs.push(newSub);
        }
        writeData(SUBS_FILE, subs);
        
        // Send email notification for new/renewed subscription
        emailService.sendSubscriptionConfirmed(order.email, newSub.endDate).catch(e => console.error("Email error:", e));
    }
};

// Endpoint to check subscription status
app.get('/api/user/subscription', (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email required" });

    const subs = readSubscriptions();
    const sub = subs.find(s => s.email === email);

    if (!sub) {
        return res.json({ active: false });
    }

    const now = new Date();
    const expiry = new Date(sub.endDate);

    if (now > expiry) {
        return res.json({ active: false, expired: true, endDate: sub.endDate });
    }

    res.json({ active: true, endDate: sub.endDate });
});

// Endpoint to Submit Order from Client
app.post('/api/orders', async (req, res) => {
    try {
        const { sessionId, socialLink, images, email, notes } = req.body;
        
        // Check if user has an active subscription first
        const subs = readSubscriptions();
        const activeSub = subs.find(s => s.email === email && new Date() <= new Date(s.endDate));

        let session = null;
        if (activeSub) {
            // User is subscribed, allow order
            session = { payment_status: 'paid', amount_total: 0, customer_details: { email: email } };
            if (!req.body.sessionId) req.body.sessionId = 'sub_' + Date.now(); // Generate dummy session ID for tracking
        } else {
            // No active subscription, verify via manual session
            const orders = readOrders();
            const order = orders.find(o => o.id === sessionId || o.transactionId === sessionId);
            
            if (order && (order.status === 'paid' || order.status === 'completed')) {
                session = { payment_status: 'paid', amount_total: order.amount * 100, customer_details: { email: email || order.email } };
            } else {
                return res.status(403).json({ error: "بانتظار تأكيد الدفع من الإدارة" });
            }
        }

        if (session && session.payment_status !== 'paid') {
            return res.status(403).json({ error: "Access denied. Unpaid session." });
        }

        if (session.payment_status !== 'paid') {
            return res.status(403).json({ error: "Access denied. Unpaid session." });
        }

        const newOrder = {
            sessionId,
            socialLink,
            images, // Array of base64 or URLs
            amount: session.amount_total / 100,
            email: email || session.customer_details?.email,
            notes: notes || '',
            timestamp: new Date().toISOString()
        };

        saveOrder(newOrder);
        res.json({ success: true, message: "Order received" });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin Endpoint to Fetch Orders
app.get('/api/admin/orders', async (req, res) => {
    const { auth } = req.query;
    const ADMIN_PASS = (process.env.ADMIN_PASSWORD || 'athar2026').trim();
    
    if (auth && auth.trim() === ADMIN_PASS) {
        // Filter out confirmed manual payments that haven't been submitted as actual orders yet
        const orders = readOrders().filter(o => {
            if (o.status === 'paid' && !o.images) return false;
            return true;
        });
        res.json(orders);
    } else {
        res.status(401).json({ error: "Unauthorized" });
    }
});

// Admin Endpoint to Fetch Subscribers
app.get('/api/admin/subscribers', async (req, res) => {
    const { auth } = req.query;
    const ADMIN_PASS = (process.env.ADMIN_PASSWORD || 'athar2026').trim();
    
    if (auth && auth.trim() === ADMIN_PASS) {
        res.json(readSubscriptions());
    } else {
        res.status(401).json({ error: "Unauthorized" });
    }
});

// Admin Endpoint to Fetch All Registered Users
app.get('/api/admin/users', async (req, res) => {
    const { auth } = req.query;
    const ADMIN_PASS = (process.env.ADMIN_PASSWORD || 'athar2026').trim();
    
    if (auth && auth.trim() === ADMIN_PASS) {
        res.json(readUsers());
    } else {
        res.status(401).json({ error: "Unauthorized" });
    }
});

// Admin Endpoint to Verify/Approve Manual Payment
app.post('/api/admin/orders/:id/approve', async (req, res) => {
    const { auth } = req.body;
    const ADMIN_PASS = (process.env.ADMIN_PASSWORD || 'athar2026').trim();

    if (auth !== ADMIN_PASS) return res.status(401).json({ error: "Unauthorized" });

    const orders = readOrders();
    const orderIndex = orders.findIndex(o => o.id == req.params.id);

    if (orderIndex === -1) return res.status(404).json({ error: "Order not found" });

    orders[orderIndex].status = 'paid';
    orders[orderIndex].approvedAt = new Date().toISOString();

    // Create a subscription for the user automatically upon approval
    const email = orders[orderIndex].email;
    if (email) {
        const subs = readSubscriptions();
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        
        const newSub = {
            email: email,
            packageName: orders[orderIndex].packageName || 'غير محدد',
            startDate: new Date().toISOString(),
            endDate: expiry.toISOString(),
            status: 'active'
        };

        const existingIndex = subs.findIndex(s => s.email === email);
        if (existingIndex > -1) subs[existingIndex] = newSub;
        else subs.push(newSub);
        
        writeData(SUBS_FILE, subs);
        emailService.sendSubscriptionConfirmed(email, newSub.endDate).catch(e => console.error(e));
    }

    writeData(ORDERS_FILE, orders);
    res.json({ success: true, message: "تمت الموافقة على الطلب وتفعيل الاشتراك" });
});

// Admin Endpoint to Reject Manual Payment
app.post('/api/admin/orders/:id/reject', async (req, res) => {
    const { auth, reason } = req.body;
    const ADMIN_PASS = (process.env.ADMIN_PASSWORD || 'athar2026').trim();

    if (auth !== ADMIN_PASS) return res.status(401).json({ error: "Unauthorized" });

    const orders = readOrders();
    const orderIndex = orders.findIndex(o => o.id == req.params.id);

    if (orderIndex === -1) return res.status(404).json({ error: "Order not found" });

    orders[orderIndex].status = 'rejected';
    orders[orderIndex].rejectionReason = reason || 'بيانات التحويل غير صحيحة أو لم يتم استلام المبلغ';
    orders[orderIndex].rejectedAt = new Date().toISOString();

    writeData(ORDERS_FILE, orders);
    res.json({ success: true, message: "تم رفض الطلب بنجاح" });
});

// Admin Endpoint to Complete Order and Add Result (Supports File Upload)
app.put('/api/admin/orders/:id/complete', (req, res, next) => {
    upload.single('resultVideo')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: "حجم الفيديو كبير جداً. الحد الأقصى 5 جيجا." });
            }
            return res.status(400).json({ error: "خطأ في رفع الملف: " + err.message });
        } else if (err) {
            return res.status(500).json({ error: "خطأ غير متوقع: " + err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.body) {
            return res.status(400).json({ error: "لم يتم استلام أي بيانات (Missing req.body)" });
        }

        const { auth, resultUrl } = req.body;
        const ADMIN_PASS = (process.env.ADMIN_PASSWORD || 'athar2026').trim();

        if (auth !== ADMIN_PASS) return res.status(401).json({ error: "Unauthorized" });

        const orders = readOrders();
        const orderIndex = orders.findIndex(o => o.id == req.params.id);
        
        if (orderIndex === -1) return res.status(404).json({ error: "Order not found" });

        let finalUrl = resultUrl;
        if (req.file) {
            const protocol = req.protocol;
            const host = req.get('host');
            finalUrl = `${protocol}://${host}/uploads/results/${req.file.filename}`;
        }

        if (!finalUrl) return res.status(400).json({ error: "No video or URL provided" });

        orders[orderIndex].status = 'completed';
        orders[orderIndex].resultUrl = finalUrl;
        orders[orderIndex].completedAt = new Date().toISOString();

        writeData(ORDERS_FILE, orders);
        res.json({ success: true, message: "Order marked as completed", resultUrl: finalUrl });
    } catch (error) {
        console.error("Complete Order Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Client Endpoint to Track Results by Email or Session
app.get('/api/orders/track', async (req, res) => {
    const { query } = req.query; // SessionID or Email
    if (!query) return res.status(400).json({ error: "Query required" });

    const orders = readOrders();
    const customerOrders = orders.filter(o => o.sessionId === query || o.email === query);
    
    res.json(customerOrders);
});

// TikTok Feed Endpoint (Real Sync)
app.get('/api/tiktok/feed', async (req, res) => {
    const limit = parseInt(req.query.limit) || 6;
    const offset = parseInt(req.query.offset) || 0;
    
    try {
        const videos = await tiktokService.getCachedVideos(limit, offset);
        res.json(videos);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch TikTok feed" });
    }
});

// Start TikTok Auto-Sync
tiktokService.startAutoSync();

// Daily check for expired subscriptions
setInterval(() => {
    console.log("Running daily subscription check...");
    const subs = readSubscriptions();
    let updated = false;
    const now = new Date();

    subs.forEach(sub => {
        if (sub.status === 'active' && now > new Date(sub.endDate)) {
            sub.status = 'expired';
            updated = true;
            emailService.sendSubscriptionExpired(sub.email).catch(e => console.error(e));
        }
    });

    if (updated) {
        writeData(SUBS_FILE, subs);
    }
}, 24 * 60 * 60 * 1000); // Check every 24 hours

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
