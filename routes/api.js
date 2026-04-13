import express from 'express';
import UserProfile from '../src/models/UserProfile.js';
import { checkAuth } from '../middleware/checkAuth.js';
import Message from '../src/models/Message.js';
import Article from '../src/models/Article.js'
import BanAppeal from '../src/models/BanAppeal.js';
import Notification from '../src/models/Notification.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { checkWikiAccess } from '../middleware/checkWikiAccess.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import ImageKit from 'imagekit';
import { fileURLToPath } from 'url';
import { body, validationResult } from 'express-validator';
import UserActivity from '../src/models/UserActivity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

async function sendNotification(req, userId, type, message, link = null) {
    try {
        const newNotif = await Notification.create({
            userId,
            type, 
            message,
            link
        });

        const io = req.app.get('io');
        if (io) {
            io.to(String(userId)).emit('new_notification', {
                _id: newNotif._id,
                type: newNotif.type,
                message: newNotif.message,
                link: newNotif.link,
                createdAt: newNotif.createdAt,
                read: false
            });
        }
    } catch (e) {
        console.error('Ошибка отправки уведомления:', e);
    }
}

const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

const memoryStorage = multer.memoryStorage();
const uploadCloud = multer({ 
    storage: memoryStorage,
    limits: { fileSize: 50 * 1024 * 1024 }
});

async function uploadToCloud(fileBuffer, fileName, folder = '/wiki') {
    return new Promise((resolve, reject) => {
        imagekit.upload({
            file: fileBuffer,
            fileName: fileName,
            folder: folder,
            useUniqueFileName: true
        }, (err, response) => {
            if (err) return reject(err);
            resolve(response);
        });
    });
}

const chatUploadDir = path.join(__dirname, '../public/uploads/chat');
if (!fs.existsSync(chatUploadDir)) {
    fs.mkdirSync(chatUploadDir, { recursive: true });
}

const chatDiskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, chatUploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadChat = multer({ 
    storage: chatDiskStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Можно загружать только изображения!'), false);
        }
    }
});

const BOT_API_URL = process.env.BOT_API_URL || 'http://154.43.62.60:9818/api/v1'; 
const JWT_SECRET = process.env.JWT_SECRET || 'secret'; 

async function proxyToBot(endpoint, method, body, userId) {
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1m' });
    const url = `${BOT_API_URL}${endpoint}`;

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: body ? JSON.stringify(body) : undefined
        });

        const text = await response.text(); 
        
        try {
            const data = JSON.parse(text); 
            if (!response.ok) {
                return { success: false, error: data.error || `Ошибка бота: ${response.status}` };
            }
            return data;
        } catch (e) {
            console.error(`[Proxy Error] Ответ не JSON! URL: ${url}`);
            return { success: false, error: `Ошибка сервера бота.` };
        }

    } catch (err) {
        console.error(`[Proxy Network Error]:`, err);
        return { success: false, error: 'Нет связи с сервером бота' };
    }
}

router.post('/shop/buy', checkAuth, async (req, res) => {
    const result = await proxyToBot('/shop/buy', 'POST', req.body, req.user.id);
    res.json(result);
});

router.post('/inventory/use', checkAuth, async (req, res) => {
    const { itemId, quantity } = req.body;
    const result = await proxyToBot('/items/use', 'POST', { itemId, quantity }, req.user.id);

    res.json(result);
});

router.post('/daily/claim', checkAuth, async (req, res) => {
    const result = await proxyToBot('/rewards/daily', 'POST', {}, req.user.id);
    
    res.json(result);
});

router.post('/giveaways/join', checkAuth, async (req, res) => {
    const { giveawayId } = req.body;
    const result = await proxyToBot('/giveaways/join', 'POST', { giveawayId }, req.user.id);
    
    if (result.success) {
        sendNotification(req, req.user.id, 'SUCCESS', `Вы участвуете в розыгрыше! 🍀`, '/giveaways');
    }
    res.json(result);
});

router.get('/giveaways/:id/participants', checkAuth, async (req, res) => {
    const result = await proxyToBot(`/giveaways/${req.params.id}/participants`, 'GET', null, req.user.id);
    if (!result.success && !result.participants) {
        return res.status(500).json({ error: 'Ошибка связи с ботом' });
    }
    res.json(result);
});

