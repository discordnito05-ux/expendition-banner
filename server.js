const express = require('express');
const app = express();

app.use(express.json());

// ข้อมูลจำลอง (ตัวแปรนี้จะเก็บข้อมูลล่าสุดที่สคริปต์ส่งมา)
let currentBanners = {
    Standard: [],
    Mini: []
};

// 📌 1. ระบบจับคู่ชื่อตัวละครกับรูปภาพ (ใส่ลิงก์รูปภาพของคุณที่นี่)
// แนะนำ: ใช้รูปตัวละครแบบเต็มตัว พื้นหลังโปร่งใส (PNG cutout / standee) เพื่อให้ซ้อนทับกันได้สวยงาม
const imageMap = {
    "Frieren": "https://s6.imgcdn.dev/YFqj02.png",
    "Gabimaru": "https://s6.imgcdn.dev/YFqMjH.png",
    "Gowther": "https://s6.imgcdn.dev/YFqw3i.png",
    "Inumaki": "https://s6.imgcdn.dev/YFqcTS.png",
    "Yuta": "https://s6.imgcdn.dev/YFquRC.png",
    // เพิ่มรายชื่อตัวละครอื่นๆ และลิงก์รูปให้ครบ (ชื่อต้องตรงกับที่ .lua ส่งมาทุกตัวอักษร)
};

// รูป fallback (SVG เงาคน) กรณีลิงก์รูปเสีย/ยังไม่ได้ใส่ ไม่ให้ banner โชว์ไอคอนรูปหักๆ
const PLACEHOLDER_SVG = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 140%22%3E%3Ccircle cx=%2250%22 cy=%2234%22 r=%2226%22 fill=%22%232a2d3d%22/%3E%3Cpath d=%22M10 138c2-46 30-64 40-64s38 18 40 64Z%22 fill=%22%232a2d3d%22/%3E%3C/svg%3E";

// รูปบางตัวสัดส่วนไฟล์ผิดปกติ (กว้าง/เตี้ยกว่าตัวอื่นมาก) ทำให้ดูเล็กกว่าตัวอื่นทั้งที่ width เท่ากัน
// ใช้ scale ชดเชยเฉพาะรูปนั้นๆ ที่ตัว <img> โดยตรง ไม่กระทบ container (mask/aspect-ratio ของตัวอื่นยังเหมือนเดิม)
const imageScaleMap = {
    "Frieren": 1.42,
    "Gowther": 0.7,
};
const getImageScale = (name) => {
    // 1. ถ้ามีการตั้งค่าสเกลเฉพาะตัวไว้ (เช่น Frieren, Gowther) ให้ใช้ค่านั้นก่อน
    if (imageScaleMap[name]) return imageScaleMap[name];
    
    // 2. ถ้าเป็นตัวละครที่ไม่มีใน imageMap (Unknown Unit) ให้ปรับตัวเลขตรงนี้ให้น้อยกว่า 1
    // ลองเปลี่ยนเลข 0.8 หรือ 0.9 ดูจนกว่าขนาดจะพอดีครับ
    if (!imageMap[name]) return 0.8; 
    
    // 3. ตัวละครปกติที่มีในระบบ (ขนาด 100% ปกติ)
    return 1;
};

// ฟังก์ชันสำหรับดึงรูประบุตัวละคร ถ้าหาไม่เจอให้ใช้รูป Default
const getImageUrl = (name) => {
    return imageMap[name] || "https://s6.imgcdn.dev/YFq4Je.png";
};

// กันชื่อที่มีอักขระพิเศษ (เช่น < > &) ทำให้ HTML พัง
const escapeHtml = (str = '') => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// 📌 2. API สำหรับรับข้อมูลจาก Roblox Script (POST Request)
app.post('/update', (req, res) => {
    // แนะนำ: ควรเช็ค Password / API Key ตรงนี้เพื่อป้องกันคนอื่นยิงข้อมูลมั่วๆ
    const { secret, Standard, Mini } = req.body;

    if (secret !== "MY_SECRET_KEY_123") {
        return res.status(403).json({ error: "Unauthorized" });
    }

    // อัปเดตข้อมูลในหน่วยความจำ
    if (Standard) currentBanners.Standard = Standard;
    if (Mini) currentBanners.Mini = Mini;

    console.log("อัปเดตตู้สุ่มแล้ว:", currentBanners);
    res.status(200).json({ message: "Success" });
});

