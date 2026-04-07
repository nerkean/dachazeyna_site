import UserProfile from '../src/models/UserProfile.js';

export const checkWikiAccess = async (req, res, next) => {
    if (!req.user) return res.redirect('/');

    const OWNER_ID = '438744415734071297'; 

    if (req.user.id === OWNER_ID) {
        return next();
    }

    try {
        const profile = await UserProfile.findOne({ userId: req.user.id });
        
        if (profile && profile.isWikiEditor) {
            return next();
        } else {
            return res.status(403).render('404', { user: req.user }); 
        }
    } catch (e) {
        console.error(e);
        res.status(500).send('Server Error');
    }
};