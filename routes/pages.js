import express from 'express';
import UserProfile from '../src/models/UserProfile.js';
import Article from '../src/models/Article.js';
import BanAppeal from '../src/models/BanAppeal.js';
import { checkAuth } from '../middleware/checkAuth.js';
import Notification from '../src/models/Notification.js';
import { checkWikiAccess } from '../middleware/checkWikiAccess.js';
import Giveaway from '../src/models/Giveaway.js'
import cache from '../src/utils/cache.js';
import { checkMaintenance } from '../middleware/maintenance.js';
import Marriage from '../src/models/Marriage.js';
import UserActivity from '../src/models/UserActivity.js';
import { ITEMS, getItemDefinition } from '../src/utils/definitions/itemDefinitions.js';
import SystemStatus from '../src/models/SystemStatus.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

router.use(checkMaintenance);

const discordOnly = (req, res, next) => {
    if (req.user && req.user.id.startsWith('tg_')) {
        return res.redirect('/?error=discord_only');
    }
    next();
};

let cachedDiscordStats = {
    members: 35000,
    online: 5000,
    lastUpdate: 0
};

async function getDiscordStats() {
    const NOW = Date.now();
    if (NOW - cachedDiscordStats.lastUpdate < 300000) {
        return cachedDiscordStats;
    }

    try {
        const response = await fetch(`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}?with_counts=true`, {
            headers: { 
                Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` 
            }
        });

        if (response.ok) {
            const data = await response.json();
            cachedDiscordStats = {
                members: data.approximate_member_count || cachedDiscordStats.members,
                online: data.approximate_presence_count || cachedDiscordStats.online,
                lastUpdate: NOW
            };
        }
    } catch (err) {
        console.error('Ошибка при получении статистики Discord:', err);
    }

    return cachedDiscordStats;
}

router.get('/', async (req, res) => {
    const jsonLD = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "name": "Дача Зейна",
                "url": "https://dachazeyna.com",
                "logo": "https://dachazeyna.com/assets/img/logo.png",
                "sameAs": [
                    "https://discord.gg/bandazeyna",
                    "https://www.youtube.com/@ZeynBss"
                ]
            },
            {
                "@type": "WebSite",
                "url": "https://dachazeyna.com/",
                "potentialAction": {
                    "@type": "SearchAction",
                    "target": "https://dachazeyna.com/leaderboard?q={search_term_string}",
                    "query-input": "required name=search_term_string"
                }
            },
            {
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Что такое Дача Зейна?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Это крупнейшее русскоязычное сообщество по игре Bee Swarm Simulator в Roblox с уникальной экономикой и ботом."
      }
    },
    {
      "@type": "Question",
      "name": "Как работает экономика сервера?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Экономика основана на Звездах, которые можно получать за активность и тратить в магазине или на бирже акций."
      }
    }
  ]
}
        ]
    };

    try {
        const discordStats = await getDiscordStats();

        const statsCacheKey = 'home_stats';
        let dbStats = cache.get(statsCacheKey);

        if (!dbStats) {
            const totalUsers = await UserProfile.countDocuments({ guildId: process.env.GUILD_ID });
            const economyStats = await UserProfile.aggregate([
                { $match: { guildId: process.env.GUILD_ID } },
                { $group: { _id: null, totalStars: { $sum: "$stars" } } }
            ]);

            const topUsers = await UserProfile.find({ guildId: process.env.GUILD_ID })
                .sort({ totalMessages: -1, stars: -1 }) 
                .limit(5)
                .select('userId username avatar stars level totalMessages')
                .lean();

            dbStats = { 
                users: totalUsers, 
                stars: economyStats[0]?.totalStars || 0,
                topUsers: topUsers 
            };
            cache.set(statsCacheKey, dbStats, 300);
        }
        
        let myProfile = null;
        if (req.user) {
            myProfile = await UserProfile.findOne({ userId: req.user.id, guildId: process.env.GUILD_ID }).lean();
        }

        res.render('index', { 
            user: req.user, 
            stats: {
                serverMembers: discordStats.members,
                onlineMembers: discordStats.online,
                users: dbStats.users,
                stars: dbStats.stars
            },
            topUsers: dbStats.topUsers,
            title: 'Дача Зейна | Сообщество Bee Swarm Simulator в Roblox',
            description: 'Дача Зейна — крупнейшее русскоязычное сообщество по BSS. Уникальный бот, своя экономика, гайды по пчелам и регулярные розыгрыши. Присоединяйся к нам в Discord и развивайся вместе с нами!',
            myProfile, 
            currentPath: '/', 
            jsonLD
        });

    } catch (e) { 
        console.error('Ошибка главной страницы:', e);
        
        res.render('index', { 
            user: req.user, 
            stats: { 
                serverMembers: 35000, 
                onlineMembers: 5000,
                users: 0, 
                stars: 0 
            }, 
            heroStock: {}, 
            myProfile: null,
            currentPath: '/',
            title: 'Главная | Дача Зейна',
            jsonLD
        }); 
    }
});

router.get('/wiki', async (req, res) => {
    try {
        const searchQuery = req.query.q;
        let query = { isPublished: true };
        if (searchQuery) {
            query.$or = [{ title: { $regex: searchQuery, $options: 'i' } }, { tags: { $regex: searchQuery, $options: 'i' } }];
        }
        const articles = await Article.find(query).sort({ views: -1 }).limit(50).lean();
        const categories = { 'guides': [], 'bees': [], 'items': [], 'mechanics': [], 'server': [] };
        articles.forEach(art => { if (categories[art.category]) categories[art.category].push(art); });

      const jsonLD = {
           "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    { "@type": "ListItem", "position": 1, "name": "Главная", "item": "https://dachazeyna.com" },
                    { "@type": "ListItem", "position": 2, "name": "Вики", "item": "https://dachazeyna.com/wiki" }
                ]
            },
            {
                "@type": "CollectionPage",
                "name": "Вики сообщества Дача Зейна",
                "description": "Справочник по игре Bee Swarm Simulator, правила Discord сообщества и руководства по экосистеме сайта.",
                "url": "https://dachazeyna.com/wiki"
            }
        ]
        };

        res.render('wiki', { 
            user: req.user, 
            title: 'Вики Дача Зейна | Гайды по BSS и инфо о сервере', 
            description: 'Официальная база знаний проекта Дача Зейна. Все о Bee Swarm Simulator, настройки Discord сервера, гайды по экономике и возможности сайта.',
            categories, 
            searchQuery, 
            currentPath: '/wiki', 
            jsonLD 
        });
    } catch (e) { res.status(500).render('404', { user: req.user }); }
});

router.get('/wiki/:slug', async (req, res) => {
    try {
        const article = await Article.findOne({ slug: req.params.slug });

        if (!article) {
            return res.status(404).render('404', { 
                user: req.user, 
                title: 'Страница не найдена' 
            });
        }

        let shouldCount = true;
        const userAgent = req.get('User-Agent') || '';

        const isBot = /bot|googlebot|crawler|spider|robot|crawling/i.test(userAgent);
        if (isBot) {
            shouldCount = false;
        }

        if (!req.session.viewedArticles) {
            req.session.viewedArticles = [];
        }

        const articleIdStr = article._id.toString();
        if (req.session.viewedArticles.includes(articleIdStr)) {
            shouldCount = false;
        }

        if (req.user && req.user.username === article.author) {
            shouldCount = false; 
        }

        if (shouldCount) {
            await Article.findByIdAndUpdate(article._id, { $inc: { views: 1 } });
            req.session.viewedArticles.push(articleIdStr);
            article.views += 1;
        }

        const related = await Article.find({ 
            category: article.category, 
            _id: { $ne: article._id },
            isPublished: true 
        }).limit(3);

        let ogImage = 'https://dachazeyna.com/assets/img/og-image.png';
        
        if (article.image) {
            if (article.image.startsWith('http')) {
                ogImage = article.image;
            } else {
                ogImage = `https://dachazeyna.com${article.image.startsWith('/') ? '' : '/'}${article.image}`;
            }
        }

const jsonLD = {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "BreadcrumbList",
                    "itemListElement": [
                        { "@type": "ListItem", "position": 1, "name": "Главная", "item": "https://dachazeyna.com" },
                        { "@type": "ListItem", "position": 2, "name": "Вики", "item": "https://dachazeyna.com/wiki" },
                        { "@type": "ListItem", "position": 3, "name": article.title, "item": `https://dachazeyna.com/wiki/${article.slug}` }
                    ]
                },
                {
                    "@type": "Article",
                    "headline": article.title,
                    "description": article.description,
                    "image": article.image ? (article.image.startsWith('http') ? article.image : `https://dachazeyna.com${article.image}`) : "https://dachazeyna.com/assets/img/og-image.png",
                    "author": {
                        "@type": "Person",
                        "name": article.author || "Команда Дачи Зейна"
                    },
                    "datePublished": article.createdAt,
                    "dateModified": article.updatedAt || article.createdAt,
                    "publisher": {
                        "@type": "Organization",
                        "name": "Дача Зейна",
                        "logo": { "@type": "ImageObject", "url": "https://dachazeyna.com/assets/img/logo.png" }
                    }
                }
            ]
        };

        res.render('wiki-article', { 
            user: req.user, 
            article, 
            related, 
            title: `${article.title} | Вики Дача Зейна`,
            description: article.description,
            image: ogImage,
            currentPath: `/wiki/${article.slug}`,
            ogType: 'article',
            jsonLD
        });

    } catch (e) {
        console.error(e);
        res.status(500).render('500', { user: req.user, error: e });
    }
});

