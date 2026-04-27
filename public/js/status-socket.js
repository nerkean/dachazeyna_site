const socket = io();

socket.on('system_update', (data) => {
    const fBotDot = document.getElementById('f-bot-dot');
    const fBotText = document.getElementById('f-bot-text');
    const fSiteDot = document.getElementById('f-site-dot');
    const fSiteText = document.getElementById('f-site-text');
    const fPingText = document.getElementById('f-server-ping');

    if(fBotDot && fBotText) updateStatus(fBotDot, fBotText, data.bot);
    if(fSiteDot && fSiteText) updateStatus(fSiteDot, fSiteText, data.site);
    
    if(fPingText) {
        fPingText.innerText = data.serverPing + 'ms';
        fPingText.style.color = getPingColor(data.serverPing);
    }
    
    const pSiteBadge = document.getElementById('page-site-badge');
    const pBotBadge = document.getElementById('page-bot-badge');
    const pDbBadge = document.getElementById('page-db-badge');
    
    if(pSiteBadge) {
        updateBadge(pSiteBadge, data.site);
        updateBadge(pBotBadge, data.bot);
        updateBadge(pDbBadge, data.database);

        document.getElementById('page-site-ping').innerText = data.serverPing + 'ms';
        document.getElementById('page-site-ping').style.color = getPingColor(data.serverPing);
        
        document.getElementById('page-bot-ping').innerText = data.botPing + 'ms';
        document.getElementById('page-db-ping').innerText = data.dbPing + 'ms';

        const globalHero = document.getElementById('global-status-panel');
        const globalIcon = document.getElementById('global-status-icon');
        const globalTitle = document.getElementById('global-status-title');
        
        if(data.site === 'online' && data.bot === 'online' && data.database === 'online') {
            globalHero.classList.remove('issue');
            globalIcon.innerHTML = '<i class="fas fa-check"></i>';
            globalTitle.innerText = 'Все системы работают в штатном режиме';
        } else {
            globalHero.classList.add('issue');
            globalIcon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
            globalTitle.innerText = 'Внимание: Обнаружены проблемы в работе систем';
        }

        const now = new Date();
        document.getElementById('last-update-time').innerText = now.toLocaleTimeString('ru-RU');
    }
});

function updateStatus(dot, textEl, status) {
    dot.className = 'status-dot';
    if(status === 'online') {
        dot.classList.add('pulse-green');
        textEl.innerText = 'Онлайн';
        textEl.style.color = '#fff';
    } else {
        dot.style.background = '#e74c3c';
        dot.style.boxShadow = '0 0 10px #e74c3c';
        dot.classList.remove('pulse-green');
        textEl.innerText = 'Офлайн';
        textEl.style.color = '#e74c3c';
    }
}

function updateBadge(badge, status) {
    if(status === 'online') {
        badge.className = 'sc-badge online';
        badge.innerText = 'Онлайн';
    } else {
        badge.className = 'sc-badge offline';
        badge.innerText = 'Сбои';
    }
}

function getPingColor(ping) {
    if (ping < 100) return '#2ecc71';
    if (ping < 300) return '#f1c40f';
    return '#e74c3c';
}