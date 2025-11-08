// Глобальные переменные
let accounts = [];
let masterPassword = null;
let cryptoKey = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔐 Инициализация защищенного 2FA приложения...');
    checkMasterPassword();
});

// Проверка наличия мастер-пароля
async function checkMasterPassword() {
    const hasMasterPassword = localStorage.getItem('2fa-has-master-password');
    const encryptedData = localStorage.getItem('2fa-encrypted-accounts');
    
    if (!hasMasterPassword || !encryptedData) {
        // Первый запуск - настраиваем мастер-пароль
        showPasswordSetupModal();
    } else {
        // Показываем окно входа
        showLoginModal();
    }
}

// Показать окно настройки мастер-пароля
function showPasswordSetupModal() {
    document.getElementById('password-modal').style.display = 'block';
}

// Показать окно входа
function showLoginModal() {
    document.getElementById('login-modal').style.display = 'block';
}

// Настройка мастер-пароля
async function setupMasterPassword() {
    const password = document.getElementById('master-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (!password) {
        alert('Введите мастер-пароль');
        return;
    }
    
    if (password !== confirmPassword) {
        alert('Пароли не совпадают');
        return;
    }
    
    if (password.length < 6) {
        alert('Пароль должен быть не менее 6 символов');
        return;
    }
    
    try {
        // Сохраняем хеш пароля (в реальном приложении нужно использовать более безопасные методы)
        masterPassword = password;
        
        // Генерируем ключ шифрования из пароля
        cryptoKey = await deriveKeyFromPassword(password);
        
        // Сохраняем флаг что мастер-пароль установлен
        localStorage.setItem('2fa-has-master-password', 'true');
        
        // Скрываем модальное окно
        document.getElementById('password-modal').style.display = 'none';
        
        console.log('✅ Мастер-пароль установлен');
        loadAccounts();
        startTimer();
        
    } catch (error) {
        console.error('Ошибка настройки пароля:', error);
        alert('Ошибка при настройке пароля');
    }
}

// Вход с мастер-паролем
async function login() {
    const password = document.getElementById('login-password').value;
    
    if (!password) {
        alert('Введите мастер-пароль');
        return;
    }
    
    try {
        // Пробуем расшифровать данные с этим паролем
        cryptoKey = await deriveKeyFromPassword(password);
        masterPassword = password;
        
        // Проверяем что пароль правильный пытаясь расшифровать данные
        await loadAccounts();
        
        // Если успешно - скрываем окно входа
        document.getElementById('login-modal').style.display = 'none';
        
        console.log('✅ Успешный вход');
        startTimer();
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        alert('Неверный мастер-пароль');
        document.getElementById('login-password').value = '';
    }
}

// Загрузка аккаунтов из localStorage
async function loadAccounts() {
    const encryptedData = localStorage.getItem('2fa-encrypted-accounts');
    
    if (!encryptedData) {
        accounts = [];
        renderAccounts();
        return;
    }
    
    try {
        accounts = await decryptData(encryptedData);
        console.log('✅ Аккаунты загружены и расшифрованы:', accounts.length);
        renderAccounts();
    } catch (error) {
        console.error('Ошибка загрузки аккаунтов:', error);
        throw error; // Пробрасываем ошибку для обработки в login()
    }
}

// Сохранение аккаунтов в localStorage
async function saveAccounts() {
    try {
        const encryptedData = await encryptData(accounts);
        localStorage.setItem('2fa-encrypted-accounts', encryptedData);
        console.log('✅ Аккаунты зашифрованы и сохранены');
    } catch (error) {
        console.error('Ошибка сохранения аккаунтов:', error);
        alert('Ошибка при сохранении данных');
    }
}

// Отображение списка аккаунтов
function renderAccounts() {
    const accountsList = document.getElementById('accounts-list');
    
    if (!accountsList) return;
    
    if (accounts.length === 0) {
        accountsList.innerHTML = `
            <div class="empty-state">
                <p>${masterPassword ? 'У вас пока нет добавленных ключей' : 'Требуется настройка безопасности'}</p>
                <button onclick="showAddAccountModal()">Добавить первый ключ</button>
            </div>
        `;
    } else {
        accountsList.innerHTML = `
            <div class="encrypted-warning">
                Данные защищены шифрованием
            </div>
            ${accounts.map((account, index) => `
                <div class="account-card">
                    <div class="account-info">
                        <div class="account-name">${escapeHtml(account.issuer)}</div>
                        <div class="account-code">${generateTOTP(account.secret)}</div>
                        <div class="account-secret">Секрет: ${maskSecret(account.secret)}</div>
                    </div>
                    <div class="account-timer" id="timer-${index}">
                        <div class="timer-progress">
                            <div class="timer-fill" style="width: ${(30 - (Math.floor(Date.now() / 1000) % 30)) / 30 * 100}%"></div>
                        </div>
                        <span>${30 - (Math.floor(Date.now() / 1000) % 30)}s</span>
                    </div>
                    <button class="remove-btn" onclick="removeAccount(${index})">×</button>
                </div>
            `).join('')}
        `;
    }
}

// Экранирование HTML для безопасности
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Генерация TOTP кода с защищенным доступом
function generateTOTP(secret) {
    try {
        if (!masterPassword) {
            throw new Error('Требуется мастер-пароль');
        }
        
        const code = window.otplib.authenticator.generate(secret);
        console.log('✅ Сгенерирован защищенный TOTP код');
        return formatCode(code);
    } catch (error) {
        console.error('Ошибка генерации кода:', error);
        return 'AUTH REQUIRED';
    }
}