router.get('/profile', checkAuth, discordOnly, async (req, res) => res.redirect(`/profile/${req.user.id}`));

router.get('/profile/:userId', async (req, res) => {
    try {
        const targetId = req.params.userId;
        const profile = await UserProfile.findOne({ userId: targetId, guildId: process.env.GUILD_ID }).lean();
        
        if (!profile) return res.status(404).render('404', { user: req.user });

        const viewer = req.user; 
        const isOwner = viewer && viewer.id === targetId;
        const targetUser = { 
            id: profile.userId, 
            username: profile.username || 'Неизвестный', 
            avatar: profile.avatar 
        };
        
        if (isOwner && viewer.avatar) targetUser.avatar = viewer.avatar;
        
        let partnerName = null;
        let marriageDate = null;
        let isMarried = false;

        const marriage = await Marriage.findOne({
            guildId: process.env.GUILD_ID,
            $or: [{ partner1Id: targetId }, { partner2Id: targetId }]
        }).lean();

        if (marriage) {
            isMarried = true;
            marriageDate = marriage.marriedAt || marriage.createdAt;
            
            const partnerId = String(marriage.partner1Id === targetId ? marriage.partner2Id : marriage.partner1Id);
            
            const partnerProfile = await UserProfile.findOne({ 
                userId: partnerId, 
                guildId: process.env.GUILD_ID 
            }).lean();

            if (partnerProfile && partnerProfile.username) {
                partnerName = partnerProfile.username;
            } else {
                partnerName = "Пользователь Discord"; 
            }
        }

        const activities = await UserActivity.find({ 
            userId: targetId, 
            guildId: process.env.GUILD_ID 
        }).sort({ date: -1 }).limit(7).lean();
        
        profile.dailyActivityHistory = activities; 

        const netWorth = profile.stars || 0; 
        const desc = `Профиль игрока ${targetUser.username}. Капитал: ${Math.floor(netWorth).toLocaleString()} ⭐.`;

        res.render('profile', {
            user: viewer, 
            targetUser, 
            profile, 
            isOwner,
            partnerName,
            marriageDate,
            isMarried,
            title: `Профиль ${targetUser.username}`,
            description: desc, 
            currentPath: `/profile/${targetId}`,
            noIndex: true,
            getItemDefinition
        });

    } catch (e) { 
        console.error(e); 
        res.status(500).render('404', { user: req.user }); 
    }
});

