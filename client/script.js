// 1. Global Variables & Configuration
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? `http://${window.location.hostname}:5000`
    : 'https://athar-api.onrender.com'; // ✅ تم التحديث لرابط السيرفر الخاص بك على Render

let selectedPackageData = null;
let currentMethod = null;

document.addEventListener('DOMContentLoaded', () => {
    
    // 2. Initial State Checks
    const checkUserStatus = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('session_id');
        const orderSection = document.getElementById('order');
        const packagesSection = document.getElementById('packages');

        // Check Manual Payment Verification
        if (sessionId) {
            try {
                const response = await fetch(`${API_URL}/api/payments/verify?sessionId=${sessionId}`);
                const data = await response.json();
                if (data.verified) {
                    localStorage.setItem('athar_last_session', sessionId);
                    orderSection.style.display = 'block';
                    setTimeout(() => orderSection.scrollIntoView({ behavior: 'smooth' }), 500);
                }
            } catch (error) { console.error("Error verifying payment:", error); }
        }

        // Check Subscription
        const savedUser = localStorage.getItem('athar_user');
        if (savedUser) {
            const user = JSON.parse(savedUser);
            updateUIForLoggedInUser(user);
            checkNewResults(); // 🔔 Check for new results
            try {
                const response = await fetch(`${API_URL}/api/user/subscription?email=${user.email}`);
                const subData = await response.json();
                if (subData.active) {
                    const expiryDate = new Date(subData.endDate).toLocaleDateString('ar-EG');
                    packagesSection.innerHTML = `
                        <div class="glass reveal visible" style="max-width: 800px; margin: 0 auto; padding: 4rem; text-align: center; border: 1px solid var(--athar-orange);">
                            <h2 style="color: var(--athar-orange); margin-bottom: 1.5rem;">اشتراكك نشط حالياً ✅</h2>
                            <p style="font-size: 1.1rem; opacity: 0.8; line-height: 1.8;">
                                أنت الآن تستمتع بمميزات باقة أثر السينمائية. <br>
                                تنتهي فترة اشتراكك الحالية في: <strong>${expiryDate}</strong>
                            </p>
                            <p style="margin-top: 2rem; opacity: 0.6;">بإمكانك إرسال طلبات جديدة من النموذج بالأسفل.</p>
                            <a href="#order" class="btn btn-primary" style="margin-top: 2rem;" onclick="document.getElementById('order').scrollIntoView({ behavior: 'smooth' })">إرسال طلب جديد</a>
                        </div>
                    `;
                    orderSection.style.display = 'block';
                }
            } catch (error) { console.error("Error checking subscription:", error); }
        }
    };
    checkUserStatus();

    // 3. UI Effects (Nav, Reveal, Scroll)
    const nav = document.getElementById('main-nav');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) nav.classList.add('scrolled');
        else nav.classList.remove('scrolled');
    });

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
    }, { threshold: 0.15 });
    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            const target = document.querySelector(targetId);
            if (target) window.scrollTo({ top: target.offsetTop - 80, behavior: 'smooth' });
        });
    });

    // 4. File Upload Handling
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('order-files');
    const previewList = document.getElementById('preview-list');
    const uploadHint = document.getElementById('upload-hint');

    if (uploadZone) {
        uploadZone.addEventListener('click', () => fileInput.click());
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = 'var(--athar-orange)';
        });
        uploadZone.addEventListener('dragleave', () => uploadZone.style.borderColor = 'var(--athar-border)');
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = 'var(--athar-border)';
            processFiles(e.dataTransfer.files);
        });
        fileInput.addEventListener('change', () => processFiles(fileInput.files));
    }

    function processFiles(files) {
        previewList.innerHTML = '';
        const validFiles = Array.from(files).slice(0, 5);
        if (validFiles.length > 0) {
            uploadHint.textContent = `تم اختيار ${validFiles.length} صور`;
            uploadHint.style.color = 'var(--athar-orange)';
        }
        validFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('div');
                img.className = 'upload-preview-img';
                img.style.width = '80px'; img.style.height = '80px';
                img.style.borderRadius = '12px'; img.style.background = `url(${e.target.result}) no-repeat center center/cover`;
                img.style.border = '2px solid var(--athar-border)';
                previewList.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    }

    // 5. Package Button Logic
    document.querySelectorAll('.pkg-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const card = btn.closest('.package-card');
            const packageName = card.querySelector('h3').textContent;
            const priceText = card.querySelector('.package-price').textContent;
            const amount = parseInt(priceText.replace(/[^\d]/g, ''));

            if (!localStorage.getItem('athar_user')) {
                alert('يرجى تسجيل الدخول أولاً لتتمكن من متابعة طلبك.');
                openLoginModal();
                return;
            }

            selectedPackageData = { name: packageName, amount: amount };
            openPaymentModal(packageName);
        });
    });

    // 6. Form Submission
    const orderForm = document.getElementById('athar-order-form');
    if (orderForm) {
        orderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const urlParams = new URLSearchParams(window.location.search);
            const sessionId = urlParams.get('session_id') || localStorage.getItem('athar_last_session');
            const submitBtn = document.getElementById('submit-order');
            
            if (!sessionId && !localStorage.getItem('athar_user')) {
                alert('عذراً، يجب إتمام الدفع أو تسجيل الدخول أولاً');
                return;
            }
            if (fileInput.files.length === 0) return alert('يرجى اختيار صورة واحدة على الأقل');

            submitBtn.disabled = true;
            submitBtn.textContent = 'جاري إرسال طلبك...';

            const imagePromises = Array.from(fileInput.files).slice(0, 5).map(file => {
                return new Promise(res => {
                    const r = new FileReader();
                    r.onload = (e) => res(e.target.result);
                    r.readAsDataURL(file);
                });
            });

            const imageData = await Promise.all(imagePromises);
            const user = JSON.parse(localStorage.getItem('athar_user'));

            try {
                const response = await fetch(`${API_URL}/api/orders`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        images: imageData,
                        socialLink: document.getElementById('client-social').value,
                        email: user.email,
                        notes: document.getElementById('client-notes').value
                    })
                });

                if (response.ok) {
                    orderForm.style.display = 'none';
                    document.getElementById('terminal-success').style.display = 'block';
                    document.getElementById('terminal-success').scrollIntoView({ behavior: 'smooth' });
                } else {
                    const err = await response.json();
                    alert(`خطأ: ${err.error}`);
                    submitBtn.disabled = false;
                }
            } catch (error) {
                alert('خطأ في الاتصال بالخادم');
                submitBtn.disabled = false;
            }
        });
    }

    // Mobile Menu
    const mobileMenu = document.getElementById('mobile-menu');
    const navLinks = document.getElementById('nav-links');
    if (mobileMenu) {
        mobileMenu.addEventListener('click', () => {
            mobileMenu.classList.toggle('active');
            navLinks.classList.toggle('active');
        });
    }
});

