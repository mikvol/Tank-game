const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Уменьшаем размер UI и переносим его вверх
const UI_HEIGHT = 40; // Высота области для UI
const GAME_WIDTH = canvas.width; // Игровая область занимает всю ширину
const GAME_HEIGHT = canvas.height - UI_HEIGHT; // Игровая область уменьшена на высоту UI

// Инициализация объекта для отслеживания нажатых клавиш
const keys = {};

// Добавляем кнопку "Начать заново"
const restartButton = document.createElement('button');
restartButton.textContent = 'Начать заново';
restartButton.style.position = 'absolute';
restartButton.style.left = '50%';
restartButton.style.top = '50%';
restartButton.style.transform = 'translate(-50%, -50%)';
restartButton.style.padding = '15px 30px';
restartButton.style.fontSize = '20px';
restartButton.style.backgroundColor = '#4CAF50';
restartButton.style.color = 'white';
restartButton.style.border = 'none';
restartButton.style.borderRadius = '5px';
restartButton.style.cursor = 'pointer';
restartButton.style.display = 'none';
restartButton.style.zIndex = '1000';
document.body.appendChild(restartButton);

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ OBB ---
function getOBBVertices(x, y, w, h, angle) {
    const hw = w / 2, hh = h / 2;
    const corners = [
        {x: -hw, y: -hh},
        {x: hw, y: -hh},
        {x: hw, y: hh},
        {x: -hw, y: hh}
    ];
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return corners.map(c => ({
        x: x + c.x * cos - c.y * sin,
        y: y + c.x * sin + c.y * cos
    }));
}

function projectPolygon(axis, vertices) {
    let min = axis.x * vertices[0].x + axis.y * vertices[0].y;
    let max = min;
    for (let i = 1; i < vertices.length; i++) {
        const p = axis.x * vertices[i].x + axis.y * vertices[i].y;
        if (p < min) min = p;
        if (p > max) max = p;
    }
    return {min, max};
}

function polygonsIntersect(a, b) {
    // SAT для двух четырёхугольников
    const axes = [];
    for (let i = 0; i < 4; i++) {
        const va = a[i], vb = a[(i+1)%4];
        axes.push({x: -(vb.y - va.y), y: vb.x - va.x});
    }
    for (let i = 0; i < 4; i++) {
        const va = b[i], vb = b[(i+1)%4];
        axes.push({x: -(vb.y - va.y), y: vb.x - va.x});
    }
    for (const axis of axes) {
        // Нормализуем
        const len = Math.sqrt(axis.x*axis.x + axis.y*axis.y);
        const norm = {x: axis.x/len, y: axis.y/len};
        const projA = projectPolygon(norm, a);
        const projB = projectPolygon(norm, b);
        if (projA.max < projB.min || projB.max < projA.min) return false;
    }
    return true;
}

// Добавляем параметры здоровья для игрока
const player = {
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT - 100,
    width: 50,
    height: 70,
    color: '#4caf50',
    health: 100,
    maxHealth: 100,
    damage: [], // Массив для хранения визуальных повреждений
    isDestroyed: false, // Флаг уничтожения танка
    destroyTimer: 0 // Таймер для анимации уничтожения
};

let mouse = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };

canvas.addEventListener('mousemove', function(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});

const bullets = [];

// Добавляем массив для хранения частиц вспышек
const muzzleFlashes = [];

// Добавляем массив для хранения частиц дыма
const smokeParticles = [];

// Добавляем массив для хранения частиц взрыва
const explosionParticles = [];

// Добавляем массив для хранения уничтожаемых танков
const dyingEnemies = [];

// Добавляем массив для хранения вражеских снарядов
const enemyBullets = [];

// Функция для создания вспышки
function createMuzzleFlash(x, y, angle) {
    muzzleFlashes.push({
        x: x,
        y: y,
        angle: angle,
        life: 6,
        size: 35
    });
    
    // Создаем больше частиц дыма
    for (let i = 0; i < 8; i++) {
        // Вычисляем направление дыма с учетом поворота танка
        const smokeSpeed = 1 + Math.random() * 0.5;
        const smokeAngle = angle + (Math.random() - 0.5) * 0.3;
        const speedX = Math.sin(smokeAngle) * smokeSpeed;
        const speedY = -Math.cos(smokeAngle) * smokeSpeed;
        
        smokeParticles.push({
            x: x,
            y: y,
            size: 10 + Math.random() * 6,
            speedX: speedX,
            speedY: speedY,
            life: 35 + Math.random() * 25,
            alpha: 0.8
        });
    }
}