router.get('/leaderboard', discordOnly, (req, res) => {
    res.render('leaderboard', { 
        user: req.user, 
        currentPath: '/leaderboard' 
    });
});

router.get('/shop', checkAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const profile = await UserProfile.findOne({ userId, guildId: process.env.GUILD_ID }).lean();
        
        if (!profile) return res.redirect('/?error=no_profile');

        const shopItems = [];
        
        for (const [id, rawItem] of Object.entries(ITEMS)) {
            if (rawItem.price > 0) {
                const def = getItemDefinition(id);
                
                let imageUrl = null;
                if (def.type === 'background' || def.type === 'frame') {
                    const folder = def.type === 'background' ? 'backgrounds' : 'frames';
                    const cleanId = id.replace('bg_', '').replace('frame_', '');
                    imageUrl = `/assets/thumbnails/${folder}/${cleanId}.webp`;
                }

                shopItems.push({
                    id: def.id,
                    name: def.name,
                    description: def.description,
                    type: def.type,
                    rarity: def.rarity,
                    price: def.price,
                    displayIcon: def.displayIcon,
                    imageUrl: imageUrl
                });
            }
        }

        shopItems.sort((a, b) => a.price - b.price);

        res.render('shop', {
            user: req.user,
            profile,
            shopItems,
            title: 'Магазин | Дача Зейна',
            currentPath: '/shop'
        });
    } catch (e) {
        console.error(e);
        res.status(500).render('500', { user: req.user });
    }
});

