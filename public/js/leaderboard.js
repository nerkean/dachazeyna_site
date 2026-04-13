document.addEventListener('DOMContentLoaded', () => {
    const podiumWrapper = document.getElementById('lb-podium');
    const tableBody = document.getElementById('lb-table-body');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const pageInput = document.getElementById('page-input');
    const pageTotal = document.getElementById('page-total');
    const searchInput = document.getElementById('lb-search');
    const tabs = document.querySelectorAll('.lb-tab');
    const periodContainer = document.getElementById('lb-periods');
    const periodBtns = document.querySelectorAll('.lb-period-btn');
    const valueTitle = document.getElementById('col-value-title');

    let currentPage = 1, totalPages = 1, currentSort = 'stars', currentPeriod = 'all', searchQuery = '', searchTimeout;

    function getAvatarUrl(user) {
        if (user.userId.startsWith('tg_') || !user.avatar) return '/assets/img/avatars/default_avatar.png';
        return `https://cdn.discordapp.com/avatars/${user.userId}/${user.avatar}.png?size=128`;
    }

    function formatValue(value) {
        if (currentSort === 'messages') return `${(value || 0).toLocaleString('ru-RU')} сообщ.`;
        if (currentSort === 'voice') {
            const mins = value || 0;
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return h > 0 ? `${h} ч. ${m} мин.` : `${m} мин.`;
        }
        return `${(value || 0).toLocaleString('ru-RU')} ⭐`;
    }

    async function loadLeaderboard(page) {
        try {
            podiumWrapper.style.opacity = '0.4';
            tableBody.style.opacity = '0.4';
            document.querySelector('.lb-status').innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Обновление...';
            
            const url = `/api/leaderboard?page=${page}&limit=25&sort=${currentSort}&period=${currentPeriod}&q=${encodeURIComponent(searchQuery)}`;
            const res = await fetch(url);
            const data = await res.json();

            if (!data.success) throw new Error(data.error);

            totalPages = data.pagination.totalPages || 1;
            currentPage = data.pagination.page;

            setTimeout(() => {
                if (currentSort === 'messages') valueTitle.textContent = 'Сообщения';
                else if (currentSort === 'voice') valueTitle.textContent = 'Время (ГК)';
                else valueTitle.textContent = 'Капитал';

                renderData(data.leaderboard, currentPage);
                
                podiumWrapper.style.opacity = '1';
                tableBody.style.opacity = '1';
                document.querySelector('.lb-status').innerHTML = '<i class="fas fa-check-circle"></i> Актуально';
            }, 100);
            
        } catch (err) {
            tableBody.innerHTML = `<div class="lb-empty"><span>Ошибка загрузки</span></div>`;
        }
    }

    function renderData(users, pageNum) {
        if (pageNum === 1 && users.length > 0 && !searchQuery) {
            const top3 = users.slice(0, 3);
            let pth = '';
            top3.forEach((u, i) => {
                const r = i + 1;
                pth += `
                    <div class="lb-pod-card rank-${r}" style="animation: lbSlideUp 0.5s ease forwards ${i * 0.1}s; opacity:0;">
                        <div class="lb-pod-badge">#${r}</div>
                        <div class="lb-avatar-wrap">
                            ${r === 1 ? '<i class="fas fa-crown lb-crown"></i>' : ''}
                            <img src="${getAvatarUrl(u)}" class="lb-pod-avatar" onerror="this.src='/assets/img/avatars/default_avatar.png';">
                        </div>
                        <div class="lb-pod-name">${u.username || u.userId}</div>
                        <div class="lb-pod-stars">${formatValue(u.scoreValue)}</div>
                    </div>`;
            });
            podiumWrapper.innerHTML = pth;
            podiumWrapper.style.display = 'grid';
        } else podiumWrapper.style.display = 'none';

        const tu = (pageNum === 1 && !searchQuery) ? users.slice(3) : users;
        let th = '';
        if (tu.length === 0) th = `<div class="lb-empty"><span>Никого не найдено</span></div>`;
        else {
            tu.forEach((u, i) => {
                const r = (pageNum === 1 && !searchQuery) ? (i + 4) : ((pageNum - 1) * 25 + i + 1);
                th += `
                    <div class="lb-row" style="animation: lbFadeIn 0.3s ease forwards ${i * 0.02}s; opacity:0;">
                        <div class="lb-row-rank">#${r}</div>
                        <div class="lb-row-user">
                            <img src="${getAvatarUrl(u)}" onerror="this.src='/assets/img/avatars/default_avatar.png';">
                            <span>${u.username || u.userId}</span>
                        </div>
                        <div class="col-value">${formatValue(u.scoreValue)}</div>
                    </div>`;
            });
        }
        tableBody.innerHTML = th;
        pageInput.value = pageNum;
        pageTotal.textContent = `из ${totalPages}`;
        btnPrev.disabled = pageNum <= 1;
        btnNext.disabled = pageNum >= totalPages;
    }

    tabs.forEach(t => t.addEventListener('click', () => {
        if (t.classList.contains('active')) return;
        tabs.forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        currentSort = t.dataset.sort;
        periodContainer.style.display = currentSort === 'stars' ? 'none' : 'flex';
        currentPeriod = 'all';
        periodBtns.forEach(b => b.classList.toggle('active', b.dataset.period === 'all'));
        loadLeaderboard(1);
    }));

    periodBtns.forEach(b => b.addEventListener('click', () => {
        if (b.classList.contains('active')) return;
        periodBtns.forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        currentPeriod = b.dataset.period;
        loadLeaderboard(1);
    }));

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchQuery = e.target.value.trim();
        searchTimeout = setTimeout(() => loadLeaderboard(1), 500);
    });

    btnPrev.addEventListener('click', () => loadLeaderboard(currentPage - 1));
    btnNext.addEventListener('click', () => loadLeaderboard(currentPage + 1));
    pageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            let v = parseInt(pageInput.value);
            if (v >= 1 && v <= totalPages) loadLeaderboard(v);
            else pageInput.value = currentPage;
        }
    });

    loadLeaderboard(1);
});