// Функция для обновления и отрисовки дыма
function updateSmoke() {
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
        const smoke = smokeParticles[i];
        smoke.life--;
        smoke.alpha *= 0.95;
        smoke.size += 0.2;
        smoke.x += smoke.speedX;
        smoke.y += smoke.speedY;
        
        // Отрисовываем частицу дыма
        ctx.save();
        ctx.globalAlpha = smoke.alpha;
        ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
        ctx.beginPath();
        ctx.arc(smoke.x, smoke.y, smoke.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        // Удаляем частицу, если она закончилась
        if (smoke.life <= 0) {
            smokeParticles.splice(i, 1);
        }
    }
}

// Функция для обновления и отрисовки вспышек
function updateMuzzleFlashes() {
    for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
        const flash = muzzleFlashes[i];
        flash.life--;
        
        // Уменьшаем размер вспышки со временем
        flash.size = flash.size * 0.85;
        
        // Отрисовываем вспышку
        ctx.save();
        ctx.translate(flash.x, flash.y);
        ctx.rotate(flash.angle);
        
        // Создаем более яркий градиент для вспышки
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, flash.size);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.3, 'rgba(255, 255, 200, 0.9)');
        gradient.addColorStop(0.6, 'rgba(255, 200, 50, 0.7)');
        gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, flash.size, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
        // Удаляем вспышку, если она закончилась
        if (flash.life <= 0) {
            muzzleFlashes.splice(i, 1);
        }
    }
}

canvas.addEventListener('mousedown', function(e) {
    if (player.isDestroyed) return; // Не стреляем, если танк уничтожен
    
    // Вычисляем позицию башни с учетом поворота танка
    const turretOffsetX = 0;
    const turretOffsetY = -player.height/4;
    const turretBaseX = player.x + Math.cos(playerAngle) * turretOffsetX - Math.sin(playerAngle) * turretOffsetY;
    const turretBaseY = player.y + Math.sin(playerAngle) * turretOffsetX + Math.cos(playerAngle) * turretOffsetY;
    
    // Вычисляем угол между мышью и центром башни
    const dx = mouse.x - turretBaseX;
    const dy = mouse.y - turretBaseY;
    const angle = Math.atan2(dy, dx) + Math.PI / 2;

    // Вычисляем позицию конца ствола
    const barrelLength = 38;
    const barrelX = turretBaseX + Math.sin(angle) * barrelLength;
    const barrelY = turretBaseY - Math.cos(angle) * barrelLength;

    const speed = 10;
    bullets.push({
        x: barrelX,
        y: barrelY,
        angle: angle,
        speed: speed
    });
    
    // Добавляем вспышку при выстреле
    createMuzzleFlash(barrelX, barrelY, angle);
});

function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += Math.sin(b.angle) * b.speed;
        b.y -= Math.cos(b.angle) * b.speed;
        // Удаляем снаряд, если он вышел за пределы экрана
        if (b.x < 0 || b.x > GAME_WIDTH || b.y < 0 || b.y > GAME_HEIGHT) {
            bullets.splice(i, 1);
        }
    }
}

