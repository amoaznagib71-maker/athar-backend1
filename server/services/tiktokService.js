const axios = require('axios');
const cheerio = require('cheerio');
const admin = require('firebase-admin');

// Database reference (Assuming it's initialized in index.js or similar)
const db = admin.apps.length ? admin.firestore() : null;

class TikTokService {
    constructor() {
        this.username = 'athar_q85';
        this.interval = 15 * 60 * 1000; // 15 minutes as requested
        this.cacheCollection = 'tiktok_videos';
    }

    async fetchLatestVideos() {
        const url = `https://www.tiktok.com/@${this.username}`;
        try {
            console.log(`Starting TikTok sync for @${this.username}...`);
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.google.com/'
                }
            });

            const html = response.data;
            let videoIds = [];

            // Attempt 1: Universal Data for Rehydration
            try {
                const $ = cheerio.load(html);
                const scriptData = $('#__UNIVERSAL_DATA_FOR_REHYDRATION__').text() || 
                                 $('#SIGI_STATE').text() ||
                                 $('script[id="sigi-persisted-data"]').text();
                
                if (scriptData) {
                    const jsonData = JSON.parse(scriptData);
                    const itemModule = jsonData['__DEFAULT_SCOPE__']?.['webapp.user-detail']?.['itemModule'] ||
                                      jsonData['ItemModule'] ||
                                      jsonData['__DEFAULT_SCOPE__']?.['webapp.video-list']?.['itemList'];
                    
                    if (itemModule) {
                        videoIds = Array.isArray(itemModule) ? itemModule.map(v => v.id) : Object.keys(itemModule);
                    }
                }
            } catch (e) {
                console.warn('JSON parsing failed, trying regex...');
            }

            // Attempt 2: Regex Fallback (Very reliable for IDs)
            if (videoIds.length === 0) {
                const regex = /"id":"(\d{18,20})"/g;
                let match;
                while ((match = regex.exec(html)) !== null) {
                    if (!videoIds.includes(match[1])) videoIds.push(match[1]);
                }
            }

            if (videoIds.length === 0) throw new Error('No videos found in profile data');

            const enrichedVideos = [];
            console.log(`Found ${videoIds.length} video IDs. Enriching with direct URLs...`);
            
            // Sync top 6 latest
            for (const id of videoIds.slice(0, 6)) {
                try {
                    const tikwmUrl = `https://www.tikwm.com/api/?url=https://www.tiktok.com/@${this.username}/video/${id}`;
                    const tikwmResponse = await axios.get(tikwmUrl);
                    
                    if (tikwmResponse.data.code === 0) {
                        const data = tikwmResponse.data.data;
                        enrichedVideos.push({
                            id: data.id,
                            desc: data.title,
                            cover: data.cover,
                            playUrl: data.play,
                            noWmUrl: data.wmplay,
                            author: data.author.nickname,
                            timestamp: data.create_time * 1000,
                            lastUpdated: new Date()
                        });
                    } else {
                        // Fallback to official embed structure if TikWM fails
                        enrichedVideos.push({
                            id: id,
                            desc: 'مشاهدة الفيديو على تيك توك',
                            cover: `https://p16-sign-va.tiktokcdn.com/obj/tos-maliva-p-0068/7356241078972583169`, 
                            playUrl: `https://www.tiktok.com/embed/v2/${id}`,
                            timestamp: Date.now(),
                            lastUpdated: new Date()
                        });
                    }
                } catch (e) {
                    console.warn(`Failed to enrich video ${id}:`, e.message);
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Save to Firestore
            if (db && enrichedVideos.length > 0) {
                const batch = db.batch();
                enrichedVideos.forEach(v => {
                    const docRef = db.collection(this.cacheCollection).doc(v.id);
                    batch.set(docRef, { ...v, dbUpdated: admin.firestore.FieldValue.serverTimestamp() });
                });
                await batch.commit();
            }

            console.log(`TikTok sync successful: Cached ${enrichedVideos.length} enriched videos.`);
            return enrichedVideos;
        } catch (error) {
            console.error('TikTok Sync Error:', error.message);
            return this.getFallbackVideos(); 
        }
    }

    startAutoSync() {
        console.log(`TikTok Auto-Sync started (${this.interval / 60000}m interval)`);
        this.fetchLatestVideos();
        setInterval(() => this.fetchLatestVideos(), this.interval);
    }

    async getCachedVideos(limit = 6, offset = 0) {
        if (!db) return this.getFallbackVideos();
        
        try {
            const snapshot = await db.collection(this.cacheCollection)
                                   .orderBy('timestamp', 'desc')
                                   .limit(limit + offset)
                                   .get();
            
            const videos = snapshot.docs.map(doc => doc.data()).slice(offset);
            if (videos.length === 0 && offset === 0) return this.getFallbackVideos();
            return videos;
        } catch (error) {
            return this.getFallbackVideos();
        }
    }

    getFallbackVideos() {
        return [
            { 
                id: '7630594573513035029', 
                desc: 'أثر التميز السينمائي', 
                cover: 'https://p16-common-sign.tiktokcdn.com/tos-alisg-avt-0068/1760d15401c1ed79a88938987206b8d4~tplv-tiktokx-cropcenter:1080:1080.jpeg',
                playUrl: 'https://www.tiktok.com/embed/v2/7630594573513035029'
            },
            { 
                id: '7630239440950103317', 
                desc: 'حول منتجك إلى تجربة سينمائية', 
                cover: 'https://p16-common-sign.tiktokcdn.com/tos-alisg-avt-0068/1760d15401c1ed79a88938987206b8d4~tplv-tiktokx-cropcenter:1080:1080.jpeg',
                playUrl: 'https://www.tiktok.com/embed/v2/7630239440950103317'
            },
            { 
                id: '7630238161876077845', 
                desc: 'سحر المونتاج مع أثر', 
                cover: 'https://p16-common-sign.tiktokcdn.com/tos-alisg-avt-0068/1760d15401c1ed79a88938987206b8d4~tplv-tiktokx-cropcenter:1080:1080.jpeg',
                playUrl: 'https://www.tiktok.com/embed/v2/7630238161876077845'
            }
        ];
    }
}

module.exports = new TikTokService();
