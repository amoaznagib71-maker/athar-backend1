document.addEventListener('DOMContentLoaded', () => {
    const resultsList = document.getElementById('results-list');
    const authCheckMsg = document.getElementById('auth-check-msg');
    const loadingResults = document.getElementById('loading-results');

    const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? `http://${window.location.hostname}:5000`
        : 'https://athar-api.onrender.com'; // ✅ تم التحديث لرابط السيرفر الخاص بك على Render

    function checkAuthAndLoad() {
        const savedUser = localStorage.getItem('athar_user');
        
        if (savedUser) {
            const user = JSON.parse(savedUser);
            if (user.email) {
                authCheckMsg.style.display = 'none';
                performTrack(user.email);
            }
        } else {
            authCheckMsg.style.display = 'block';
            resultsList.innerHTML = '';
        }
    }

    async function performTrack(email) {
        loadingResults.style.display = 'block';
        resultsList.innerHTML = '';

        const lastSession = localStorage.getItem('athar_last_session');
        const query = email || lastSession;

        if (!query) {
            loadingResults.style.display = 'none';
            return;
        }

        console.log("Tracking results for:", query);

        try {
            const response = await fetch(`${API_URL}/api/orders/track?query=${query}`);
            if (!response.ok) throw new Error('Server error');
            const orders = await response.json();
            renderResults(orders);
            
            // 🔔 Mark as seen
            localStorage.setItem('athar_last_seen_results', new Date().toISOString());
        } catch (e) {
            console.error("Track error:", e);
            resultsList.innerHTML = '<p style="color: #ff4d4d; margin-top: 2rem;">حدث خطأ في الاتصال بالخادم. يرجى التأكد من اتصالك بالإنترنت.</p>';
        } finally {
            loadingResults.style.display = 'none';
        }
    }

    function renderResults(orders) {
        resultsList.classList.add('visible');

        if (orders.length === 0) {
            resultsList.innerHTML = '<p style="margin-top: 3rem; opacity: 0.6; font-size: 1.1rem;">لم نجد أي طلبات مرتبطة بحسابك حتى الآن.</p>';
            return;
        }

        orders.forEach(order => {
            const date = new Date(order.timestamp).toLocaleDateString('ar-EG');
            const card = document.createElement('div');
            card.className = 'result-card glass';
            
            let resultHtml = `
                <h3>طلب بتاريخ ${date}</h3>
                <p style="margin-top: 10px;">الحالة: <span style="color: var(--athar-orange);">${
                    order.status === 'completed' ? 'تم التسليم بنجاح ✅' : 
                    order.status === 'rejected' ? 'تم الرفض ❌' :
                    'جاري العمل عليه ⚙️'
                }</span></p>
                ${order.status === 'rejected' ? `
                    <div style="background: rgba(192, 57, 43, 0.1); padding: 1rem; border-radius: 10px; margin-top: 1rem; border: 1px solid #c0392b;">
                        <p style="color: #ff4d4d; font-size: 0.9rem;"><b>سبب الرفض:</b> ${order.rejectionReason || 'بيانات غير كافية'}</p>
                    </div>
                ` : ''}
            `;

            if (order.status === 'completed') {
                const isVideo = order.resultUrl.match(/\.(mp4|mov|webm|ogg)$/i) || order.resultUrl.includes('/uploads/results/');
                
                resultHtml += `
                    <div style="margin-top: 2.5rem;">
                        <p style="margin-bottom: 1.5rem;">بإمكانك الآن تحميل ومشاهدة نتيجتك السينمائية:</p>
                        ${isVideo ? `
                            <video src="${order.resultUrl}" controls class="result-video" style="margin-bottom: 2rem;"></video>
                        ` : ''}
                        <a href="${order.resultUrl}" download target="_blank" class="btn btn-primary" style="padding: 1.2rem 2.5rem; font-size: 1.1rem; width: 100%; display: block;">📥 تحميل الفيديو النهائي</a>
                    </div>
                `;
            } else {
                resultHtml += `
                    <p style="margin-top: 2.5rem; opacity: 0.6; line-height: 1.6;">نحن نعمل حالياً على تحويل منتجك لتجربة سينمائية فريدة. ستظهر الروابط هنا فور اكتمال العمل.</p>
                `;
            }

            card.innerHTML = resultHtml;
            resultsList.appendChild(card);
        });
    }

    // Initial check
    checkAuthAndLoad();

    // Listen for storage changes (in case they login in another tab or the current modal)
    window.addEventListener('storage', checkAuthAndLoad);
    
    // Check if user logs in via the modal (polled or triggered)
    // For simplicity, let's observe the localStorage periodically or just tell users to refresh
    // Actually, a better way is to wrap our logic in a function and call it after login.
    // Let's modify handleCredentialResponse in auth-config.js later if needed.
    setInterval(() => {
        const savedUser = localStorage.getItem('athar_user');
        const isCurrentlyShowingAuth = authCheckMsg.style.display === 'block';
        if (savedUser && isCurrentlyShowingAuth) {
            checkAuthAndLoad();
        }
    }, 2000);
});