function drawBullets() {
    ctx.save();
    ctx.fillStyle = '#ffeb3b';
    for (const b of bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

let playerAngle = 0; // угол корпуса

function updatePlayer() {
    if (player.isDestroyed) {
        player.destroyTimer++;
        return; // Если танк уничтожен, не обновляем его позицию
    }

    const speed = 3;
    let dx = 0, dy = 0;
    if (keys['w'] || keys['ц'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['ы'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['ф'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['в'] || keys['arrowright']) dx += 1;

    // Отладочная информация
    console.log('Keys:', keys);
    console.log('Movement:', {dx, dy});

    if (dx !== 0 || dy !== 0) {
        // Нормализуем вектор движения
        const len = Math.sqrt(dx*dx + dy*dy);
        dx /= len; dy /= len;
        const nextX = player.x + dx * speed;
        const nextY = player.y + dy * speed;
        const vertsNext = getOBBVertices(nextX, nextY, player.width, player.height, playerAngle);

        let collision = false;
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            const vertsE = getOBBVertices(e.x, e.y, e.width, e.height, e.angle);
            if (polygonsIntersect(vertsNext, vertsE)) {
                collision = true;
                break;
            }
        }
        if (!collision) {
            player.x = nextX;
            player.y = nextY;
        }
        // Плавный поворот корпуса к направлению движения
        const targetAngle = Math.atan2(dy, dx) + Math.PI/2;
        let da = targetAngle - playerAngle;
        // Корректируем угол для плавного вращения
        while (da > Math.PI) da -= 2*Math.PI;
        while (da < -Math.PI) da += 2*Math.PI;
        playerAngle += da * 0.2; // плавность
    }
    // Ограничения по краям экрана с учетом новой высоты
    const halfW = player.width / 2 + 12;
    const halfH = player.height / 2 + 12;
    if (player.x < halfW) player.x = halfW;
    if (player.x > GAME_WIDTH - halfW) player.x = GAME_WIDTH - halfW;
    if (player.y < UI_HEIGHT + halfH) player.y = UI_HEIGHT + halfH;
    if (player.y > canvas.height - halfH) player.y = canvas.height - halfH;
}

// Функция для создания повреждений на танке игрока
function createPlayerDamage() {
    const damageLevel = Math.floor((100 - player.health) / 20); // Определяем уровень повреждений (0-4)
    if (damageLevel === player.damage.length) return; // Если уровень не изменился, не создаем новые повреждения
    
    // Очищаем старые повреждения
    player.damage = [];
    
    // Создаем новые повреждения в зависимости от уровня
    const damageCount = damageLevel + 1; // Количество повреждений увеличивается с уровнем
    for (let i = 0; i < damageCount; i++) {
        // Создаем деформации в локальных координатах
        const offsetX = (Math.random() - 0.5) * player.width * 0.8;
        const offsetY = (Math.random() - 0.5) * player.height * 0.8;
        
        player.damage.push({
            x: offsetX,
            y: offsetY,
            width: 8 + Math.random() * 20,
            height: 3 + Math.random() * 6,
            angle: Math.random() * Math.PI, // Сохраняем случайный угол
            depth: 0.2 + Math.random() * 0.3,
            alpha: 1
        });
    }
}

// Функция для отрисовки шкалы здоровья
function drawHealthBar() {
    const barWidth = 150; // Уменьшаем ширину шкалы
    const barHeight = 15; // Уменьшаем высоту шкалы
    const x = 20;
    const y = 12;
    
    // Фон шкалы
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, barWidth, barHeight);
    
    // Заполнение шкалы
    const healthPercent = player.health / player.maxHealth;
    const fillWidth = barWidth * healthPercent;
    
    // Цвет шкалы в зависимости от здоровья
    let color;
    if (healthPercent > 0.6) color = '#4caf50';
    else if (healthPercent > 0.3) color = '#ff9800';
    else color = '#f44336';
    
    ctx.fillStyle = color;
    ctx.fillRect(x, y, fillWidth, barHeight);
    
    // Текст здоровья
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.fillText(`HP: ${player.health}`, x + barWidth + 10, y + 12);
}

// Улучшенная функция для создания изломанной линии
function drawCrack(ctx, startX, startY, endX, endY, segments = 5, bounds = null) {
    if (!ctx) return; // Проверка на null контекст
    
    const points = [];
    points.push({x: startX, y: startY});
    
    // Создаем промежуточные точки с случайными отклонениями
    for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const baseX = startX + (endX - startX) * t;
        const baseY = startY + (endY - startY) * t;
        
        // Уменьшаем случайность отклонений для стабильности
        const deviation = Math.min(Math.abs(endX - startX), Math.abs(endY - startY)) * 0.3;
        let newX = baseX + (Math.random() - 0.5) * deviation;
        let newY = baseY + (Math.random() - 0.5) * deviation;
        
        // Если заданы границы, ограничиваем точки
        if (bounds) {
            newX = Math.max(bounds.left, Math.min(bounds.right, newX));
            newY = Math.max(bounds.top, Math.min(bounds.bottom, newY));
        }
        
        points.push({x: newX, y: newY});
    }
    points.push({x: endX, y: endY});
    
    // Рисуем изломанную линию с переменной толщиной
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        
        // Уменьшаем вариацию толщины для стабильности
        const thickness = 1 + Math.random() * 1.5;
        ctx.lineWidth = thickness;
        
        if (next) {
            // Уменьшаем случайность изломов
            const midX = (curr.x + next.x) / 2 + (Math.random() - 0.5) * 3;
            const midY = (curr.y + next.y) / 2 + (Math.random() - 0.5) * 3;
            
            // Если заданы границы, ограничиваем точки
            if (bounds) {
                midX = Math.max(bounds.left, Math.min(bounds.right, midX));
                midY = Math.max(bounds.top, Math.min(bounds.bottom, midY));
            }
            
            ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
        } else {
            ctx.lineTo(curr.x, curr.y);
        }
    }
    ctx.stroke();
}

// Модифицируем функцию drawPlayer для отображения повреждений
function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(playerAngle);

    if (player.isDestroyed) {
        // Анимация уничтожения
        const progress = player.destroyTimer / 60; // 60 кадров на анимацию
        
        // Сначала рисуем обгоревший корпус
        ctx.fillStyle = '#222';
        roundRect(ctx, -player.width/2, -player.height/2, player.width, player.height, 12);
        ctx.fill();
        
        // Добавляем обгоревшие детали
        ctx.fillStyle = '#111';
        ctx.fillRect(-player.width/2 - 8, -player.height/2, 12, player.height);
        ctx.fillRect(player.width/2 - 4, -player.height/2, 12, player.height);
        
        // Рисуем густой дым
        for (let i = 0; i < 5; i++) {
            const angle = (Math.PI * 2 * i / 5) + progress * 1.5;
            const distance = 35 + Math.sin(progress * Math.PI) * 20;
            const x = Math.cos(angle) * distance;
            const y = Math.sin(angle) * distance;
            
            ctx.save();
            ctx.translate(x, y);
            
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
            gradient.addColorStop(0, 'rgba(100, 100, 100, 0.9)');
            gradient.addColorStop(0.5, 'rgba(80, 80, 80, 0.7)');
            gradient.addColorStop(1, 'rgba(50, 50, 50, 0)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
        
        // Добавляем внутренний огонь
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI * 2 * i / 6) + progress * 4;
            const distance = 15 + Math.sin(progress * Math.PI * 3) * 10;
            const x = Math.cos(angle) * distance;
            const y = Math.sin(angle) * distance;
            
            ctx.save();
            ctx.translate(x, y);
            
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
            gradient.addColorStop(0.3, 'rgba(255, 255, 0, 0.8)');
            gradient.addColorStop(0.7, 'rgba(255, 100, 0, 0.7)');
            gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
        
        // Рисуем интенсивный огонь поверх всего
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i / 8) + progress * 3;
            const distance = 25 + Math.sin(progress * Math.PI * 2) * 15;
            const x = Math.cos(angle) * distance;
            const y = Math.sin(angle) * distance;
            
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            
            const gradient = ctx.createLinearGradient(0, -15, 0, 15);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
            gradient.addColorStop(0.2, 'rgba(255, 255, 0, 0.9)');
            gradient.addColorStop(0.5, 'rgba(255, 100, 0, 0.9)');
            gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(0, -15);
            ctx.lineTo(8, 0);
            ctx.lineTo(0, 15);
            ctx.lineTo(-8, 0);
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
        }
        
        // Добавляем искры поверх всего
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 40 + Math.random() * 20;
            const x = Math.cos(angle) * distance;
            const y = Math.sin(angle) * distance;
            
            ctx.save();
            ctx.translate(x, y);
            
            ctx.fillStyle = 'rgba(255, 200, 50, 0.8)';
            ctx.beginPath();
            ctx.arc(0, 0, 2 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
        
        ctx.restore();
        return;
    }

    // Гусеницы
    ctx.fillStyle = '#222';
    ctx.fillRect(-player.width/2 - 8, -player.height/2, 12, player.height);
    ctx.fillRect(player.width/2 - 4, -player.height/2, 12, player.height);

    // Определяем уровень повреждений
    const healthPercent = player.health / player.maxHealth;
    let damageLevel;
    if (healthPercent > 0.8) damageLevel = 0;      // 100-80% - целый танк
    else if (healthPercent > 0.6) damageLevel = 1; // 80-60% - легкие повреждения
    else if (healthPercent > 0.4) damageLevel = 2; // 60-40% - средние повреждения
    else if (healthPercent > 0.2) damageLevel = 3; // 40-20% - тяжелые повреждения
    else damageLevel = 4;                          // 20-0% - критический урон

    // Корпус с закруглёнными углами
    ctx.fillStyle = player.color;
    roundRect(ctx, -player.width/2, -player.height/2, player.width, player.height, 12);
    ctx.fill();

    // Добавляем визуальные повреждения в зависимости от уровня
    if (damageLevel >= 0) { // Целый танк
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        roundRect(ctx, -player.width/2 + 5, -player.height/2 + 5, player.width - 10, player.height - 10, 8);
        ctx.fill();
    }
    
    // Отрисовываем сохраненные повреждения
    for (const damage of player.damage) {
        ctx.save();
        ctx.translate(damage.x, damage.y);
        ctx.rotate(damage.angle);
        ctx.fillStyle = `rgba(0, 0, 0, ${0.2 + damageLevel * 0.1})`;
        ctx.fillRect(-damage.width/2, -damage.height/2, damage.width, damage.height);
        ctx.restore();
    }

    // --- ВЫЧИСЛЯЕМ угол до мыши с учётом поворота корпуса ---
    const turretBaseX = 0;
    const turretBaseY = -player.height/4;
    const dx_global = mouse.x - player.x;
    const dy_global = mouse.y - player.y;
    const dx = Math.cos(-playerAngle) * dx_global - Math.sin(-playerAngle) * dy_global - turretBaseX;
    const dy = Math.sin(-playerAngle) * dx_global + Math.cos(-playerAngle) * dy_global - turretBaseY;
    const angle = Math.atan2(dy, dx) + Math.PI / 2;

    // Круглая башня и ствол
    ctx.save();
    ctx.translate(turretBaseX, turretBaseY);
    ctx.rotate(angle);
    // Ствол
    ctx.fillStyle = '#888';
    ctx.fillRect(-4, -38, 8, 38);
    // Башня
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#388e3c';
    ctx.fill();
    // Люк
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#eee';
    ctx.fill();
    ctx.restore();

    // Фары
    ctx.beginPath();
    ctx.arc(-12, player.height/2 - 8, 4, 0, Math.PI * 2);
    ctx.arc(12, player.height/2 - 8, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd600';
    ctx.fill();

    ctx.restore();
}

// Вспомогательная функция для скруглённых прямоугольников
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawCrosshair(x, y) {
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    // Внешний круг
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.stroke();
    // Внутренний круг
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();
    // Короткие перекрестья
    ctx.beginPath();
    ctx.moveTo(x - 18, y);
    ctx.lineTo(x - 8, y);
    ctx.moveTo(x + 8, y);
    ctx.lineTo(x + 18, y);
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x, y - 8);
    ctx.moveTo(x, y + 8);
    ctx.lineTo(x, y + 18);
    ctx.stroke();
    ctx.restore();
}

