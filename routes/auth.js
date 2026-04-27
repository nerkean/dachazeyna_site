import express from 'express';
import passport from 'passport';
import UserProfile from '../src/models/UserProfile.js'; 

const router = express.Router();

router.post('/set-fingerprint', express.json(), (req, res) => {
    if (req.body.fingerprint) {
        req.session.lastFingerprint = req.body.fingerprint;
        req.session.save((err) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true });
        });
    } else {
        res.status(400).json({ success: false });
    }
});

router.get('/discord', passport.authenticate('discord'));

router.get('/discord/callback', (req, res, next) => {
    passport.authenticate('discord', async (err, user, info) => {
        if (err) {
            console.error('=== ОШИБКА АВТОРИЗАЦИИ DISCORD ===', err);

            if (err.oauthError && (err.oauthError.statusCode === 429)) {
                return res.redirect('/verify?error=discord_limit');
            }

            return res.redirect('/verify?error=auth_failed');
        }

        if (!user) {
            if (info && info.message === 'VPN_DETECTED') {
                return res.redirect('/verify?error=vpn_blocked');
            }
            if (info && info.message === 'BANNED_ALT') {
                return res.redirect('/verify?error=banned_alt');
            }
            if (info && info.message === 'ACCOUNT_TOO_NEW') {
                return res.redirect('/verify?error=account_too_new');
            }
            if (info && info.message === 'BANNED_HWID') {
                return res.redirect('/verify?error=banned_hwid'); 
            }
            return res.redirect('/verify?error=no_user');
        }

        try {
            await UserProfile.updateMany(
                { userId: user.id },
                { 
                    $set: { 
                        username: user.username,
                        avatar: user.avatar 
                    } 
                }
            );
        } catch (dbErr) {
            console.error('Ошибка обновления аватара при входе:', dbErr);
        }

        req.logIn(user, (loginErr) => {
            if (loginErr) {
                console.error('Ошибка входа:', loginErr);
                return next(loginErr);
            }

            req.session.save(() => {
                if (user && user.isNewVerification) {
                    res.redirect(`/?success=verified`);
                } else {
                    res.redirect('/');
                }
            });
        });
    })(req, res, next);
});

router.get('/logout', (req, res, next) => {
    req.logout(err => {
        if (err) return next(err);
        res.redirect('/');
    });
});

router.get('/finalize', async (req, res) => {
    const { tgId } = req.query;
    if (!tgId) return res.redirect('/');

    try {
        const user = await UserProfile.findOne({ telegramId: tgId }); 
        if (!user) return res.redirect('/?error=user_not_found');

        req.login({
            id: user.userId,
            username: user.username,
            avatar: user.avatar
        }, (err) => {
            if (err) {
                return res.redirect('/');
            }
            req.session.save(() => res.redirect('/'));
        });
    } catch (e) {
        res.redirect('/');
    }
});

export default router;