router.get('/inventory', checkAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const profile = await UserProfile.findOne({ userId, guildId: process.env.GUILD_ID }).lean();
        
        if (!profile) return res.redirect('/?error=no_profile');

        const enrichedInventory = profile.inventory.map(slot => {
            const def = getItemDefinition(slot.itemId);
            
            let imageUrl = null;
            if (def.type === 'background' || def.type === 'frame') {
                const folder = def.type === 'background' ? 'backgrounds' : 'frames';
                const cleanId = slot.itemId.replace('bg_', '').replace('frame_', '');
                imageUrl = `/assets/thumbnails/${folder}/${cleanId}.webp`;
            }

            return {
                itemId: slot.itemId,
                amount: slot.amount,
                name: def.name,
                description: def.description,
                type: def.type,
                rarity: def.rarity,
                displayIcon: def.displayIcon,
                imageUrl: imageUrl,
                isUsable: ['lootbox', 'consumable'].includes(def.type)
            };
        });

        enrichedInventory.sort((a, b) => {
            const typeWeight = { 'lootbox': 1, 'consumable': 2, 'material': 3, 'key': 4, 'frame': 5, 'background': 6, 'role': 7 };
            return (typeWeight[a.type] || 99) - (typeWeight[b.type] || 99);
        });

        res.render('inventory', {
            user: req.user,
            profile,
            inventory: enrichedInventory,
            title: 'Инвентарь',
            currentPath: '/inventory'
        });
    } catch (e) {
        console.error(e);
        res.status(500).render('500', { user: req.user });
    }
});

const getItemData = (id) => {
    const items = {
        wood: { name: 'Дерево', emoji: '🪵' },
        iron: { name: 'Железо', emoji: '⛓️' },
        daily_bag: { name: 'Ежедневная сумка', emoji: '🎒' },
        bronze_chest: { name: 'Бронз. сундук', emoji: '🥉' },
        star_dust: { name: 'Звездная пыль', emoji: '✨' },
        electronic_part: { name: 'Деталь', emoji: '⚙️' },
        cyber_chip: { name: 'Кибер-чип', emoji: '💽' },
        silver_chest: { name: 'Серебр. сундук', emoji: '🥈' },
        magic_powder: { name: 'Маг. порошок', emoji: '🧪' },
        luck_potion: { name: 'Зелье удачи', emoji: '🍀' },
        xp_boost_small: { name: 'Малый XP Буст', emoji: '📈' },
        cyber_box: { name: 'Кибер-бокс', emoji: '📦' },
        key_fragment: { name: 'Фрагмент ключа', emoji: '🗝️' },
        star_contract: { name: 'Контракт', emoji: '📜' },
        xp_boost_large: { name: 'Большой XP Буст', emoji: '🚀' },
        mystery_box: { name: 'Мистери бокс', emoji: '❓' },
        legendary_cache: { name: 'Легенд. тайник', emoji: '🏆' }
    };
    return items[id] || { name: 'Предмет', emoji: '🎁' };
};

const rawRewards = [
    { stars: 100 }, { stars: 150 }, { stars: 150, itemId: 'wood', amount: 3 },
    { stars: 200 }, { stars: 200, itemId: 'iron', amount: 2 }, { stars: 250, itemId: 'daily_bag', amount: 1 },
    { stars: 500, itemId: 'bronze_chest', amount: 1 }, { stars: 300 }, { stars: 300, itemId: 'star_dust', amount: 5 },
    { stars: 350 }, { stars: 350, itemId: 'electronic_part', amount: 2 }, { stars: 400 },
    { stars: 450, itemId: 'cyber_chip', amount: 1 }, { stars: 1000, itemId: 'silver_chest', amount: 1 },
    { stars: 500 }, { stars: 500, itemId: 'magic_powder', amount: 2 }, { stars: 550 },
    { stars: 550, itemId: 'luck_potion', amount: 1 }, { stars: 600 }, { stars: 650, itemId: 'xp_boost_small', amount: 2 },
    { stars: 1500, itemId: 'cyber_box', amount: 1 }, { stars: 700 }, { stars: 750, itemId: 'key_fragment', amount: 2 },
    { stars: 800 }, { stars: 850, itemId: 'star_contract', amount: 1 }, { stars: 900 },
    { stars: 1000, itemId: 'xp_boost_large', amount: 1 }, { stars: 2000, itemId: 'mystery_box', amount: 1 },
    { stars: 1500 }, { stars: 3000, itemId: 'legendary_cache', amount: 1 }
];

