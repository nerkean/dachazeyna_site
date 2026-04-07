const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('gameOverlay');
const scoreEl = document.getElementById('scoreBoard');
const scoreVal = document.getElementById('scoreVal');

const box = 20; 
let snake = [];
let food = {};
let score = 0;
let d = null;
let game; 
let isPlaying = false;

function initGame() {
    snake = [];
    snake[0] = { x: 10 * box, y: 8 * box };
    generateFood();
    score = 0;
    d = null;
    scoreVal.innerText = 0;
}

function generateFood() {
    food = {
        x: Math.floor(Math.random() * (canvas.width / box)) * box,
        y: Math.floor(Math.random() * (canvas.height / box)) * box
    };
    for(let i=0; i<snake.length; i++) {
        if(food.x == snake[i].x && food.y == snake[i].y) generateFood();
    }
}

document.addEventListener('keydown', direction);

function direction(event) {
    let key = event.keyCode;
    if([37, 38, 39, 40, 32].includes(key)) event.preventDefault();
    if (!isPlaying) return;
    
    if (d === null) {
        if(key == 37) d = "LEFT";
        else if(key == 38) d = "UP";
        else if(key == 39) d = "RIGHT";
        else if(key == 40) d = "DOWN";
        return;
    }

    if(key == 37 && d != "RIGHT") d = "LEFT";
    else if(key == 38 && d != "DOWN") d = "UP";
    else if(key == 39 && d != "LEFT") d = "RIGHT";
    else if(key == 40 && d != "UP") d = "DOWN";
}

let touchStartX = 0;
let touchStartY = 0;

canvas.addEventListener('touchstart', function(e) {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
    e.preventDefault(); 
}, {passive: false});

canvas.addEventListener('touchend', function(e) {
    if (!isPlaying) return;
    let touchEndX = e.changedTouches[0].screenX;
    let touchEndY = e.changedTouches[0].screenY;
    handleSwipe(touchStartX, touchStartY, touchEndX, touchEndY);
}, {passive: false});

function handleSwipe(sx, sy, ex, ey) {
    let dx = ex - sx;
    let dy = ey - sy;
    if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
    
    if (d === null) {
        if (Math.abs(dx) > Math.abs(dy)) d = dx > 0 ? "RIGHT" : "LEFT";
        else d = dy > 0 ? "DOWN" : "UP";
        return;
    }
    
    if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0 && d != "LEFT") d = "RIGHT";
        else if (dx < 0 && d != "RIGHT") d = "LEFT";
    } else {
        if (dy > 0 && d != "UP") d = "DOWN";
        else if (dy < 0 && d != "DOWN") d = "UP";
    }
}

function draw() {
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = "rgba(0, 243, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += box) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += box) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    for(let i = 0; i < snake.length; i++) {
        ctx.fillStyle = (i == 0) ? "#ffffff" : `rgba(0, 243, 255, ${1 - i/snake.length})`;
        
        if(i == 0) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = "#00f3ff";
        } else {
            ctx.shadowBlur = 5;
            ctx.shadowColor = "#00f3ff";
        }
        
        ctx.beginPath();
        ctx.roundRect(snake[i].x + 2, snake[i].y + 2, box - 4, box - 4, 4);
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#FFD700";
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#FFD700";
    ctx.beginPath();
    ctx.arc(food.x + box/2, food.y + box/2, box/2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (d === null) return;

    let snakeX = snake[0].x;
    let snakeY = snake[0].y;

    if(d == "LEFT") snakeX -= box;
    if(d == "UP") snakeY -= box;
    if(d == "RIGHT") snakeX += box;
    if(d == "DOWN") snakeY += box;

    if(snakeX == food.x && snakeY == food.y) {
        score++;
        scoreVal.innerText = score;
        generateFood();
    } else {
        snake.pop();
    }

    let newHead = { x: snakeX, y: snakeY };

    if(snakeX < 0 || snakeX >= canvas.width || snakeY < 0 || snakeY >= canvas.height || collision(newHead, snake)) {
        clearInterval(game);
        isPlaying = false;
        showGameOver();
        return;
    }

    snake.unshift(newHead);
}

function collision(head, array) {
    for(let i = 0; i < array.length; i++) {
        if(head.x == array[i].x && head.y == array[i].y) return true;
    }
    return false;
}

function startGame() {
    if (isPlaying) return;
    isPlaying = true;
    overlay.style.display = 'none';
    scoreEl.style.display = 'flex';
    
    initGame();
    if (game) clearInterval(game);
    game = setInterval(draw, 90);
}

function showGameOver() {
    ctx.fillStyle = "rgba(10, 10, 15, 0.85)";
    ctx.fillRect(0,0,canvas.width, canvas.height);
    
    ctx.fillStyle = "#ff0055";
    ctx.font = "800 32px Montserrat";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#ff0055";
    ctx.fillText("СИСТЕМА УПАЛА", canvas.width/2, canvas.height/2 - 20);
    
    ctx.fillStyle = "#fff";
    ctx.font = "500 16px Montserrat";
    ctx.shadowBlur = 0;
    ctx.fillText(`Собрано пыльцы: ${score}`, canvas.width/2, canvas.height/2 + 20);
    
    setTimeout(() => {
        overlay.style.display = 'flex';
        scoreEl.style.display = 'none';
        document.querySelector('.play-btn').innerHTML = '<i class="fas fa-redo"></i> ПОВТОРИТЬ';
    }, 1500);
}