// Проверка TOTP кода
function verifyTOTP(token, secret) {
    try {
        const isValid = window.otplib.authenticator.verify({
            token: token,
            secret: secret
        });
        console.log('🔍 Проверка кода', token, 'для секрета', secret, ':', isValid);
        return isValid;
    } catch (error) {
        console.error('Ошибка проверки кода:', error);
        return false;
    }
}

// Маскировка секретного ключа для безопасности
function maskSecret(secret) {
    if (secret.length <= 8) {
        return '••••••••';
    }
    const visibleStart = secret.substring(0, 4);
    const visibleEnd = secret.substring(secret.length - 4);
    return `${visibleStart}••••${visibleEnd}`;
}

// Форматирование кода: 123456 -> 123 456
function formatCode(code) {
    if (code.length === 6) {
        return code.substring(0, 3) + ' ' + code.substring(3, 6);
    }
    return code;
}

// Таймер обновления кодов с плавной анимацией
function startTimer() {
    setInterval(() => {
        const currentSeconds = Math.floor(Date.now() / 1000) % 30;
        const remainingSeconds = 30 - currentSeconds;
        
        // Обновляем прогресс-бары
        accounts.forEach((account, index) => {
            const timerElement = document.getElementById(`timer-${index}`);
            if (timerElement) {
                const progressFill = timerElement.querySelector('.timer-fill');
                const timeText = timerElement.querySelector('span');
                
                if (progressFill) {
                    progressFill.style.width = `${(remainingSeconds / 30) * 100}%`;
                }
                if (timeText) {
                    timeText.textContent = `${remainingSeconds}s`;
                }
            }
        });
        
        // Каждые 30 секунд обновляем коды
        if (currentSeconds === 0) {
            console.log('🔄 Авто-обновление TOTP кодов');
            renderAccounts();
        }
    }, 1000);
}

// Модальное окно
function showAddAccountModal() {
    document.getElementById('add-account-modal').style.display = 'block';
}

function hideAddAccountModal() {
    document.getElementById('add-account-modal').style.display = 'none';
}

// Добавление аккаунта вручную
function addManualAccount() {
    const issuer = document.getElementById('issuer-input').value;
    const secret = document.getElementById('secret-input').value.trim();
    
    console.log('Добавляем аккаунт:', { issuer, secret });
    
    if (!issuer || !secret) {
        alert('Пожалуйста, заполните все поля');
        return;
    }
    
    // Проверяем формат секретного ключа
    if (!isValidSecret(secret)) {
        alert('Неверный формат секретного ключа. Ключ должен содержать только буквы A-Z и цифры 2-7');
        return;
    }
    
    const newAccount = {
        issuer: issuer,
        secret: secret,
        addedAt: new Date().toISOString()
    };
    
    accounts.push(newAccount);
    saveAccounts();
    renderAccounts();
    hideAddAccountModal();
    
    // Очищаем поля
    document.getElementById('issuer-input').value = '';
    document.getElementById('secret-input').value = '';
    
    alert('Ключ успешно добавлен!');
}

// Простая проверка секретного ключа
function isValidSecret(secret) {
    // Base32 формат: A-Z, 2-7
    const base32Regex = /^[A-Z2-7]+=*$/;
    return base32Regex.test(secret);
}

// Удаление аккаунта
function removeAccount(index) {
    if (confirm('Удалить этот ключ?')) {
        accounts.splice(index, 1);
        saveAccounts();
        renderAccounts();
    }
}

// Закрытие модального окна при клике вне его
document.addEventListener('click', function(event) {
    const modal = document.getElementById('add-account-modal');
    if (event.target === modal) {
        hideAddAccountModal();
    }
});

// Генерация ключа шифрования из пароля
async function deriveKeyFromPassword(password) {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    
    // Используем PBKDF2 для получения ключа из пароля
    const baseKey = await window.crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        'PBKDF2',
        false,
        ['deriveKey']
    );
    
    const key = await window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode('2fa-salt'), // В реальном приложении используй случайную соль
            iterations: 100000,
            hash: 'SHA-256'
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
    
    return key;
}

// Шифрование данных
async function encryptData(data) {
    if (!cryptoKey) throw new Error('Ключ шифрования не установлен');
    
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(JSON.stringify(data));
    
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const encryptedBuffer = await window.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        cryptoKey,
        dataBuffer
    );
    
    // Объединяем IV и зашифрованные данные
    const result = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encryptedBuffer), iv.length);
    
    return btoa(String.fromCharCode(...result));
}

// Дешифрование данных
async function decryptData(encryptedData) {
    if (!cryptoKey) throw new Error('Ключ шифрования не установлен');
    
    try {
        const encryptedBuffer = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
        
        const iv = encryptedBuffer.slice(0, 12);
        const data = encryptedBuffer.slice(12);
        
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            cryptoKey,
            data
        );
        
        const decoder = new TextDecoder();
        return JSON.parse(decoder.decode(decryptedBuffer));
        
    } catch (error) {
        console.error('Ошибка дешифрования:', error);
        throw new Error('Неверный мастер-пароль или поврежденные данные');
    }
}

// Добавляем функции в глобальную область видимости
window.showAddAccountModal = showAddAccountModal;
window.hideAddAccountModal = hideAddAccountModal;
window.showTab = showTab;
window.addManualAccount = addManualAccount;
window.removeAccount = removeAccount;

console.log('Приложение инициализировано!');