const dailyRewards = rawRewards.map((r, index) => {
    let desc = `${r.stars} ⭐`;
    let mainEmoji = r.stars >= 1000 ? '💎' : (r.stars >= 400 ? '💰' : '🪙');
    
    if (r.itemId) {
        const item = getItemDefinition(r.itemId);
        desc += ` + ${r.amount}x ${item.name}`;
        mainEmoji = item.displayIcon;
    }
    
    return { day: index + 1, description: desc, emoji: mainEmoji };
});

router.get('/daily', discordOnly, checkAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const profile = await UserProfile.findOne({ userId, guildId: process.env.GUILD_ID }).lean();
        if (!profile) return res.redirect('/');

        const now = new Date();
        const lastClaim = profile.lastDailyAt ? new Date(profile.lastDailyAt) : null;
        
        let canClaim = false; 
        let nextClaimTime = null;

        if (lastClaim && (now - lastClaim) < 22 * 60 * 60 * 1000) {
            nextClaimTime = new Date(lastClaim.getTime() + 22 * 60 * 60 * 1000);
        } else {
            canClaim = true;
        }

        const currentDayCycle = (profile.dailyStreak % 30) + (canClaim ? 1 : 0);
        const visualDay = currentDayCycle > 30 ? 1 : (currentDayCycle === 0 ? 1 : currentDayCycle);

        res.render('daily', { 
            user: req.user, 
            title: 'Ежедневные награды', 
            streak: profile.dailyStreak,
            canClaim, 
            nextClaimTime: nextClaimTime ? nextClaimTime.getTime() : null, 
            rewards: dailyRewards, 
            currentDay: visualDay, 
            currentPath: '/daily', 
            noIndex: true 
        });
    } catch (e) { 
        console.error(e);
        res.status(500).render('404', { user: req.user }); 
    }
});

router.get('/messages', checkAuth, (req, res) => res.render('messages', { user: req.user, activeChatId: null, title: 'Сообщения', currentPath: '/messages', noIndex: true }));
router.get('/messages/:userId', checkAuth, (req, res) => res.render('messages', { user: req.user, activeChatId: req.params.userId, title: 'Сообщения', currentPath: '/messages', noIndex: true }));

router.get('/bot', async (req, res) => {
    const totalUsers = await UserProfile.countDocuments({ guildId: process.env.GUILD_ID });
    
    const bgDir = path.join(process.cwd(), 'public/assets/backgrounds');
    const frameDir = path.join(process.cwd(), 'public/assets/frames');
    
    const getImages = (dir) => {
        try {
            return fs.readdirSync(dir).filter(file => /\.(webp|png|jpg|jpeg|gif)$/i.test(file));
        } catch (err) {
            console.error('Ошибка чтения папки', dir, err);
            return [];
        }
    };

    const bgAssets = getImages(bgDir).map(file => `/assets/backgrounds/${file}`);
    const frameAssets = getImages(frameDir).map(file => `/assets/frames/${file}`);

    res.render('bot', { 
        user: req.user, 
        title: 'О Боте', 
        description: 'Официальный бот сервера Дача Зейна. Уникальная экономика, биржа акций, кланы, браки и ежедневные награды.', 
        stats: { users: totalUsers }, 
        currentPath: '/bot',
        bgAssets: bgAssets,
        frameAssets: frameAssets
    });
});