function clear() {
    // Очищаем всю область
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Рисуем фон для UI области
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, GAME_WIDTH, UI_HEIGHT);
    
    // Рисуем фон для игровой области
    ctx.fillStyle = '#333';
    ctx.fillRect(0, UI_HEIGHT, GAME_WIDTH, GAME_HEIGHT);
}

const enemies = [];
let enemySpawnTimer = 0;
let score = 0;

function spawnEnemy() {
    if (enemies.length >= 5) return;
    const width = 44;
    const height = 60;
    const speed = 1.2;
    const side = Math.floor(Math.random() * 4);
    let x, y, angle;
    if (side === 0) {
        x = Math.random() * (GAME_WIDTH - width) + width / 2;
        y = UI_HEIGHT - height;
        angle = Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 2);
    } else if (side === 1) {
        x = GAME_WIDTH + width;
        y = UI_HEIGHT + Math.random() * (GAME_HEIGHT - height) + height / 2;
        angle = Math.PI + (Math.random() - 0.5) * (Math.PI / 2);
    } else if (side === 2) {
        x = Math.random() * (GAME_WIDTH - width) + width / 2;
        y = canvas.height + height;
        angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 2);
    } else {
        x = -width;
        y = UI_HEIGHT + Math.random() * (GAME_HEIGHT - height) + height / 2;
        angle = 0 + (Math.random() - 0.5) * (Math.PI / 2);
    }
    const changeDirTimer = 30 + Math.random() * 60;
    enemies.push({ 
        x, 
        y, 
        width, 
        height, 
        speed, 
        angle, 
        targetAngle: angle, 
        changeDirTimer,
        lastShotTime: 0 // Добавляем таймер последнего выстрела
    });
}

