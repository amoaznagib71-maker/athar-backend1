const axios = require('axios');
const cheerio = require('cheerio');

async function testTikTokScrape() {
    const username = 'athar_q85';
    const url = `https://www.tiktok.com/@${username}`;
    
    try {
        console.log(`Fetching ${url}...`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });
        
        const $ = cheerio.load(response.data);
        const scriptData = $('#__UNIVERSAL_DATA_FOR_REHYDRATION__').text();
        
        if (!scriptData) {
            console.log('Could not find rehydration data. TikTok might be blocking or using a different structure.');
            return;
        }

        const jsonData = JSON.parse(scriptData);
        // Path might vary, common place is: 
        // jsonData['__DEFAULT_SCOPE__']['webapp.user-detail']['userInfo']['itemModule']
        // or similar
        console.log('Successfully retrieved hydration data.');
        
        // Let's log some structure to understand where videos are
        const items = jsonData['__DEFAULT_SCOPE__']?.['webapp.user-detail']?.['itemModule'];
        if (items) {
            const videoIds = Object.keys(items);
            console.log(`Found ${videoIds.length} videos.`);
            videoIds.slice(0, 3).forEach(id => {
                console.log(`- Video ID: ${id}, Desc: ${items[id].desc}`);
            });
        } else {
            console.log('Video items not found in expected path.');
            // Dump top level keys for debugging
            // console.log(Object.keys(jsonData['__DEFAULT_SCOPE__']));
        }

    } catch (error) {
        console.error('Scrape failed:', error.message);
    }
}

testTikTokScrape();