router.get('/status', async (req, res) => {
    try {
        const incidents = await SystemStatus.find({ type: 'incident' })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentIncidents = await SystemStatus.find({ 
            type: 'incident', 
            createdAt: { $gte: thirtyDaysAgo } 
        }).lean();

        const activeIncidents = await SystemStatus.find({ type: 'incident', resolved: false }).lean();
        const isSystemHealthy = activeIncidents.length === 0;

        const currentStatus = {
            site: 'online',
            bot: activeIncidents.some(i => i.service === 'bot') ? 'offline' : 'online',
            database: activeIncidents.some(i => i.service === 'database') ? 'offline' : 'online'
        };

        const generateUptimeBars = (serviceName) => {
            const bars = [];
            for(let i=29; i>=0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];

                const dayIncidents = recentIncidents.filter(inc => 
                    inc.service === serviceName && 
                    new Date(inc.createdAt).toISOString().split('T')[0] === dateStr
                );

                if (dayIncidents.length > 0) {
                    bars.push({ status: 'issue', title: `Сбои: ${d.toLocaleDateString('ru-RU')}` });
                } else {
                    bars.push({ status: 'good', title: `Работает: ${d.toLocaleDateString('ru-RU')}` });
                }
            }
            return bars;
        };

        const calculateUptimePct = (serviceName) => {
            const serviceIncidents = recentIncidents.filter(inc => inc.service === serviceName);
            let downtimeMs = 0;
            
            serviceIncidents.forEach(inc => {
                const start = new Date(inc.createdAt).getTime();
                const end = (inc.resolved && inc.resolvedAt) ? new Date(inc.resolvedAt).getTime() : Date.now();
                downtimeMs += (end - start);
            });
            
            const totalMs = 30 * 24 * 60 * 60 * 1000; 
            const uptime = ((totalMs - downtimeMs) / totalMs) * 100;
            
            return uptime >= 100 ? '100' : Math.max(0, uptime).toFixed(2);
        };

        const uptimeData = {
            site: generateUptimeBars('site'),
            bot: generateUptimeBars('bot'),
            database: generateUptimeBars('database'),
            
            sitePct: calculateUptimePct('site'),
            botPct: calculateUptimePct('bot'),
            dbPct: calculateUptimePct('database')
        };

        res.render('status', {
            user: req.user,
            title: 'Статус Системы | Дача Зейна',
            description: 'Отслеживание состояния серверов, бота и API в реальном времени.',
            currentPath: '/status',
            incidents,
            uptimeData,
            isSystemHealthy,
            currentStatus
        });
    } catch (e) {
        console.error('Ошибка на странице статусов:', e);
        res.status(500).render('500', { user: req.user });
    }
});

router.get('/terms', (req, res) => res.render('terms', { 
    user: req.user, title: 'Условия использования',
    description: 'Правила использования сервисов проекта Дача Зейна.',
    currentPath: '/terms'
}));
router.get('/privacy', (req, res) => res.render('privacy', { 
    user: req.user, title: 'Политика конфиденциальности',
    description: 'Информация о том, какие данные мы собираем и как их используем.',
    currentPath: '/privacy'
}));

router.get('/admin/wiki', checkAuth, checkWikiAccess, async (req, res) => {
    const articles = await Article.find().sort({ createdAt: -1 }).lean();
    res.render('admin-wiki-list', { user: req.user, articles, noIndex: true });
});

router.get('/admin/wiki/new', checkAuth, checkWikiAccess, async (req, res) => {
    res.render('admin-wiki-edit', { user: req.user, article: null, noIndex: true });
});

router.get('/admin/wiki/edit/:id', checkAuth, checkWikiAccess, async (req, res) => {
    const article = await Article.findById(req.params.id).lean();
    if (!article) return res.redirect('/admin/wiki');
    res.render('admin-wiki-edit', { user: req.user, article, noIndex: true });
});

router.get('/img/proxy/avatar/:userId/:hash', async (req, res) => {
    try {
        const { userId, hash } = req.params;
        const discordUrl = `https://cdn.discordapp.com/avatars/${userId}/${hash}.webp?size=128`;

        const response = await fetch(discordUrl);

        if (!response.ok) {
            return res.redirect('/assets/img/avatars/default_avatar.png');
        }

        res.setHeader('Cache-Control', 'public, max-age=604800'); 
        res.setHeader('Content-Type', 'image/webp'); 

        const arrayBuffer = await response.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));

    } catch (e) {
        res.redirect('/assets/img/avatars/default_avatar.png');
    }
});