// --- Auth Functions ---
function openLoginModal() { document.getElementById('login-modal').style.display = 'flex'; }
function closeLoginModal() { document.getElementById('login-modal').style.display = 'none'; }
function resetLoginForm() {
    document.getElementById('email-login-step').style.display = 'block';
    document.getElementById('otp-step').style.display = 'none';
}

async function requestOTP() {
    const email = document.getElementById('login-email').value.trim();
    if (!email) return alert('يرجى إدخال البريد الإلكتروني');

    const btn = document.getElementById('btn-request-otp');
    btn.disabled = true; btn.textContent = 'جاري الإرسال...';

    try {
        const res = await fetch(`${API_URL}/api/auth/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (res.ok) {
            document.getElementById('email-login-step').style.display = 'none';
            document.getElementById('otp-step').style.display = 'block';
        } else alert(data.error);
    } catch (e) { alert('فشل الاتصال بالخادم'); }
    btn.disabled = false; btn.textContent = 'استمرار';
}

async function verifyOTP() {
    const email = document.getElementById('login-email').value.trim();
    const otp = document.getElementById('login-otp').value.trim();
    const btn = document.getElementById('btn-verify-otp');

    try {
        const res = await fetch(`${API_URL}/api/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('athar_user', JSON.stringify(data.user));
            location.reload();
        } else alert(data.error);
    } catch (e) { alert('خطأ في التحقق'); }
}