// Функция для создания вражеского снаряда
function createEnemyBullet(x, y, angle) {
    const speed = 8;
    enemyBullets.push({
        x: x,
        y: y,
        angle: angle,
        speed: speed
    });
    
    // Добавляем вспышку при выстреле
    createMuzzleFlash(x, y, angle);
}

// Функция для перезапуска игры
function restartGame() {
    // Сбрасываем состояние игрока
    player.x = GAME_WIDTH / 2;
    player.y = GAME_HEIGHT - 100;
    player.health = 100;
    player.damage = [];
    player.isDestroyed = false;
    player.destroyTimer = 0;
    
    // Очищаем массивы
    bullets.length = 0;
    enemyBullets.length = 0;
    enemies.length = 0;
    muzzleFlashes.length = 0;
    smokeParticles.length = 0;
    explosionParticles.length = 0;
    dyingEnemies.length = 0;
    
    // Сбрасываем счет
    score = 0;
    
    // Скрываем кнопку
    restartButton.style.display = 'none';
}

// Добавляем обработчик клика по кнопке
restartButton.addEventListener('click', restartGame);

// Модифицируем функцию updateEnemyBullets для показа кнопки при уничтожении
function updateEnemyBullets() {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.x += Math.sin(b.angle) * b.speed;
        b.y -= Math.cos(b.angle) * b.speed;
        
        // Проверяем столкновение с игроком
        if (!player.isDestroyed && 
            b.x > player.x - player.width/2 && b.x < player.x + player.width/2 &&
            b.y > player.y - player.height/2 && b.y < player.y + player.height/2) {
            // Наносим урон игроку
            player.health = Math.max(0, player.health - 20);
            createPlayerDamage();
            
            // Проверяем уничтожение танка
            if (player.health <= 0 && !player.isDestroyed) {
                player.isDestroyed = true;
                player.destroyTimer = 0;
                createExplosion(player.x, player.y);
                // Показываем кнопку перезапуска
                restartButton.style.display = 'block';
            }
            
            enemyBullets.splice(i, 1);
            continue;
        }
        
        // Удаляем снаряд, если он вышел за пределы экрана
        if (b.x < 0 || b.x > GAME_WIDTH || b.y < 0 || b.y > GAME_HEIGHT) {
            enemyBullets.splice(i, 1);
        }
    }
}