router.post('/user/update', checkAuth, async (req, res) => {
    const { activeTitle } = req.body;
    const result = await proxyToBot('/user/update', 'POST', { activeTitle }, req.user.id);
    res.json(result);
});

router.get('/messages/conversations', checkAuth, async (req, res) => {
    const myId = req.user.id;
    try {
        const conversations = await Message.aggregate([
            { $match: { $or: [{ senderId: myId }, { receiverId: myId }] } },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: { $cond: [{ $eq: ["$senderId", myId] }, "$receiverId", "$senderId"] },
                    lastMessage: { $first: "$content" },
                    timestamp: { $first: "$createdAt" },
                    unreadCount: { $sum: { $cond: [{ $and: [{ $eq: ["$receiverId", myId] }, { $eq: ["$isRead", false] }] }, 1, 0] } }
                }
            },
            { $sort: { timestamp: -1 } }
        ]);

        const partnerIds = conversations.map(c => c._id);
        const profiles = await UserProfile.find({ userId: { $in: partnerIds } }).select('userId username avatar');
        const profileMap = new Map(profiles.map(p => [p.userId, p]));

        const result = conversations.map(c => {
            const profile = profileMap.get(c._id) || { username: 'Неизвестный', avatar: null };
            return {
                partnerId: c._id,
                username: profile.username,
                avatar: profile.avatar,
                lastMessage: c.lastMessage,
                timestamp: c.timestamp,
                unread: c.unreadCount
            };
        });

        res.json({ success: true, conversations: result });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка' });
    }
});

router.get('/messages/chat/:partnerId', checkAuth, async (req, res) => {
    const myId = req.user.id;
    const partnerId = req.params.partnerId;
    
    try {
        const [myProfile, partnerProfile] = await Promise.all([
            UserProfile.findOne({ userId: myId }),
            UserProfile.findOne({ userId: partnerId })
        ]);

        if (!partnerProfile) return res.status(404).json({ error: 'Пользователь не найден' });

        const iBlockedHim = myProfile.blockedUsers?.includes(partnerId) || false;
        const heBlockedMe = partnerProfile.blockedUsers?.includes(myId) || false;

        if (!heBlockedMe) {
            const updateResult = await Message.updateMany(
                { senderId: partnerId, receiverId: myId, isRead: false },
                { isRead: true }
            );
            if (updateResult.modifiedCount > 0) {
                req.io.to(partnerId).emit('messages_read', { readerId: myId });
            }
        }

        const messages = await Message.find({
            $or: [{ senderId: myId, receiverId: partnerId }, { senderId: partnerId, receiverId: myId }]
        }).sort({ createdAt: 1 }).limit(100);

        res.json({ 
            success: true, 
            messages,
            partner: { username: partnerProfile.username, avatar: partnerProfile.avatar },
            blockStatus: { iBlockedHim, heBlockedMe }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка чата' });
    }
});

router.post('/messages/mark_read', checkAuth, async (req, res) => {
    const { partnerId } = req.body;
    try {
        const updateResult = await Message.updateMany(
            { senderId: partnerId, receiverId: req.user.id, isRead: false },
            { isRead: true }
        );
        if (updateResult.modifiedCount > 0) {
            req.io.to(partnerId).emit('messages_read', { readerId: req.user.id });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Err' }); }
});

router.post('/messages/send', checkAuth, (req, res) => {
    uploadChat.single('image')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });

        const { receiverId, content } = req.body;
        const file = req.file;
        
        if ((!content || !content.trim()) && !file) return res.status(400).json({ error: 'Пустое сообщение' });

        try {
            const myId = req.user.id;
            const [myProfile, partnerProfile] = await Promise.all([
                UserProfile.findOne({ userId: myId }),
                UserProfile.findOne({ userId: receiverId })
            ]);

            if (!partnerProfile) return res.status(404).json({ error: 'Пользователь не найден' });
            if (myProfile.blockedUsers?.includes(receiverId)) return res.status(403).json({ error: 'Вы заблокировали его' });
            if (partnerProfile.blockedUsers?.includes(myId)) return res.status(403).json({ error: 'Вы в ЧС' });

            const msgData = {
                senderId: myId,
                receiverId,
                content: content ? content.trim() : '',
                createdAt: new Date(),
                isRead: false,
                imageUrl: file ? `/uploads/chat/${file.filename}` : undefined
            };

            const msg = await Message.create(msgData);
            
            const eventData = {
                message: msg.toObject(),
                senderUsername: req.user.username,
                senderAvatar: req.user.avatar
            };

            req.io.to(receiverId).emit('new_message', eventData);
            req.io.to(myId).emit('message_sent', eventData);
            sendNotification(
                req, 
                receiverId, 
                'INFO',
                `Новое сообщение от ${req.user.username} ✉️`, 
                `/messages` 
            );
            
            res.json({ success: true, message: msg });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Ошибка БД' });
        }
    });
});