function updateUIForLoggedInUser(user) {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('user-profile').style.display = 'flex';
    document.getElementById('user-name').textContent = user.name || user.email.split('@')[0];
    closeLoginModal();
}

function logout() {
    localStorage.removeItem('athar_user');
    location.reload();
}

// --- Payment Functions ---
function openPaymentModal(packageName) {
    document.getElementById('selected-pkg-name').textContent = packageName;
    document.getElementById('payment-modal').style.display = 'flex';
}

function closePaymentModal() {
    document.getElementById('payment-modal').style.display = 'none';
    currentMethod = null;
    document.querySelectorAll('.payment-method-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('manual-payment-details').style.display = 'none';
}

function selectPaymentMethod(method) {
    currentMethod = method;
    const cards = document.querySelectorAll('.payment-method-card');
    cards.forEach(c => c.classList.remove('selected'));
    
    const standardVal = document.getElementById('standard-payment-val');
    const premiumCard = document.getElementById('premium-card-ui');
    const instText = document.getElementById('method-instruction');
    const destValue = document.getElementById('payment-dest-value');

    document.getElementById('manual-payment-details').style.display = 'block';
    
    if (method === 'vodafone_cash') {
        cards[0].classList.add('selected');
        standardVal.style.display = 'block';
        premiumCard.style.display = 'none';
        instText.textContent = 'قم بتحويل المبلغ إلى رقم فودافون كاش التالي:';
        destValue.textContent = '01028746064'; 
    } else if (method === 'instapay') {
        cards[1].classList.add('selected');
        standardVal.style.display = 'none';
        premiumCard.style.display = 'block';
        instText.textContent = 'قم بالتحويل عبر إنستا باي إلى بيانات الكارت التالية:';
    }
}

async function submitManualPayment() {
    const txId = document.getElementById('manual-tx-id').value.trim();
    if (!txId) return alert('يرجى إدخال رقم المعاملة');
    const btn = document.getElementById('btn-submit-manual');
    btn.disabled = true; btn.textContent = 'جاري الإرسال...';

    const user = JSON.parse(localStorage.getItem('athar_user'));
    try {
        const response = await fetch(`${API_URL}/api/payments/manual`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: currentMethod,
                transactionId: txId,
                amount: selectedPackageData.amount,
                packageName: selectedPackageData.name,
                customerData: { email: user.email, first_name: user.name || user.email }
            })
        });

        if (response.ok) {
            alert('تم استلام طلبك! سيتم التفعيل فور المراجعة.');
            closePaymentModal();
        } else {
            const err = await response.json();
            alert('خطأ: ' + err.error);
        }
    } catch (e) { alert('فشل الاتصال'); }
    btn.disabled = false; btn.textContent = 'تأكيد التحويل';
}

function copyToClipboard(id, e) {
    const val = document.getElementById(id).textContent;
    navigator.clipboard.writeText(val).then(() => {
        const btn = e.target;
        const originalText = btn.textContent;
        btn.textContent = 'تم النسخ!';
        setTimeout(() => btn.textContent = originalText, 2000);
    });
}

function copyToClipboardText(text, e) {
    navigator.clipboard.writeText(text).then(() => {
        const btn = e.target;
        const originalText = btn.textContent;
        btn.textContent = 'تم!';
        setTimeout(() => btn.textContent = originalText, 2000);
    });
}

async function checkNewResults() {
    const user = JSON.parse(localStorage.getItem('athar_user'));
    if (!user) return;

    try {
        const response = await fetch(`${API_URL}/api/orders/track?query=${user.email}`);
        if (response.ok) {
            const orders = await response.json();
            const completedOrders = orders.filter(o => o.status === 'completed');
            
            if (completedOrders.length > 0) {
                // Find the newest completion date
                const latestCompleted = new Date(Math.max(...completedOrders.map(o => new Date(o.completedAt || 0))));
                const lastSeen = new Date(localStorage.getItem('athar_last_seen_results') || 0);

                if (latestCompleted > lastSeen) {
                    const dot = document.getElementById('results-dot');
                    if (dot) dot.style.display = 'block';
                }
            }
        }
    } catch (e) {
        console.error('Error checking results:', e);
    }
}

