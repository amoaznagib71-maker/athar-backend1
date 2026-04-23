const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE || 'gmail',
            auth: {
                user: process.env.EMAIL_USER || 'test@example.com',
                pass: process.env.EMAIL_PASS || 'password'
            }
        });
        
        this.isConfigured = !!process.env.EMAIL_USER && process.env.EMAIL_USER !== 'test@example.com';
    }

    async sendEmail(to, subject, html) {
        if (!this.isConfigured) {
            console.log('\n--- EMAIL SIMULATION ---');
            console.log(`To: ${to}\nSubject: ${subject}\nHTML: ${html}`);
            console.log('------------------------\n');
            return true;
        }

        try {
            console.log(`[EMAIL] Attempting to send email to: ${to}...`);
            const mailOptions = {
                from: `"وكالة أثر" <${process.env.EMAIL_USER}>`,
                to,
                subject,
                html
            };
            const info = await this.transporter.sendMail(mailOptions);
            console.log(`[EMAIL] Success! Message ID: ${info.messageId}`);
            return true;
        } catch (error) {
            console.error('[EMAIL] FAILED to send email:', error);
            return false;
        }
    }

    async sendOTP(email, otp) {
        const subject = 'كود التحقق الخاص بك - وكالة أثر';
        const html = `
            <div style="direction: rtl; font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                <h2 style="color: #ff6b00;">مرحباً بك في أثر</h2>
                <p>كود التحقق الخاص بك هو:</p>
                <h1 style="letter-spacing: 5px; color: #333;">${otp}</h1>
                <p>هذا الكود صالح لمدة 10 دقائق.</p>
            </div>
        `;
        return this.sendEmail(email, subject, html);
    }

    async sendLoginAlert(email) {
        const subject = 'تنبيه تسجيل دخول جديد - وكالة أثر';
        const html = `
            <div style="direction: rtl; font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #ff6b00;">تنبيه أمني</h2>
                <p>تم تسجيل الدخول إلى حسابك في وكالة أثر للتو.</p>
                <p>إذا لم تكن أنت، يرجى التواصل مع الدعم الفني فوراً.</p>
            </div>
        `;
        return this.sendEmail(email, subject, html);
    }

    async sendSubscriptionConfirmed(email, endDate) {
        const subject = 'تم تفعيل اشتراكك بنجاح - وكالة أثر';
        const date = new Date(endDate).toLocaleDateString('ar-EG');
        const html = `
            <div style="direction: rtl; font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #ff6b00;">شكراً لاشتراكك!</h2>
                <p>لقد تم تفعيل اشتراكك في باقة أثر السينمائية بنجاح.</p>
                <p>صلاحية الاشتراك تمتد حتى: <strong>${date}</strong></p>
                <p>يمكنك الآن البدء في إرسال طلباتك من لوحة التحكم.</p>
            </div>
        `;
        return this.sendEmail(email, subject, html);
    }

    async sendSubscriptionExpired(email) {
        const subject = 'انتهت فترة اشتراكك - وكالة أثر';
        const html = `
            <div style="direction: rtl; font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #ff6b00;">تنبيه انتهاء الاشتراك</h2>
                <p>لقد انتهت فترة اشتراكك الحالية في باقة أثر السينمائية.</p>
                <p>لتتمكن من إرسال طلبات جديدة، يرجى تجديد اشتراكك عبر الموقع.</p>
            </div>
        `;
        return this.sendEmail(email, subject, html);
    }
}

module.exports = new EmailService();