router.get('/giveaways', discordOnly, checkAuth, async (req, res) => {
    try {
        const now = new Date();

        const activeGiveaways = await Giveaway.find({ 
            ended: false, 
            endTime: { $gt: now } 
        }).sort({ endTime: 1 }).lean();

        const endedGiveaways = await Giveaway.find({ 
            ended: true 
        }).sort({ endTime: -1 }).limit(12).lean();

        const allWinnerIds = endedGiveaways.flatMap(g => g.forcedWinners || []);
        
        let winnerMap = {};
        if (allWinnerIds.length > 0) {
            const winnerProfiles = await UserProfile.find({ userId: { $in: allWinnerIds } })
                .select('userId username').lean();
            winnerProfiles.forEach(p => { winnerMap[p.userId] = p.username; });
        }

        endedGiveaways.forEach(g => {
            g.winnerNames = (g.forcedWinners || []).map(id => winnerMap[id] || 'Неизвестный');
        });

        const enrichedActive = activeGiveaways.map(g => ({
            ...g,
            isJoined: g.participants.includes(req.user.id),
            timeLeft: Math.max(0, new Date(g.endTime) - now)
        }));

        res.render('giveaways', { 
            user: req.user, 
            active: enrichedActive, 
            ended: endedGiveaways,
            title: 'Розыгрыши | Халява',
            description: 'Участвуй в регулярных розыгрышах ценных призов на сервере Дача Зейна.',
            currentPath: '/giveaways'
        });

    } catch (e) {
        console.error('[Page Giveaways] Error:', e);
        res.status(500).render('404', { user: req.user });
    }
});

router.get('/banned', async (req, res) => {
    if (!req.user || !req.user.isBanned) return res.redirect('/');
    
    try {
        const existingAppeal = await BanAppeal.findOne({ 
            userId: req.user.id, 
            status: 'PENDING' 
        });

        const rejectedAppeal = await BanAppeal.findOne({
            userId: req.user.id,
            status: 'REJECTED'
        });

        res.render('banned', { 
            user: req.user, 
            title: 'Доступ ограничен',
            reason: req.user.banReason || 'Нарушение правил сервера',
            hasPendingAppeal: !!existingAppeal,
            hasRejectedAppeal: !!rejectedAppeal
        });
    } catch (error) {
        console.error("Ошибка при загрузке страницы бана:", error);
        res.status(500).send("Произошла ошибка системы.");
    }
});

router.get('/admin/appeals', checkAuth, async (req, res) => {
    const ADMIN_IDS = ['438744415734071297', '690482405999378452', '545152657174691849', '859417372146270278'];
    if (!ADMIN_IDS.includes(req.user.id)) return res.redirect('/');

    const appeals = await BanAppeal.find({ status: 'PENDING' }).sort({ createdAt: 1 }).lean();

    res.render('admin-appeals', { 
        user: req.user, 
        appeals, 
        title: 'Апелляции (Admin)',
        noIndex: true
    });
});

router.get('/sitemap.xml', async (req, res) => {
    try {
        const articles = await Article.find({ isPublished: true })
                                      .select('slug updatedAt');

        const baseUrl = 'https://dachazeyna.com';
        
        const staticPages = [
            { url: '/', priority: 1.00 },
            { url: '/wiki', priority: 0.80 },
            { url: '/leaderboard', priority: 0.80 },
            { url: '/bot', priority: 0.80 },
            { url: '/terms', priority: 0.50 },
            { url: '/privacy', priority: 0.50 }
        ];

        let xml = '<?xml version="1.0" encoding="UTF-8"?>';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

        const today = new Date().toISOString();
        staticPages.forEach(page => {
            xml += `
            <url>
                <loc>${baseUrl}${page.url}</loc>
                <lastmod>${today}</lastmod>
                <priority>${page.priority}</priority>
                <changefreq>daily</changefreq>
            </url>`;
        });

        articles.forEach(article => {
            xml += `
            <url>
                <loc>${baseUrl}/wiki/${article.slug}</loc>
                <lastmod>${new Date(article.updatedAt).toISOString()}</lastmod>
                <priority>0.70</priority>
                <changefreq>weekly</changefreq>
            </url>`;
        });

        xml += '</urlset>';

        res.header('Content-Type', 'application/xml');
        res.send(xml);

    } catch (e) {
        console.error(e);
        res.status(500).end();
    }
});

router.get('/verify', (req, res) => {
    if (req.user) {
        return res.redirect('/?success=already_verified');
    }
    
    res.render('verify', { 
        user: req.user, 
        title: 'Верификация | Дача Зейна',
        description: 'Пройдите верификацию для доступа ко всем функциям сервера Дача Зейна.',
        currentPath: '/verify'
    });
});

export default router;