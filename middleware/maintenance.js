export const checkMaintenance = (req, res, next) => {
    const lockedPages = [
        '/leaderboard',
        '/shop',
        '/bot',
        '/profile/',
        '/giveaways',
        '/daily',
        '/inventory'
    ];

    if (lockedPages.includes(req.path)) {
        return res.render('coming-soon', { 
            user: req.user, 
            title: 'Скоро будет...',
            currentPath: req.path 
        });
    }

    next();
};