// Функция для отрисовки вражеских снарядов
function drawEnemyBullets() {
    ctx.save();
    ctx.fillStyle = '#ff4444';
    for (const b of enemyBullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// Модифицируем функцию updateEnemies для изменения логики стрельбы
function updateEnemies() {
    enemySpawnTimer--;
    if (enemySpawnTimer <= 0) {
        spawnEnemy();
        enemySpawnTimer = 60 + Math.random() * 60;
    }
    
    const currentTime = Date.now(); // Получаем текущее время
    
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        
        // Случайное изменение направления движения
        if (Math.random() < 0.02) {
            e.targetAngle = Math.random() * Math.PI * 2;
        }
        
        // Плавный поворот к целевому углу
        let da = e.targetAngle - e.angle;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        e.angle += da * 0.02;
        
        // Движение с учётом столкновений
        const nextX = e.x + Math.cos(e.angle) * e.speed;
        const nextY = e.y + Math.sin(e.angle) * e.speed;
        const vertsNext = getOBBVertices(nextX, nextY, e.width, e.height, e.angle);

        let collision = false;
        for (let k = 0; k < enemies.length; k++) {
            if (k !== i) {
                const other = enemies[k];
                const vertsOther = getOBBVertices(other.x, other.y, other.width, other.height, other.angle);
                if (polygonsIntersect(vertsNext, vertsOther)) {
                    collision = true;
                    e.targetAngle = Math.random() * Math.PI * 2;
                    break;
                }
            }
        }
        
        const vertsPlayer = getOBBVertices(player.x, player.y, player.width, player.height, playerAngle);
        if (polygonsIntersect(vertsNext, vertsPlayer)) {
            collision = true;
            e.targetAngle = Math.random() * Math.PI * 2;
        }

        if (!collision) {
            e.x = nextX;
            e.y = nextY;
        }
        
        // Проверяем возможность стрельбы
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const distToPlayer = Math.sqrt(dx * dx + dy * dy);
        const angleToPlayer = Math.atan2(dy, dx) + Math.PI/2;
        
        if (distToPlayer < 500) {
            // Проверяем, что танк движется в сторону игрока
            const movementAngle = e.angle + Math.PI/2;
            const movementToPlayerAngle = Math.abs(movementAngle - angleToPlayer);
            const isMovingTowardsPlayer = movementToPlayerAngle < Math.PI/9 || movementToPlayerAngle > 17*Math.PI/9;
            
            // Проверяем, прошла ли секунда с последнего выстрела
            if (isMovingTowardsPlayer && currentTime - e.lastShotTime >= 1000) {
                const barrelLength = 28;
                const barrelX = e.x + Math.sin(e.angle + Math.PI/2) * barrelLength;
                const barrelY = e.y - Math.cos(e.angle + Math.PI/2) * barrelLength;
                createEnemyBullet(barrelX, barrelY, e.angle + Math.PI/2);
                e.lastShotTime = currentTime; // Обновляем время последнего выстрела
            }
        }
        
        // Не даём выезжать за пределы экрана и в UI область
        if (e.x < e.width/2) {
            e.x = e.width/2;
            e.targetAngle = Math.random() * Math.PI;
        }
        if (e.x > GAME_WIDTH - e.width/2) {
            e.x = GAME_WIDTH - e.width/2;
            e.targetAngle = Math.random() * Math.PI + Math.PI;
        }
        if (e.y < UI_HEIGHT + e.height/2) {
            e.y = UI_HEIGHT + e.height/2;
            e.targetAngle = Math.random() * Math.PI + Math.PI/2;
        }
        if (e.y > canvas.height - e.height/2) {
            e.y = canvas.height - e.height/2;
            e.targetAngle = Math.random() * Math.PI - Math.PI/2;
        }
    }
    
    // Отталкивание танков друг от друга
    for (let rep = 0; rep < 2; rep++) {
        for (let i = 0; i < enemies.length; i++) {
            for (let j = i + 1; j < enemies.length; j++) {
                const a = enemies[i];
                const b = enemies[j];
                const vertsA = getOBBVertices(a.x, a.y, a.width, a.height, a.angle);
                const vertsB = getOBBVertices(b.x, b.y, b.width, b.height, b.angle);
                if (polygonsIntersect(vertsA, vertsB)) {
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                    const overlap = 8;
                    const ox = dx / dist * overlap;
                    const oy = dy / dist * overlap;
                    a.x -= ox;
                    a.y -= oy;
                    b.x += ox;
                    b.y += oy;
                    a.targetAngle = Math.random() * Math.PI * 2;
                    b.targetAngle = Math.random() * Math.PI * 2;
                }
            }
            
            // Отталкивание от игрока
            const e = enemies[i];
            const vertsE = getOBBVertices(e.x, e.y, e.width, e.height, e.angle);
            const vertsP = getOBBVertices(player.x, player.y, player.width, player.height, playerAngle);
            if (polygonsIntersect(vertsE, vertsP)) {
                const dx = e.x - player.x;
                const dy = e.y - player.y;
                const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                const overlap = 8;
                const ox = dx / dist * overlap;
                const oy = dy / dist * overlap;
                e.x += ox;
                e.y += oy;
                e.targetAngle = Math.random() * Math.PI * 2;
            }
        }
    }
}

function drawEnemies() {
    for (const e of enemies) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle + Math.PI / 2);
        // Гусеницы
        ctx.fillStyle = '#444';
        ctx.fillRect(-e.width/2 - 6, -e.height/2, 10, e.height);
        ctx.fillRect(e.width/2 - 4, -e.height/2, 10, e.height);
        // Корпус
        ctx.fillStyle = '#b71c1c'; // Возвращаем красный цвет
        roundRect(ctx, -e.width/2, -e.height/2, e.width, e.height, 10);
        ctx.fill();
        // Башня
        ctx.beginPath();
        ctx.arc(0, -e.height/4, 13, 0, Math.PI * 2);
        ctx.fillStyle = '#880000'; // Возвращаем темно-красный для башни
        ctx.fill();
        // Ствол
        ctx.save();
        ctx.translate(0, -e.height/4);
        ctx.fillStyle = '#888';
        ctx.fillRect(-3, -28, 6, 28);
        ctx.restore();
        ctx.restore();
    }
}