router.post('/user/block', checkAuth, async (req, res) => {
    const { targetId, action } = req.body;
    try {
        const myProfile = await UserProfile.findOne({ userId: req.user.id });
        if (!myProfile.blockedUsers) myProfile.blockedUsers = [];

        if (action === 'block') {
            if (!myProfile.blockedUsers.includes(targetId)) myProfile.blockedUsers.push(targetId);
        } else {
            myProfile.blockedUsers = myProfile.blockedUsers.filter(id => id !== targetId);
        }
        await myProfile.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

router.post('/admin/wiki/ai-polish', checkAuth, async (req, res) => {
    try {
        const userProfile = await UserProfile.findOne({ userId: req.user.id });
        const ADMIN_IDS = ['438744415734071297'];

        const isEditor = userProfile && userProfile.isWikiEditor === true;
        const isAdmin = ADMIN_IDS.includes(req.user.id);

        if (!isAdmin && !isEditor) {
             return res.status(403).json({ error: 'Только редакторы могут использовать AI' });
        }
        const { text, context } = req.body;
        
        if (!text || text.length < 5) {
            return res.status(400).json({ error: 'Текст слишком короткий' });
        }

        const prompt = `
        Ты — профессиональный редактор и веб-дизайнер игровой Вики по Bee Swarm Simulator (сервер "Дача Зейна").
        
        Твоя задача: Взять сырой текст, исправить ошибки, улучшить стиль и оформить его в богатый HTML с эмодзи и стилями.
        
        Контекст статьи: "${context || 'Общее'}"

        СТРОГИЕ ПРАВИЛА ОФОРМЛЕНИЯ:
        1. Заголовки: Используй <h3>. Обязательно добавляй тематический эмодзи в начало каждого заголовка (например: 🚫, 📉, ⚖️, 🐝).
        2. Разделение: Между смысловыми блоками обязательно ставь тег <hr>.
        3. Списки: Если есть перечисления, используй <ul> и <li>. В начале каждого пункта <li> ставь подходящий эмодзи (например: ❌, ✅, 👉).
        4. Акценты: Важные термины выделяй тегом <b>.
        5. Блоки "Важно/Заметка": Если в тексте есть важное предупреждение или совет, оберни его в такой div:
           <div style="background: rgba(88, 101, 242, 0.1); border-left: 4px solid #5865F2; padding: 15px; border-radius: 8px; margin: 20px 0;">
               <strong>Заголовок</strong><br>Текст...
           </div>
        6. Кнопки: Если в тексте подразумевается ссылка или действие, оформи это как кнопку (по центру):
           <p style="text-align: center; margin-top: 30px;">
               <a href="#" style="background: #5865F2; color: #fff; padding: 15px 40px; border-radius: 50px; text-decoration: none; font-weight: 800; display: inline-block; box-shadow: 0 10px 30px rgba(88, 101, 242, 0.3);">ТЕКСТ КНОПКИ</a>
           </p>
        7. Вывод: Верни ТОЛЬКО чистый HTML код тела статьи. Не используй markdown (\`\`\`html).

        Сырой текст для обработки:
        ${text}
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        
        let cleanHtml = response.text()
            .replace(/```html/g, '')
            .replace(/```/g, '')
            .trim();

        res.json({ success: true, html: cleanHtml });

    } catch (e) {
        console.error('AI Error:', e);
        res.status(500).json({ error: 'Ошибка генерации ИИ. Попробуйте позже.' });
    }
});

router.post('/admin/wiki/delete-attachment', checkAuth, checkWikiAccess, async (req, res) => {
    try {
        const { articleId, filePath } = req.body;
        await Article.findByIdAndUpdate(articleId, { $pull: { attachments: { path: filePath } } });
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка удаления файла' });
    }
});

router.post('/admin/set-editor', checkAuth, async (req, res) => {
    if (req.user.id !== '438744415734071297') return res.status(403).json({ error: 'Ты не Владелец!' });
    const { targetId, state } = req.body;
    try {
        await UserProfile.findOneAndUpdate({ userId: targetId }, { isWikiEditor: state });
        res.json({ success: true, message: `Права для ${targetId} изменены на ${state}` });
    } catch (e) { res.status(500).json({ error: 'Ошибка БД' }); }
});

router.post('/admin/wiki/delete', checkAuth, async (req, res) => {
    try {
        const userProfile = await UserProfile.findOne({ userId: req.user.id });
        const ADMIN_IDS = ['438744415734071297'];
        const isEditor = userProfile && userProfile.isWikiEditor === true;
        
        if (!ADMIN_IDS.includes(req.user.id) && !isEditor) {
             return res.status(403).json({ error: 'Нет прав на удаление' });
        }

        const article = await Article.findById(req.body.id);
        if (!article) return res.status(404).json({ error: 'Статья не найдена' });

        await Article.findByIdAndDelete(req.body.id);

        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

router.post('/admin/wiki', checkAuth, uploadCloud.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'gallery', maxCount: 10 },
    { name: 'files', maxCount: 5 }
]), async (req, res) => {
    try {
        const userProfile = await UserProfile.findOne({ userId: req.user.id });
        
        const ADMIN_IDS = ['438744415734071297'];

        const isEditor = userProfile && userProfile.isWikiEditor === true;
        const isAdmin = ADMIN_IDS.includes(req.user.id);

        if (!isAdmin && !isEditor) {
            return res.status(403).json({ error: 'У вас нет прав редактора Вики!' });
        }

        const { id, title, slug, description, content, category, icon, tags, isPublished, currentImage } = req.body;

        const finalSlug = slug || title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');

        let mainImagePath = currentImage || null;
        if (req.files['mainImage'] && req.files['mainImage'][0]) {
            const file = req.files['mainImage'][0];
            const result = await uploadToCloud(file.buffer, file.originalname, '/wiki/covers');
            mainImagePath = result.url;
        }

        const articleData = {
            title,
            slug: finalSlug,
            description,
            content,
            category,
            icon: icon || 'fas fa-book',
            image: mainImagePath,
            tags: tags ? tags.split(',').map(t => t.trim()) : [],
            isPublished: isPublished === 'true' || isPublished === 'on',
            author: req.user.username
        };

        const newGalleryUrls = [];
        if (req.files['gallery']) {
            for (const file of req.files['gallery']) {
                const result = await uploadToCloud(file.buffer, file.originalname, '/wiki/gallery');
                newGalleryUrls.push(result.url);
            }
        }

        const newAttachments = [];
        if (req.files['files']) {
            for (const file of req.files['files']) {
                const fileExt = path.extname(file.originalname);
                const safeFileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExt}`;
                const result = await uploadToCloud(file.buffer, safeFileName, '/wiki/files');
                newAttachments.push({
                    name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
                    path: result.url
                });
            }
        }

        if (id) {
            const updateQuery = { ...articleData };
            const mongoUpdate = { $set: updateQuery };
            
            if (newGalleryUrls.length > 0 || newAttachments.length > 0) {
                mongoUpdate.$push = {};
                if (newGalleryUrls.length > 0) mongoUpdate.$push.gallery = { $each: newGalleryUrls };
                if (newAttachments.length > 0) mongoUpdate.$push.attachments = { $each: newAttachments };
            }
            await Article.findByIdAndUpdate(id, mongoUpdate);
        } else {
            if (newGalleryUrls.length > 0) articleData.gallery = newGalleryUrls;
            if (newAttachments.length > 0) articleData.attachments = newAttachments;
            
            const existing = await Article.findOne({ slug: finalSlug });
            if (existing) return res.status(400).json({ error: 'Такая ссылка (slug) уже существует!' });
            
            await Article.create(articleData);
        }
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка сохранения: ' + e.message });
    }
});

router.post('/webhook/user', async (req, res) => {
    try {
        const token = req.headers['x-internal-token'];
        if (token !== process.env.INTERNAL_API_TOKEN) return res.status(403).json({ error: 'Access Denied' });

        const { userId, updates } = req.body;
        if (req.io) {
            req.io.to(userId).emit('user_update', updates);
        }
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server Error' });
    }
});

router.post('/appeal', checkAuth, async (req, res) => {
    try {
        const { text } = req.body;
        if (!req.user.isBanned) return res.status(400).json({ error: 'Вы не забанены!' });
        if (!text || text.length < 10) return res.status(400).json({ error: 'Опишите ситуацию подробнее.' });

        const rejected = await BanAppeal.findOne({ userId: req.user.id, status: 'REJECTED' });
        if (rejected) return res.status(403).json({ error: 'Ваша апелляция уже была окончательно отклонена.' });

        const existing = await BanAppeal.findOne({ userId: req.user.id, status: 'PENDING' });
        if (existing) return res.status(400).json({ error: 'Ваша заявка уже на рассмотрении.' });

        await BanAppeal.create({
            userId: req.user.id,
            username: req.user.username,
            banReason: req.user.banReason || 'Неизвестно',
            appealText: text.trim()
        });

        res.json({ success: true, message: 'Апелляция отправлена!' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/admin/appeal/decide', checkAuth, async (req, res) => {
    const ADMIN_IDS = ['438744415734071297'];
    if (!ADMIN_IDS.includes(req.user.id)) return res.status(403).json({ error: 'Нет доступа' });

    try {
        const { appealId, action } = req.body;
        
        const appeal = await BanAppeal.findById(appealId);
        if (!appeal) return res.status(404).json({ error: 'Заявка не найдена' });
        if (appeal.status !== 'PENDING') return res.status(400).json({ error: 'Заявка уже закрыта' });

        appeal.handledBy = req.user.username;
        appeal.handledAt = new Date();

        if (action === 'approve') {
            appeal.status = 'APPROVED';
            await UserProfile.updateOne({ userId: appeal.userId }, { 
                isBanned: false, 
                banReason: null 
            });
            sendNotification(req, appeal.userId, 'SUCCESS', 'Ваша апелляция одобрена! Вы разбанены 🎉', '/');
        } else {
            appeal.status = 'REJECTED';
            sendNotification(req, appeal.userId, 'ERROR', 'Ваша апелляция на разбан отклонена', '/banned');
        }

        await appeal.save();
        res.json({ success: true, status: appeal.status });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка обработки' });
    }
});

router.get('/notifications', checkAuth, async (req, res) => {
    try {
        const timeLimit = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const query = {
            userId: req.user.id,
            read: false,
            createdAt: { $gt: timeLimit } 
        };
        const list = await Notification.find(query).sort({ createdAt: -1 });
        const unreadCount = list.length;
        res.json({ success: true, notifications: list, unreadCount });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false });
    }
});

router.post('/notifications/read', checkAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        if (req.body.id) {
            await Notification.findOneAndUpdate({ _id: req.body.id, userId: userId }, { read: true });
        } else {
            await Notification.updateMany({ userId: userId, read: false }, { read: true });
        }
        res.json({ success: true });
    } catch (e) {
        console.error("Ошибка чтения уведомлений:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/auth/telegram/bot-callback', async (req, res) => {
    const { nonce, telegram_id, username, photo_id } = req.body; 
    const internalToken = req.headers['x-internal-token'];

    if (internalToken !== process.env.INTERNAL_API_TOKEN) {
        console.error('⚠️ [AUTH] Попытка входа с неверным INTERNAL_TOKEN');
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    try {
        const guildId = process.env.GUILD_ID;
        let user = await UserProfile.findOne({ telegramId: telegram_id, guildId });

        const userData = {
            username: username || `User_${telegram_id}`,
            avatar: photo_id ? `tg_${photo_id}` : null, 
            telegramUsername: username
        };

        if (!user) {
            user = await UserProfile.create({
                userId: `tg_${telegram_id}`,
                guildId,
                telegramId: telegram_id,
                ...userData,
                stars: 100
            });
        } else {
            await UserProfile.updateOne({ _id: user._id }, userData);
        }

        const io = req.app.get('io');
        if (io) {
            io.to(String(nonce)).emit('tg_auth_success', { 
                tgId: telegram_id 
            });
        }

        res.json({ success: true });
    } catch (e) {
        console.error('❌ Ошибка bot-callback:', e);
        res.status(500).json({ success: false });
    }
});

router.get('/proxy/avatar/:userId/:avatarHash', async (req, res) => {
    try {
        const { userId, avatarHash } = req.params;
        
        const size = req.query.size || 64;

        const discordUrl = `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=${size}`;

        const response = await fetch(discordUrl);
        
        if (!response.ok) throw new Error('Discord avatar not found');

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        
        res.send(buffer);
    } catch (e) {
        res.redirect('/assets/img/avatars/default_avatar.png');
    }
});

router.get('/leaderboard', async (req, res) => {
    try {
        const GUILD_ID = process.env.GUILD_ID;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 25;
        const sortType = req.query.sort || 'stars';
        const period = req.query.period || 'all';
        const searchQuery = req.query.q || '';
        const skip = (page - 1) * limit;

        let formattedUsers = [];
        let totalCount = 0;

        if (period === 'all') {
            let dbField = 'stars';
            if (sortType === 'messages') dbField = 'totalMessages';
            else if (sortType === 'voice') dbField = 'totalVoiceMinutes';

            const filter = { guildId: GUILD_ID, [dbField]: { $gt: 0 } };
            if (searchQuery) filter.username = { $regex: searchQuery, $options: 'i' };

            const [users, count] = await Promise.all([
                UserProfile.find(filter).sort({ [dbField]: -1 }).skip(skip).limit(limit).select(`userId username avatar ${dbField}`).lean(),
                UserProfile.countDocuments(filter)
            ]);

            totalCount = count;
            formattedUsers = users.map(u => ({
                userId: u.userId, username: u.username, avatar: u.avatar, scoreValue: u[dbField] || 0
            }));
        } else {
            const cutoffDate = new Date();
            if (period === '1d') {
                cutoffDate.setHours(0, 0, 0, 0);
            } else if (period === '7d') {
                cutoffDate.setDate(cutoffDate.getDate() - 6);
                cutoffDate.setHours(0, 0, 0, 0);
            } else {
                cutoffDate.setDate(cutoffDate.getDate() - 29);
                cutoffDate.setHours(0, 0, 0, 0);
            }
            const cutoffTime = cutoffDate.getTime();

            const activities = await UserActivity.find({ guildId: GUILD_ID }).lean();
            let activityField = sortType === 'messages' ? 'messages' : (sortType === 'voice' ? 'voiceMinutes' : 'starsEarned');

            const userScores = new Map();
            for (const record of activities) {
                let recordTime = 0;
                if (record.createdAt) recordTime = new Date(record.createdAt).getTime();
                else if (record.date) {
                    const dStr = String(record.date);
                    if (dStr.includes('.')) {
                        const p = dStr.split('.');
                        recordTime = new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime();
                    } else recordTime = new Date(dStr).getTime();
                }
                
                if (recordTime >= cutoffTime) {
                    const current = userScores.get(record.userId) || 0;
                    userScores.set(record.userId, current + (Number(record[activityField]) || 0));
                }
            }

            const activeUsers = [];
            for (const [userId, scoreValue] of userScores.entries()) {
                if (scoreValue > 0) activeUsers.push({ userId, scoreValue });
            }

            const profiles = await UserProfile.find({ 
                guildId: GUILD_ID, 
                userId: { $in: activeUsers.map(u => u.userId) },
                ...(searchQuery ? { username: { $regex: searchQuery, $options: 'i' } } : {})
            }).select('userId username avatar').lean();

            let mergedData = activeUsers.map(active => {
                const profile = profiles.find(p => p.userId === active.userId);
                if (searchQuery && !profile) return null;
                return {
                    userId: active.userId,
                    username: profile ? profile.username : active.userId,
                    avatar: profile ? profile.avatar : null,
                    scoreValue: active.scoreValue
                };
            }).filter(u => u !== null);

            mergedData.sort((a, b) => b.scoreValue - a.scoreValue);
            totalCount = mergedData.length;
            formattedUsers = mergedData.slice(skip, skip + limit);
        }

        res.json({ success: true, leaderboard: formattedUsers, pagination: { total: totalCount, page, totalPages: Math.ceil(totalCount / limit) || 1 } });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

export default router;