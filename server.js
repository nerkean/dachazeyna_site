import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import passport from 'passport';
import { createServer } from 'http';
import { Server } from 'socket.io';
import compression from 'compression';
import helmet from 'helmet'; 
import crypto from 'crypto';
import MongoStore from 'connect-mongo';
import { Strategy as DiscordStrategy } from 'passport-discord';
import UserProfile from './src/models/UserProfile.js';
import Notification from './src/models/Notification.js';
import pagesRouter from './routes/pages.js';
import apiRouter from './routes/api.js';
import authRouter from './routes/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

app.set('trust proxy', true);

const googleDomains = [
    "https://www.google.com",
    "https://www.google.com.ua",
    "https://www.google.pl",
    "https://www.google.ru",
    "https://www.google.de",
    "https://www.google.co.uk",
    "https://www.google.fr",
    "https://www.google.it",
    "https://www.google.es",
    "https://www.google.nl",
    "https://www.google.be",
    "https://www.google.kz",
    "https://www.google.by",
    "https://googleads.g.doubleclick.net",
    "https://www.googleadservices.com",
    "https://stats.g.doubleclick.net"
];

const io = new Server(httpServer, {
    cors: { origin: ["https://dachazeyna.com", "http://localhost:3000"], methods: ["GET", "POST"] }
});

app.set('io', io);
app.use(compression());

app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('hex'); 
    res.locals.gaId = process.env.GOOGLE_ANALYTICS_ID; 
    next();
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                (req, res) => `'nonce-${res.locals.nonce}'`,
                "'unsafe-eval'", 
                "blob:",
                "https://cdn.jsdelivr.net",
                "https://unpkg.com",
                "https://cdnjs.cloudflare.com",
                "https://www.googletagmanager.com",
                "https://www.google-analytics.com",
                "https://www.googleadservices.com",
                "https://googleads.g.doubleclick.net",
                "https://www.clarity.ms",
                "https://c.bing.com",
                "https://*.clarity.ms",
            ],
            workerSrc: ["'self'", "blob:"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
            imgSrc: [
                "'self'", 
                "data:", 
                "blob:", 
                "https://cdn.discordapp.com", 
                "https://media.discordapp.net", 
                "https://dachazeyna.com", 
                "https://i.ibb.co", 
                "https://ik.imagekit.io", 
                "https://www.google-analytics.com", 
                "https://www.googletagmanager.com", 
                "https://*.clarity.ms", 
                "https://c.bing.com",
                "https://www.transparenttextures.com", 
                ...googleDomains
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            connectSrc: ["'self'", "https://dachazeyna.com", "https://cdn.jsdelivr.net", "ws:", "wss:", "https://discord.com", "https://www.google-analytics.com", "https://region1.google-analytics.com", "https://www.googletagmanager.com", "https://www.clarity.ms", "https://c.bing.com", "https://*.clarity.ms", ...googleDomains],
            frameSrc: ["'self'", "https://www.googletagmanager.com", "https://td.doubleclick.net"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public', {
    maxAge: '1y',
    immutable: true, 
    etag: true, 
    setHeaders: (res, path) => {
        if (path.endsWith('.woff2') || path.match(/\.(webp|png|jpg|jpeg|svg)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    req.io = io;
    next();
});

mongoose.connect(process.env.MONGODB_URI)
    .catch(err => console.error(err));

const isProduction = process.env.NODE_ENV === 'production';

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        mongoUrl: process.env.MONGODB_URI,
        touchAfter: 24 * 3600 
    }),
    cookie: { 
        maxAge: 1000 * 60 * 60 * 24 * 30,
        httpOnly: true,
        secure: false, 
        sameSite: isProduction ? 'none' : 'lax'
    }
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
    if (req.path.match(/\.(css|js|png|jpg|jpeg|webp|svg|ico|mp4|webm|woff2)([?#].*)?$/i)) {
        return next();
    }

    if (req.user && req.user.isBanned) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const allowedPaths = ['/banned', '/api/appeal', '/auth/logout'];
        if (allowedPaths.includes(req.path)) {
            return next();
        }

        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Ваш аккаунт заблокирован.' });
        }
        
        return res.redirect('/banned');
    }

    next();
});

const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));

app.use(async (req, res, next) => {
    res.locals.notifications = [];
    res.locals.unreadCount = 0;
    if (req.user) {
        try {
            const timeLimit = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const notifs = await Notification.find({
                userId: req.user.id,
                read: false,
                createdAt: { $gt: timeLimit }
            }).sort({ createdAt: -1 }).lean();
            res.locals.notifications = notifs;
            res.locals.unreadCount = notifs.length;
        } catch (e) {}
    }
    next();
});

app.use(async (req, res, next) => {
    const start = Date.now();
    try {
        if (mongoose.connection.readyState === 1) await mongoose.connection.db.admin().ping();
        res.locals.systemStatus = { online: true, ping: Date.now() - start };
    } catch (e) { res.locals.systemStatus = { online: false, ping: 999 }; }
    next();
});

app.use('/auth', authRouter); 
app.use('/api', apiRouter);   
app.use('/', pagesRouter);