// Функция для создания взрыва
function createExplosion(x, y) {
    // Создаем частицы огня и дыма
    for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 3;
        const size = 10 + Math.random() * 15;
        
        explosionParticles.push({
            x: x,
            y: y,
            size: size,
            speedX: Math.cos(angle) * speed,
            speedY: Math.sin(angle) * speed,
            life: 30 + Math.random() * 20,
            alpha: 1,
            type: Math.random() < 0.7 ? 'fire' : 'smoke' // 70% огня, 30% дыма
        });
    }
    
    // Создаем искры
    for (let i = 0; i < 15; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 4;
        
        explosionParticles.push({
            x: x,
            y: y,
            size: 2 + Math.random() * 2,
            speedX: Math.cos(angle) * speed,
            speedY: Math.sin(angle) * speed,
            life: 20 + Math.random() * 10,
            alpha: 1,
            type: 'spark'
        });
    }
}

// Функция для обновления и отрисовки взрыва
function updateExplosion() {
    for (let i = explosionParticles.length - 1; i >= 0; i--) {
        const p = explosionParticles[i];
        p.life--;
        p.alpha *= 0.95;
        p.x += p.speedX;
        p.y += p.speedY;
        
        // Гравитация для искр
        if (p.type === 'spark') {
            p.speedY += 0.1;
        }
        
        // Отрисовываем частицу
        ctx.save();
        ctx.globalAlpha = p.alpha;
        
        if (p.type === 'fire') {
            // Огонь
            const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            gradient.addColorStop(0, 'rgba(255, 255, 200, 0.8)');
            gradient.addColorStop(0.5, 'rgba(255, 100, 0, 0.6)');
            gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
            ctx.fillStyle = gradient;
        } else if (p.type === 'smoke') {
            // Дым
            const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            gradient.addColorStop(0, 'rgba(100, 100, 100, 0.4)');
            gradient.addColorStop(1, 'rgba(50, 50, 50, 0)');
            ctx.fillStyle = gradient;
        } else {
            // Искры
            ctx.fillStyle = 'rgba(255, 200, 50, 0.8)';
        }
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        // Удаляем частицу, если она закончилась
        if (p.life <= 0) {
            explosionParticles.splice(i, 1);
        }
    }
}

// Функция для создания эффекта уничтожения танка
function createDyingEffect(enemy) {
    // Создаем массив царапин и вмятин
    const damage = [];
    for (let i = 0; i < 12; i++) { // Увеличиваем количество деформаций
        // Создаем деформации в локальных координатах
        const offsetX = (Math.random() - 0.5) * enemy.width * 0.9; // Увеличиваем область деформаций
        const offsetY = (Math.random() - 0.5) * enemy.height * 0.9;
        
        damage.push({
            x: offsetX,
            y: offsetY,
            width: 10 + Math.random() * 25, // Увеличиваем размер деформаций
            height: 3 + Math.random() * 8, // Увеличиваем глубину деформаций
            angle: Math.random() * Math.PI * 2,
            depth: Math.random() * 0.4 + 0.2, // Увеличиваем глубину эффекта
            alpha: 0
        });
    }
    
    dyingEnemies.push({
        x: enemy.x,
        y: enemy.y,
        width: enemy.width,
        height: enemy.height,
        angle: enemy.angle + Math.PI/2,
        life: 45,
        damage: damage,
        phase: 0
    });
}

