// --- Google Identity Services Configuration ---
const GOOGLE_CLIENT_ID = "700669727854-nia6pin65k2orer3qr7ivarnfrrhlel9.apps.googleusercontent.com";

// UI Elements
const authSection = document.getElementById('auth-section');
const userProfile = document.getElementById('user-profile');
const userName = document.getElementById('user-name');
const userPhoto = document.getElementById('user-photo');
const loginModal = document.getElementById('login-modal');

// Initialize Google SDK
window.onload = function () {
    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse
    });
    // Render the official button in the div we created
    const googleBtnDiv = document.getElementById('google-btn-container');
    if (googleBtnDiv) {
        google.accounts.id.renderButton(googleBtnDiv, {
            theme: "outline",
            size: "large",
            width: "100%",
            text: "signin_with",
            shape: "pill"
        });
    }
};

function handleCredentialResponse(response) {
    const responsePayload = decodeJwtResponse(response.credential);
    console.log("Google Info Received:", responsePayload);
    
    // Store Google info temporarily
    window.pendingGoogleUser = responsePayload;
    
    // Set the email and trigger OTP
    const emailInput = document.getElementById('login-email');
    emailInput.value = responsePayload.email;
    
    // Switch UI to show we are requesting code
    document.getElementById('google-btn-container').style.opacity = '0.3';
    document.getElementById('google-btn-container').style.pointerEvents = 'none';
    
    // Call requestOTP automatically
    requestOTP();
}

function decodeJwtResponse(token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
}

// Auth Actions
window.openLoginModal = () => loginModal.style.display = 'flex';
window.closeLoginModal = () => loginModal.style.display = 'none';

window.loginWithGoogle = () => {
    google.accounts.id.prompt(); // Opens the one-tap or account picker
};

const getApiUrl = () => {
    // If we are on localhost/127.0.0.1, always hit port 5000
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '') {
        return 'http://localhost:5000';
    }
    // رابط السيرفر الحقيقي الخاص بك على Render
    return 'https://athar-api.onrender.com';
};

window.requestOTP = async () => {
    const emailInput = document.getElementById('login-email');
    const btn = document.getElementById('btn-request-otp');
    const email = emailInput.value;
    
    if (!email || !email.includes('@')) {
        alert('يرجى إدخال بريد إلكتروني صحيح');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'جاري الإرسال...';

    try {
        const response = await fetch(`${getApiUrl()}/api/auth/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('email-login-step').style.display = 'none';
            document.getElementById('otp-step').style.display = 'block';
        } else {
            alert(data.error || 'حدث خطأ');
        }
    } catch (e) {
        console.error('OTP Request Error:', e);
        alert(`خطأ في الاتصال بالخادم. يرجى التأكد من أن السيرفر يعمل. \n\nالتفاصيل: ${e.message}`);
    }
    
    btn.disabled = false;
    btn.textContent = 'استمرار';
};

window.verifyOTP = async () => {
    const email = document.getElementById('login-email').value;
    const otp = document.getElementById('login-otp').value;
    const btn = document.getElementById('btn-verify-otp');

    if (!otp || otp.length < 6) return alert('يرجى إدخال الكود المكون من 6 أرقام');

    btn.disabled = true;
    btn.textContent = 'جاري التحقق...';

    try {
        const response = await fetch(`${getApiUrl()}/api/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            let userData;
            
            if (window.pendingGoogleUser) {
                // If they came from Google login
                userData = window.pendingGoogleUser;
            } else {
                // If they used plain email
                userData = {
                    name: email.split('@')[0],
                    email: email,
                    picture: null
                };
            }

            localStorage.setItem('athar_user', JSON.stringify(userData));
            
            authSection.style.display = 'none';
            userProfile.style.display = 'block';
            userName.textContent = userData.name;
            if (userData.picture) userPhoto.src = userData.picture;
            
            closeLoginModal();
            location.reload();
        } else {
            alert(data.error || 'الكود غير صحيح');
        }
    } catch (e) {
        console.error('OTP Verify Error:', e);
        alert(`خطأ في الاتصال بالخادم: ${e.message}`);
    }
    
    btn.disabled = false;
    btn.textContent = 'تأكيد الدخول';
};

window.resetLoginForm = () => {
    document.getElementById('email-login-step').style.display = 'block';
    document.getElementById('otp-step').style.display = 'none';
    document.getElementById('login-otp').value = '';
};

window.logout = () => {
    localStorage.removeItem('athar_user');
    location.reload();
};

window.toggleUserDropdown = () => {
    const dropdown = document.getElementById('user-dropdown');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
};

// Check if user was already logged in
const savedUser = localStorage.getItem('athar_user');
if (savedUser) {
    const user = JSON.parse(savedUser);
    authSection.style.display = 'none';
    userProfile.style.display = 'block';
    userName.textContent = user.name;
    if (user.picture) {
        userPhoto.src = user.picture;
        userPhoto.style.display = 'block';
    }
}
