document.addEventListener('DOMContentLoaded', () => {
    const isMobile = window.innerWidth < 768;

    if (!isMobile) {
        let isMouseTracking = false;
        
        document.addEventListener('mousemove', (e) => {
            if (!isMouseTracking) {
                window.requestAnimationFrame(() => {
                    const currentSection = e.target.closest('section');
                    if (currentSection) {
                        const rect = currentSection.getBoundingClientRect();
                        currentSection.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                        currentSection.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
                    }
                    isMouseTracking = false;
                });
                isMouseTracking = true;
            }
        });

        const tiltElements = document.querySelectorAll('.tilt-element');
        tiltElements.forEach(el => {
            let isTilting = false;
            el.addEventListener('mousemove', e => {
                if (!isTilting) {
                    window.requestAnimationFrame(() => {
                        const rect = el.getBoundingClientRect();
                        const rotateX = ((e.clientY - rect.top - rect.height / 2) / (rect.height / 2)) * -10;
                        const rotateY = ((e.clientX - rect.left - rect.width / 2) / (rect.width / 2)) * 10;
                        el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
                        isTilting = false;
                    });
                    isTilting = true;
                }
            });
            el.addEventListener('mouseleave', () => {
                window.requestAnimationFrame(() => el.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`);
            });
        });

        if (typeof AOS !== 'undefined') {
            AOS.init({ once: true, offset: 50, duration: 800 });
        }
    }

    if (window.Modal) window.Modal.init();

    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const success = urlParams.get('success');
    
    if (error) {
        let errorMessage = "Произошла неизвестная ошибка при авторизации.";
        if (error === 'vpn_blocked') errorMessage = "Обнаружено использование VPN или Proxy. Пожалуйста, отключите его для прохождения верификации.";
        else if (error === 'banned_alt') errorMessage = "Верификация отклонена. Ваш IP-адрес связан с заблокированным аккаунтом на нашем сервере.";
        else if (error === 'discord_limit') errorMessage = "Слишком много запросов к Discord. Попробуйте позже.";
        
        if(window.Modal) window.Modal.alert('Ошибка авторизации', errorMessage, 'error');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (success === 'verified') {
        if(window.Modal) window.Modal.alert(
            'Верификация пройдена!', 
            'Вы успешно подтвердили свой аккаунт. Роль выдана, теперь вам доступен весь сервер!', 
            'success'
        );
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});

window.addEventListener('load', () => {
    const container = document.getElementById('star-3d-canvas');
    if (!container) return;

    const isMobile = window.innerWidth < 768;

    const init3DStar = () => {
        if (typeof THREE === 'undefined') return;

        const scene = new THREE.Scene();
        const width = container.clientWidth;
        const height = container.clientHeight;
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.z = 6;

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
        renderer.setSize(width, height);
        renderer.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio, 1.5)); 
        container.appendChild(renderer.domElement);

        const shape = new THREE.Shape();
        const outerRadius = 1.4;
        const innerRadius = 0.6;
        const spikes = 5;
        const rot = -Math.PI / 2;
        
        for (let i = 0; i < spikes * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = rot + (i * Math.PI) / spikes;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            if (i === 0) shape.moveTo(x, y);
            else shape.lineTo(x, y);
        }
        shape.closePath();

        const extrudeSettings = { depth: 0.2, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.1, bevelThickness: 0.1 };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.center();

        const material = new THREE.MeshStandardMaterial({
            color: 0xffd700, emissive: 0xaa7700, emissiveIntensity: 0.3, metalness: 0.8, roughness: 0.15
        });
        const star = new THREE.Mesh(geometry, material);
        scene.add(star);

        const edges = new THREE.EdgesGeometry(geometry);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
        const wireframe = new THREE.LineSegments(edges, lineMat);
        star.add(wireframe);

        const particleGeo = new THREE.BufferGeometry();
        const particleCount = isMobile ? 25 : 70; 
        const posArray = new Float32Array(particleCount * 3);
        for(let i=0; i < particleCount * 3; i++) posArray[i] = (Math.random() - 0.5) * 8;
        particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        const particleMat = new THREE.PointsMaterial({ size: 0.06, color: 0xffd700, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
        const particleMesh = new THREE.Points(particleGeo, particleMat);
        scene.add(particleMesh);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambientLight);
        const pointLight1 = new THREE.PointLight(0xffffff, 1.5, 100);
        pointLight1.position.set(5, 5, 5);
        scene.add(pointLight1);

        let clock = new THREE.Clock();
        let animationFrameId;
        let isVisible = false;

        function animate() {
            if (!isVisible) return; 
            animationFrameId = requestAnimationFrame(animate);
            const t = clock.getElapsedTime();
            star.rotation.y += 0.008;
            star.position.y = Math.sin(t * 1.5) * 0.15;
            particleMesh.rotation.y -= 0.002;
            renderer.render(scene, camera);
        }

        const visibilityObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                isVisible = true;
                clock.start();
                animate();
            } else {
                isVisible = false;
                if (animationFrameId) cancelAnimationFrame(animationFrameId);
            }
        }, { threshold: 0.1 });
        
        visibilityObserver.observe(container);
    };

    const loadThreeScript = () => {
        if (document.querySelector('script[src*="three.min.js"]')) return;
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
        script.onload = () => requestAnimationFrame(init3DStar);
        document.body.appendChild(script);
    };

    setTimeout(() => {
        const lazyLoadObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                lazyLoadObserver.disconnect();
                if ('requestIdleCallback' in window) {
                    window.requestIdleCallback(loadThreeScript, { timeout: 2000 });
                } else {
                    setTimeout(loadThreeScript, 200);
                }
            }
        }, { rootMargin: "50px" });
        
        lazyLoadObserver.observe(container);
    }, 300); 
});

document.addEventListener('DOMContentLoaded', () => {
    const onlineCounter = document.getElementById('live-online-count');
    
    if (onlineCounter && typeof io !== 'undefined') {
        setTimeout(() => {
            const socket = window.socket || io(); 
            
            socket.on('stats_update', (data) => {
                if (data && data.onlineMembers) {
                    onlineCounter.style.transition = 'opacity 0.3s ease';
                    onlineCounter.style.opacity = '0.5';
                    setTimeout(() => {
                        onlineCounter.textContent = data.onlineMembers.toLocaleString('ru-RU');
                        onlineCounter.style.opacity = '1';
                    }, 300);
                }
            });
        }, 2000); 
    }
});