// Функция для обновления и отрисовки умирающих танков
function updateDyingEnemies() {
    for (let i = dyingEnemies.length - 1; i >= 0; i--) {
        const e = dyingEnemies[i];
        e.life--;
        
        // Определяем фазу анимации
        if (e.life > 30) {
            e.phase = 0;
        } else if (e.life > 5) {
            e.phase = 1;
        } else {
            e.phase = 2;
        }
        
        // Обновляем прозрачность деформаций в зависимости от фазы
        if (e.phase === 0) {
            const progress = 1 - (e.life - 30) / 15;
            for (const d of e.damage) {
                d.alpha = progress;
            }
        }
        
        // Отрисовываем деформированный танк
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        
        // Гусеницы
        ctx.fillStyle = '#444';
        ctx.fillRect(-e.width/2 - 6, -e.height/2, 10, e.height);
        ctx.fillRect(e.width/2 - 4, -e.height/2, 10, e.height);
        
        // Корпус с деформацией
        ctx.fillStyle = '#b71c1c';
        roundRect(ctx, -e.width/2, -e.height/2, e.width, e.height, 10);
        ctx.fill();
        
        // Добавляем царапины и вмятины
        for (const d of e.damage) {
            ctx.save();
            ctx.translate(d.x, d.y);
            ctx.rotate(d.angle);
            
            // Создаем градиент для вмятины
            const gradient = ctx.createLinearGradient(-d.width/2, 0, d.width/2, 0);
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(0.5, `rgba(0, 0, 0, ${0.4 * d.depth * d.alpha})`); // Увеличиваем контраст
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(-d.width/2, -d.height/2, d.width, d.height);
            
            // Добавляем блик
            ctx.fillStyle = `rgba(255, 255, 255, ${0.3 * d.depth * d.alpha})`; // Увеличиваем яркость блика
            ctx.fillRect(-d.width/2, -d.height/2, d.width, d.height/2);
            
            ctx.restore();
        }
        
        // Башня с деформацией
        ctx.beginPath();
        ctx.arc(0, -e.height/4, 13, 0, Math.PI * 2);
        ctx.fillStyle = '#880000';
        ctx.fill();
        
        // Добавляем царапины на башне
        ctx.fillStyle = `rgba(0, 0, 0, ${0.3 * e.damage[0].alpha})`; // Увеличиваем контраст царапин
        for (let j = 0; j < 5; j++) { // Увеличиваем количество царапин на башне
            const angle = Math.random() * Math.PI * 2;
            const length = 8 + Math.random() * 12; // Увеличиваем длину царапин
            ctx.save();
            ctx.translate(0, -e.height/4);
            ctx.rotate(angle);
            ctx.fillRect(-length/2, -1.5, length, 3); // Увеличиваем толщину царапин
            ctx.restore();
        }
        
        // Ствол
        ctx.save();
        ctx.translate(0, -e.height/4);
        ctx.fillStyle = '#888';
        ctx.fillRect(-3, -28, 6, 28);
        ctx.restore();
        
        ctx.restore();
        
        // Если время вышло, создаем взрыв и удаляем танк
        if (e.life <= 0) {
            createExplosion(e.x, e.y);
            dyingEnemies.splice(i, 1);
        }
    }
}

// Модифицируем функцию проверки столкновений
function checkBulletEnemyCollisions() {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (
                b.x > e.x - e.width/2 && b.x < e.x + e.width/2 &&
                b.y > e.y - e.height/2 && b.y < e.y + e.height/2
            ) {
                // Создаем эффект уничтожения вместо мгновенного взрыва
                createDyingEffect(e);
                enemies.splice(i, 1);
                bullets.splice(j, 1);
                score++;
                break;
            }
        }
    }
}

function drawScore() {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.fillText('Счёт: ' + score, GAME_WIDTH - 150, 25);
    ctx.restore();
}

window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

function gameLoop() {
    clear();
    updatePlayer();
    drawPlayer();
    updateBullets();
    updateEnemyBullets();
    updateEnemies();
    checkBulletEnemyCollisions();
    drawBullets();
    drawEnemyBullets();
    drawEnemies();
    updateDyingEnemies();
    drawCrosshair(mouse.x, mouse.y);
    drawScore();
    drawHealthBar();
    updateMuzzleFlashes();
    updateSmoke();
    updateExplosion();
    requestAnimationFrame(gameLoop);
}

gameLoop(); 