// 📌 3. หน้าเว็บสำหรับแสดงผล (GET Request)
app.get('/', (req, res) => {

    const emptyStateHtml = `
        <div class="empty-state">
            <div class="empty-icon">✦</div>
            <p class="empty-title">ยังไม่มี Mythic ในตู้นี้</p>
            <p class="empty-sub">ระบบจะแสดงผลทันทีที่มีการสุ่มได้</p>
        </div>`;

    // การ์ดตัวละครหนึ่งตัวบนสเตจ (role: 'front' = ตัวเด่น/อยู่หน้าสุด, 'back' = อยู่ข้างหลัง)
    const renderStandee = (name, { role, left, bottom = 5, widthPct = null, brightness = null, delay = 0 }) => {
        const styleParts = [`left:${left}%`, `bottom:${bottom}%`, `animation-delay:${delay}s`];
        if (widthPct) styleParts.push(`width:${widthPct}%`);

        const figureStyle = brightness !== null
            ? ` style="filter: drop-shadow(0 8px 14px rgba(0,0,0,.5)) brightness(${brightness}) saturate(.86);"`
            : '';

        const nameClass = role === 'front' ? 'char-name char-name--hero' : 'char-name';

        // scale ชดเชยเฉพาะรูปที่สัดส่วนไฟล์ผิดปกติ (ดู imageScaleMap ด้านบน)
        const imgScale = getImageScale(name);
        // ใช้ scale() แบบ uniform ให้ตรงกับ preview.html (ไม่ใช่ scaleY() ซึ่งจะยืดแค่แนวตั้งแล้วภาพเบี้ยว)
        const imgStyle = imgScale !== 1
            ? ` style="transform: scale(${imgScale}); transform-origin: bottom center;"`
            : '';

        return `
            <div class="standee standee--${role}" style="${styleParts.join(';')}">
                <div class="standee-figure"${figureStyle}>
                    <img src="${getImageUrl(name)}" alt="${escapeHtml(name)}" loading="lazy"${imgStyle}
                         onerror="this.onerror=null;this.src='${PLACEHOLDER_SVG}';this.style.filter='none';this.style.transform='none';">
                </div>
                <div class="standee-tag">
                    <p class="${nameClass}">${escapeHtml(name)}</p>
                    <p class="char-rarity"><span class="rarity-mythic">Mythic</span> <span class="rarity-unit">Unit</span></p>
                </div>
            </div>`;
    };

    // Standard Banner: ตัวแรก (index 0) ยืนหน้าสุด/ใหญ่สุด ตัวถัดไปยืนซ้อนอยู่ข้างหลัง สลับซ้าย-ขวา
    const renderStandardStage = (characters) => {
        if (!characters || characters.length === 0) return emptyStateHtml;

        const [front, ...back] = characters;

        const frontHtml = renderStandee(front, { role: 'front', left: 50, bottom: 3, delay: .22 });

        const backHtml = back.map((name, i) => {
            const side = i % 2 === 0 ? -1 : 1;          // ซ้าย, ขวา, ซ้าย, ขวา, ...
            const depth = Math.floor(i / 2) + 1;         // ยิ่งลึก (ตัวที่ 4-5 เป็นต้นไป) ยิ่งเล็ก/มัวลง
            const spread = Math.min(44, 24 + (depth - 1) * 15);
            const left = 50 + side * spread;
            const widthPct = Math.max(20, 38 - (depth - 1) * 6);
            const brightness = Math.max(0.6, 0.84 - (depth - 1) * 0.12);
            const bottom = 7 + (depth - 1) * 2;

            return renderStandee(name, { role: 'back', left, bottom, widthPct, brightness, delay: i * 0.06 });
        }).join('');

        // back ก่อน แล้วค่อย front ทับ (z-index ของ .standee--front การันตีอยู่หน้าสุดอยู่แล้ว)
        return `
            <div class="standee-stage">
                <div class="stage-rays"></div>
                ${backHtml}
                ${frontHtml}
                <div class="stage-floor"></div>
            </div>`;
    };

    // Mini Banner: ปกติมีตัวเดียว ไม่ต้องจัดลำดับหน้า-หลัง เลยให้ทุกตัวอยู่ "เลเยอร์เดียวกัน" เรียงเท่าๆ กัน
    const renderMiniStage = (characters) => {
        if (!characters || characters.length === 0) return emptyStateHtml;

        const n = characters.length;
        const html = characters.map((name, i) => {
            const left = n === 1 ? 50 : ((i + 1) / (n + 1)) * 100;
            const widthPct = n === 1 ? null : Math.max(16, Math.min(30, 60 / n));
            return renderStandee(name, { role: 'front', left, bottom: 3, widthPct, delay: i * 0.06 });
        }).join('');

        return `
            <div class="standee-stage standee-stage--mini">
                <div class="stage-rays"></div>
                ${html}
                <div class="stage-floor"></div>
            </div>`;
    };

    const now = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const html = `
        <!DOCTYPE html>
        <html lang="th">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Anime Expeditionss · Mythic Tracker</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap" rel="stylesheet">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }

                :root {
                    --ink: #0a0b12;
                    --panel: #14151f;
                    --panel-2: #1a1c29;
                    --hairline: rgba(255,255,255,0.07);
                    --text: #ecedf4;
                    --text-dim: #868aa0;
                    --arcane-blue: #5b8cff;
                    --arcane-violet: #a16bff;
                    --gold: #ffd166;
                    --mythic-foil: linear-gradient(90deg, #ffd166, #ff6f91, #a16bff, #5b8cff, #5ee7b7, #ffd166);
                }

                body {
                    min-height: 100vh;
                    background:
                        radial-gradient(circle at 15% -10%, rgba(91,140,255,0.14), transparent 42%),
                        radial-gradient(circle at 90% 8%, rgba(161,107,255,0.12), transparent 42%),
                        var(--ink);
                    color: var(--text);
                    font-family: 'Sora', 'Leelawadee UI', 'Noto Sans Thai', system-ui, sans-serif;
                    padding: 48px 20px 80px;
                    overflow-x: hidden;
                }

                .bg-orb { position: fixed; border-radius: 50%; filter: blur(90px); z-index: -1; opacity: .6; pointer-events: none; }
                .orb-1 { width: 400px; height: 400px; background: #5b8cff33; top: -160px; left: -120px; }
                .orb-2 { width: 350px; height: 350px; background: #a16bff2e; bottom: -140px; right: -100px; }

                .page-header { text-align: center; margin-bottom: 44px; animation: fadeDown .6s ease both; }
                .logo-block { margin-bottom: 28px; }
                .page-header .site-logo { height: 384px; width: auto; }
                .live-status {
                    display: inline-flex; align-items: center; gap: 8px;
                    font-size: 12.5px; color: var(--text-dim);
                    background: var(--panel); border: 1px solid var(--hairline);
                    padding: 7px 16px; border-radius: 999px;
                }
                .live-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; animation: pulse 2s infinite; }
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(74,222,128,.55); }
                    70% { box-shadow: 0 0 0 7px rgba(74,222,128,0); }
                    100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); }
                }

                main { max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 32px; }

                .banner-section {
                    background: linear-gradient(180deg, rgba(255,255,255,.025), rgba(255,255,255,0));
                    border: 1px solid var(--hairline);
                    border-radius: 20px;
                    padding: 22px;
                    animation: fadeUp .6s ease both;
                }

                .section-header {
                    display: flex; align-items: center; justify-content: space-between;
                    margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--hairline);
                }
                .section-title { display: flex; align-items: center; gap: 10px; }
                .gem-icon { font-size: 19px; filter: drop-shadow(0 0 6px rgba(91,140,255,.55)); }
                .section-title h2 { font-size: 14.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.4px; }
                .count-badge {
                    font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px;
                    color: var(--text-dim);
                    background: var(--panel-2); border: 1px solid var(--hairline);
                    padding: 4px 12px; border-radius: 999px; white-space: nowrap;
                }

                /* ---------- Standee banner stage ---------- */

                .standee-stage {
                    position: relative;
                    aspect-ratio: 20 / 9;
                    border-radius: 16px;
                    overflow: hidden;
                    background:
                        radial-gradient(ellipse 55% 65% at 50% 8%, rgba(255,209,102,.13), transparent 60%),
                        radial-gradient(ellipse 65% 60% at 14% 96%, rgba(91,140,255,.20), transparent 65%),
                        radial-gradient(ellipse 65% 60% at 86% 96%, rgba(161,107,255,.20), transparent 65%),
                        linear-gradient(180deg, #10121c 0%, #0a0b12 55%, #06070d 100%);
                }
                .standee-stage--mini {
                    background:
                        radial-gradient(ellipse 60% 75% at 50% 4%, rgba(255,209,102,.16), transparent 62%),
                        radial-gradient(ellipse 55% 55% at 50% 100%, rgba(91,140,255,.18), transparent 65%),
                        linear-gradient(180deg, #10121c 0%, #0a0b12 55%, #06070d 100%);
                }

                .stage-rays {
                    position: absolute; inset: -35% -25% auto -25%; height: 165%;
                    background: repeating-conic-gradient(from 0deg at 50% 0%, rgba(255,255,255,.05) 0deg 2.6deg, transparent 2.6deg 13deg);
                    mix-blend-mode: screen; opacity: .4; pointer-events: none; z-index: 0;
                    animation: raysDrift 46s linear infinite;
                }
                @keyframes raysDrift { to { transform: rotate(360deg); } }

                .stage-floor {
                    position: absolute; inset: auto 0 0 0; height: 36%;
                    background: linear-gradient(180deg, transparent, rgba(0,0,0,.65));
                    z-index: 1; pointer-events: none;
                }

                .standee {
                    position: absolute; bottom: 5%;
                    display: flex; flex-direction: column; align-items: center;
                    opacity: 0; animation: standeeRise .6s cubic-bezier(.22,.85,.3,1) forwards;
                }
                .standee-figure {
                    width: 100%; aspect-ratio: 3 / 4;
                    display: flex; align-items: flex-end; justify-content: center;
                    margin-bottom: -34%;
                    -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 68%, transparent 92%);
                    mask-image: linear-gradient(to bottom, #000 0%, #000 68%, transparent 92%);
                }
                .standee-figure img { width: 100%; height: 100%; object-fit: contain; object-position: bottom; display: block; }

                .standee--front {
                    left: 50%; bottom: 3%; z-index: 20;
                    width: clamp(210px, 46%, 420px);
                    animation-delay: .22s;
                }
                .standee--front .standee-figure { filter: drop-shadow(0 10px 20px rgba(0,0,0,.5)) drop-shadow(0 0 24px rgba(255,209,102,.35)); }

                .standee--back {
                    z-index: 5; bottom: 8%;
                    width: clamp(172px, 38%, 344px);
                    animation-delay: 0s;
                }
                .standee--back .standee-figure { filter: drop-shadow(0 8px 14px rgba(0,0,0,.5)) brightness(.82) saturate(.86); }

                .standee-tag { margin-top: 10px; text-align: center; max-width: 96%; position: relative; z-index: 2; }
                .standee-tag .char-name { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .standee-tag .char-name--hero { font-size: 15px; font-weight: 700; }
                .standee--back .standee-tag .char-name { font-size: 11px; color: var(--text-dim); }
                .standee-tag .char-rarity { font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; margin-top: 2px; }

                .rarity-mythic {
                    background: var(--mythic-foil); background-size: 300% auto;
                    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
                    animation: shimmer 4s linear infinite;
                }
                .rarity-unit { color: var(--text-dim); }
                @keyframes shimmer { to { background-position: -300% center; } }

                @keyframes standeeRise {
                    from { opacity: 0; transform: translate(-50%, 18px) scale(.94); }
                    to   { opacity: 1; transform: translate(-50%, 0) scale(1); }
                }

                .empty-state {
                    text-align: center; padding: 46px 20px;
                    border: 1px dashed var(--hairline); border-radius: 16px;
                }
                .empty-icon { font-size: 26px; margin-bottom: 10px; opacity: .5; }
                .empty-title { color: var(--text); font-weight: 600; font-size: 13.5px; margin-bottom: 4px; }
                .empty-sub { color: var(--text-dim); font-size: 12px; }

                @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes fadeDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

                @media (prefers-reduced-motion: reduce) {
                    *, *::before, *::after {
                        animation-duration: 0.01ms !important;
                        animation-iteration-count: 1 !important;
                        transition-duration: 0.01ms !important;
                    }
                }

                @media (max-width: 700px) {
                    .standee-stage { aspect-ratio: 16 / 10; }
                }

                @media (max-width: 480px) {
                    .page-header .site-logo { height: 204px; }
                    .banner-section { padding: 16px; }
                    .standee-stage { aspect-ratio: 4 / 3; }
                    .standee--front { width: clamp(180px, 52%, 320px); }
                    .standee--back { width: clamp(148px, 43%, 262px); }
                    .standee-tag .char-name { font-size: 11px; }
                    .standee-tag .char-name--hero { font-size: 13px; }
                }
            </style>
        </head>
        <body>
            <div class="bg-orb orb-1"></div>
            <div class="bg-orb orb-2"></div>

            <header class="page-header">
                <div class="logo-block">
                    <img class="site-logo" src="https://s6.imgcdn.dev/YFqIn0.png" alt="Mythic Pull Tracker">
                </div>
                <div class="status-block">
                    <div class="live-status"><span class="live-dot"></span>อัปเดตอัตโนมัติทุก 10 วิ · ล่าสุด ${now}</div>
                </div>
            </header>

            <main>
                <section class="banner-section">
                    <div class="section-header">
                        <div class="section-title"><span class="gem-icon">💎</span><h2>Standard Banner</h2></div>
                        <span class="count-badge">${currentBanners.Standard.length} Mythic</span>
                    </div>
                    ${renderStandardStage(currentBanners.Standard)}
                </section>

                <section class="banner-section">
                    <div class="section-header">
                        <div class="section-title"><span class="gem-icon">💎</span><h2>Mini Banner</h2></div>
                        <span class="count-badge">${currentBanners.Mini.length} Mythic</span>
                    </div>
                    ${renderMiniStage(currentBanners.Mini)}
                </section>
            </main>

            <script>
                // รีเฟรชหน้าเว็บอัตโนมัติทุกๆ 10 วินาทีเพื่อดูของใหม่
                setTimeout(() => { location.reload(); }, 10000);
            </script>
        </body>
        </html>
    `;

    res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
