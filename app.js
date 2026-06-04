// Глобальные переменные
let accounts = [];
let masterPassword = null;
let cryptoKey = null;
let currentUser = null;
const SESSION_DURATION = 15 * 60 * 1000;

function getUserStorageKey(username) {
    return `2fa-user-${username}`;
}

function getUsersList() {

    const users = localStorage.getItem('2fa-users-list');

    return users ? JSON.parse(users) : [];
}

function saveUsersList(users) {

    localStorage.setItem(
        '2fa-users-list',
        JSON.stringify(users)
    );
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔐 Инициализация защищенного 2FA приложения...');
    checkMasterPassword();
});

// Проверка наличия мастер-пароля
async function checkMasterPassword() {
    const sessionData = localStorage.getItem('2fa-session');
    if (sessionData) {
        try {
            const session = JSON.parse(sessionData);
            const currentTime = Date.now();
            const sessionAge = currentTime - session.loginTime;
            if (sessionAge < SESSION_DURATION) {
                console.log('✅ Активная сессия найдена');
                showLoginModal();
                document.getElementById('login-username').value =
                    session.username;
                return;
            }
            console.log('⌛ Сессия истекла');
            localStorage.removeItem('2fa-session');
        } catch (error) {
            console.error('Ошибка session:', error);
            localStorage.removeItem('2fa-session');
        }
    }
    const users = getUsersList();
    if (users.length === 0) {
        showPasswordSetupModal();
    } else {
        showLoginModal();
    }
}

// Показать окно настройки мастер-пароля
function showPasswordSetupModal() {
    document.getElementById('password-modal').style.display = 'flex';
}

// Показать окно входа
function showLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
}