io.on('connection', (socket) => {
    socket.on('join_room', (roomId) => socket.join(String(roomId)));
    socket.on('admin_control', (data) => {
        io.emit('stream_update', data);
    });
    const user = socket.request.user;
    if (user) socket.join(String(user.id));
});

const ipCache = new Map();

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify'], 
    state: true,
    proxy: true,
    passReqToCallback: true,
    authorizationURL: 'https://discord.com/api/oauth2/authorize',
    tokenURL: 'https://discord.com/api/oauth2/token',
    customHeaders: {
        'User-Agent': 'DachaZeyna/1.0 (https://dachazeyna.com, 1.0.0)',
        'Accept': 'application/json'
    }
}, async (req, accessToken, refreshToken, profile, done) => {
    try {
        const DISCORD_EPOCH = 1420070400000n;
        const userIdBigInt = BigInt(profile.id);
        const creationTimestamp = Number((userIdBigInt >> 22n) + DISCORD_EPOCH);
        
        const accountAgeMs = Date.now() - creationTimestamp;
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

        if (accountAgeMs < sevenDaysMs) {
            console.log(`🚫 Вход заблокирован! Аккаунт ${profile.username} слишком новый`);
            return done(null, false, { message: 'ACCOUNT_TOO_NEW' });
        }

        let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();

        if (ip) {
            const bannedUser = await UserProfile.findOne({ 
                ips: ip, 
                isBanned: true,
                guildId: process.env.GUILD_ID 
            });

            if (bannedUser && ip !== '::1' && ip !== '127.0.0.1') {
                console.log(`🚫 Вход заблокирован! IP совпадает с забаненным твинком.`);
                return done(null, false, { message: 'BANNED_ALT' });
            }

            if (ip !== '::1' && ip !== '127.0.0.1' && !ip.startsWith('192.168.')) {
                if (ipCache.get(ip) === 'vpn') {
                    return done(null, false, { message: 'VPN_DETECTED' });
                }

                if (!ipCache.has(ip)) {
                    try {
                        const vpnResponse = await fetch(`http://ip-api.com/json/${ip}?fields=status,proxy,hosting`);
                        const vpnData = await vpnResponse.json();
                        
                        if (vpnData.status === 'success') {
                            if (vpnData.proxy || vpnData.hosting) {
                                ipCache.set(ip, 'vpn');
                                console.log(`🚫 Вход заблокирован! Обнаружен VPN/Proxy.`);
                                return done(null, false, { message: 'VPN_DETECTED' });
                            } else {
                                ipCache.set(ip, 'clean');
                            }
                        }
                    } catch (vpnErr) {
                        console.error('⚠️ Ошибка API VPN (возможно лимит), пропускаем проверку:', vpnErr.message);
                    }
                }
            }
        }

        const existingUser = await UserProfile.findOne({ 
    userId: profile.id, 
    guildId: process.env.GUILD_ID 
});

const isNewVerification = !existingUser || !existingUser.isVerified;

const updateData = {
    username: profile.username,
    avatar: profile.avatar,
    isVerified: true,
    $addToSet: { ips: ip },
    $setOnInsert: { 
        stars: 100, 
        joinedAt: new Date(),
        firstLoginAt: new Date()
    }
};

const user = await UserProfile.findOneAndUpdate(
    { userId: profile.id, guildId: process.env.GUILD_ID },
    updateData,
    { upsert: true, new: true, setDefaultsOnInsert: true }
);

        if (process.env.VERIFIED_ROLE_ID && process.env.DISCORD_BOT_TOKEN) {
            try {
                console.log(`Пробуем выдать роль пользователю ${profile.id}...`);
                const roleResponse = await fetch(`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${profile.id}/roles/${process.env.VERIFIED_ROLE_ID}`, {
                    method: 'PUT',
                    headers: { 
                        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
                        'X-Audit-Log-Reason': 'Verified via website'
                    }
                });
                
                if (!roleResponse.ok) {
                    const errorData = await roleResponse.json();
                    console.error('❌ Ошибка Discord API при выдаче роли:', errorData);
                } else {
                    console.log('✅ Роль успешно выдана в Discord!');
                }
            } catch (roleErr) {
                console.error('❌ Сетевая ошибка при запросе к Discord API:', roleErr);
            }
        }

        return done(null, { ...profile, isNewVerification });
    } catch (err) { 
        return done(err, null); 
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id || user.userId); 
});

passport.deserializeUser(async (obj, done) => {
    try {
        const searchId = typeof obj === 'string' ? obj : (obj.id || obj.userId);
        
        const userProfile = await UserProfile.findOne({ userId: searchId }).lean();
        
        if (userProfile) {
            userProfile.id = userProfile.userId;
            return done(null, userProfile);
        } else {
            return done(null, false); 
        }
    } catch (err) { 
        console.error("Ошибка при десериализации:", err);
        return done(err, null); 
    }
});

app.use((req, res) => { res.status(404).render('404', { user: req.user, profile: null }); });
app.use((err, req, res, next) => {
    res.status(500).render('500', { user: req.user, error: err });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
});