// Настройка мастер-пароля
async function setupMasterPassword() {
    const password = document.getElementById('master-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const username = document
        .getElementById('register-username')
        .value
        .trim();

    if (!username) {
        alert('Введите имя пользователя');
    return;
}
    
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
        currentUser = username;
        masterPassword = password;
        
        // Генерируем ключ шифрования из пароля
        cryptoKey = await deriveKeyFromPassword(password);

        const users = getUsersList();

        if (users.includes(username)) {

            alert('Пользователь уже существует');

            return;
        }

        users.push(username);

        saveUsersList(users);

        const verificationData = await encryptData({
            check: 'AUTH_OK'
        });

        localStorage.setItem(
            getUserCheckKey(username),
            verificationData
        );
        
        // Скрываем модальное окно
        document.getElementById('password-modal').style.display = 'none';
        document.getElementById('login-modal').style.display = 'none';

        localStorage.setItem(
            '2fa-session',
            JSON.stringify({
                username: currentUser,
                loginTime: Date.now()
            })
        );
        
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
    const username = document
        .getElementById('login-username')
        .value
        .trim();
    const password = document.getElementById('login-password').value;
    
    if (!password) {
        alert('Введите мастер-пароль');
        return;
    }

    if (!username) {
        alert('Введите имя пользователя');
        return;
    }
    
    try {
        // Пробуем расшифровать данные с этим паролем
        currentUser = username;
        cryptoKey = await deriveKeyFromPassword(password);

        masterPassword = password;

        const checkData = localStorage.getItem(
            getUserCheckKey(username)
        );

        if (!checkData) {

            throw new Error('Пользователь не существует');
        }

        const decryptedCheck = await decryptData(checkData);

        if (decryptedCheck.check !== 'AUTH_OK') {

            throw new Error('Неверный пароль');
        }

        await loadAccounts();
        
        // Если успешно - скрываем окно входа
        document.getElementById('login-modal').style.display = 'none';
        document.getElementById('password-modal').style.display = 'none';

        localStorage.setItem(
            '2fa-session',
            JSON.stringify({
                username: currentUser,
                loginTime: Date.now()
            })
        );
        
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
    const encryptedData = localStorage.getItem(
    getUserStorageKey(currentUser)
    );
    
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
        localStorage.setItem(
            getUserStorageKey(currentUser),
            encryptedData
        );
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
    document.getElementById('add-account-modal').style.display = 'flex';
}

function hideAddAccountModal() {
    document.getElementById('add-account-modal').style.display = 'none';
}

// Добавление аккаунта вручную
async function addManualAccount() {
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
    await saveAccounts();
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
async function removeAccount(index) {
    if (confirm('Удалить этот ключ?')) {
        accounts.splice(index, 1);
        await saveAccounts();
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
window.addManualAccount = addManualAccount;
window.removeAccount = removeAccount;

console.log('Приложение инициализировано!');

async function handleQRUpload(event) {

    const file = event.target.files[0];

    if (!file) {
        return;
    }

    processQRImage(file);
}

function parseOTPAuthURL(url) {
    try {
        if (!url.startsWith('otpauth://')) {
            throw new Error('Неверный формат OTP ссылки');
        }

        const parsedUrl = new URL(url);

        const secret = parsedUrl.searchParams.get('secret');
        const issuer = parsedUrl.searchParams.get('issuer');

        if (!secret) {
            throw new Error('Secret ключ не найден');
        }

        const accountName = issuer || 'Unknown Service';

        const newAccount = {
            issuer: accountName,
            secret: secret,
            addedAt: new Date().toISOString()
        };

        accounts.push(newAccount);

        saveAccounts();
        renderAccounts();

        alert(`Ключ ${accountName} успешно импортирован!`);

        hideAddAccountModal();

        console.log('✅ OTP аккаунт импортирован');

    } catch (error) {
        console.error('Ошибка обработки OTP URL:', error);
        alert('Ошибка обработки QR-кода');
    }
}

document.addEventListener('paste', handlePaste);

async function handlePaste(event) {

    const items = event.clipboardData.items;

    for (const item of items) {

        if (item.type.startsWith('image/')) {

            const file = item.getAsFile();

            console.log('📋 Вставлено изображение из буфера');

            processQRImage(file);

            return;
        }
    }

    console.log('❌ В буфере нет изображения');
}

async function processQRImage(file) {

    try {

        console.log('🔍 Анализ QR изображения...');

        const image = new Image();

        image.onload = function () {

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            canvas.width = image.width;
            canvas.height = image.height;

            context.drawImage(image, 0, 0);

            const imageData = context.getImageData(
                0,
                0,
                canvas.width,
                canvas.height
            );

            const code = jsQR(
                imageData.data,
                imageData.width,
                imageData.height
            );

            if (code) {

                console.log('✅ QR найден:', code.data);

                parseOTPAuthURL(code.data);

            } else {

                alert('QR-код не найден');
            }
        };

        image.src = URL.createObjectURL(file);

    } catch (error) {

        console.error('Ошибка обработки QR:', error);

        alert('Ошибка чтения QR-кода');
    }
}

async function startCameraScanner() {

    try {

        const video = document.getElementById('qr-video');

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment'
            }
        });

        video.srcObject = stream;

        scanQRCodeFromVideo(video);

        console.log('📷 Камера запущена');

    } catch (error) {

        console.error('Ошибка доступа к камере:', error);

        alert('Не удалось получить доступ к камере');
    }
}

function scanQRCodeFromVideo(video) {

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    const scanInterval = setInterval(() => {

        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        context.drawImage(video, 0, 0);

        const imageData = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
        );

        const code = jsQR(
            imageData.data,
            imageData.width,
            imageData.height
        );

        if (code) {

            console.log('✅ QR найден:', code.data);

            parseOTPAuthURL(code.data);

            clearInterval(scanInterval);

            // Останавливаем камеру
            const stream = video.srcObject;

            stream.getTracks().forEach(track => track.stop());

            video.srcObject = null;

            alert('QR-код успешно отсканирован!');
        }

    }, 300);
}

function switchToRegister() {

    document.getElementById('login-modal').style.display = 'none';

    document.getElementById('password-modal').style.display = 'flex';
}

function switchToLogin() {

    document.getElementById('password-modal').style.display = 'none';

    document.getElementById('login-modal').style.display = 'flex';
}

function logout() {
    accounts = [];
    masterPassword = null;
    cryptoKey = null;
    currentUser = null;
    renderAccounts();
    document.getElementById('login-password').value = '';
    document.getElementById('login-username').value = '';
    document.getElementById('login-modal').style.display = 'flex';
    localStorage.removeItem('2fa-session');
    console.log('🔒 Пользователь вышел из аккаунта');
}

function getUserCheckKey(username) {
    return `2fa-check-${username}`;
}

