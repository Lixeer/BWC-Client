const { ipcRenderer } = require('electron');
const WebSocket = require('ws');

let currentWs = null;
let currentServer = null;
const username = localStorage.getItem('username');
if (!username) {
    window.location.href = 'login.html';
}

// 暂时存储每个服务器的消息
const serverMessages = new Map();

// 初始化应用
async function initializeApp() {
    try {
        // 初始化用户名显示
        const usernameDisplay = document.getElementById('usernameDisplay');
        if (usernameDisplay) {
            usernameDisplay.textContent = username;
        }

        // 加载已保存的服务器
        await loadServers();

        // 添加事件监听器
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        }

        const addServerBtn = document.getElementById('addServerButton');
        if (addServerBtn) {
            addServerBtn.addEventListener('click', addServer);
        }

        const logoutBtn = document.getElementById('logoutButton');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logout);
        }

        const fileInput = document.getElementById('file');
        fileInput.addEventListener('change', handleFileUpload);

        // 添加点击事件监听器
        document.addEventListener('click', (event) => {
            const sidebar = document.getElementById('sidebar');
            const showSidebarBtn = document.getElementById('showSidebar');
            
            // 如果侧边栏是打开的，并且点击的不是侧边栏内部或显示按钮
            if (sidebar.classList.contains('active') && 
                !sidebar.contains(event.target) && 
                !showSidebarBtn.contains(event.target)) {
                sidebar.classList.remove('active');
            }
        });
    } catch (error) {
        console.error('初始化应用时出错:', error);
        const errorMessage = {
            type: 'notice',
            sender: 'system',
            content: '加载保存的服务器时出错了，稍后再试试吧 ~',
            time: getCurrentTime()
        };
        saveAndDisplayMessage(errorMessage);
    }
}

// 加载已保存的服务器
async function loadServers() {
    const servers = await ipcRenderer.invoke('get-servers');
    const serverList = document.getElementById('serverList');
    serverList.innerHTML = '';

    servers.forEach(server => {
        const serverElement = document.createElement('div');
        serverElement.className = 'server-item';
        if (currentServer && currentServer.ip === server.ip && currentServer.port === server.port) {
            serverElement.classList.add('active');
        }

        const { addressElement, keyElement, deleteButton } = updateServerDisplay(server);

        // 删除服务器
        deleteButton.onclick = (e) => deleteServer(server, e);

        serverElement.appendChild(addressElement);
        serverElement.appendChild(keyElement);
        serverElement.appendChild(deleteButton);

        serverElement.onclick = () => connectToServer(server);
        serverList.appendChild(serverElement);
    });

    // 添加"添加服务器"按钮
    const addServerItem = document.createElement('div');
    addServerItem.className = 'server-item add-server-item';

    const addButton = document.createElement('button');
    addButton.className = 'add-server-btn';
    addButton.onclick = showAddServerDialog;
    addButton.textContent = '添加服务器';

    addServerItem.appendChild(addButton);
    serverList.appendChild(addServerItem);
}

function getServerKey(server) {
    return `${server.ip}:${server.port}`;
}

function clearChatMessages() {
    const messagesDiv = document.getElementById('chatMessages');
    messagesDiv.innerHTML = '';
}

function loadServerMessages(server) {
    clearChatMessages();
    const serverKey = getServerKey(server);
    const messages = serverMessages.get(serverKey) || [];
    messages.forEach(message => {
        displayMessage(message, false);
    });
}

function connectToServer(server) {
    if (currentWs) {
        currentWs.close();
        currentWs = null;
        currentServer = null;
        updateConnectionStatus(false);
    }

    // 初始化消息历史
    const serverKey = getServerKey(server);
    if (!serverMessages.has(serverKey)) {
        serverMessages.set(serverKey, []);
    }

    // 加载连接的服务器的消息历史
    loadServerMessages(server);

    const ws = new WebSocket(`ws://${server.ip}:${server.port}`, {
        headers: {
            'X-Auth-Key': server.authKey
        }
    });

    ws.onopen = () => {
        currentWs = ws;
        currentServer = server;
        updateConnectionStatus(true);
        loadServers();
        document.getElementById('sidebar').classList.remove('active');
    };

    ws.onclose = () => {
        currentWs = null;
        currentServer = null;
        updateConnectionStatus(false);
        loadServers();
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            saveAndDisplayMessage(message);

            if (message.type === 'notice' && message.content === 'wrong-key') {
                ws.close();
            }
        } catch (error) {
            console.error('解析消息时出错:', error);
            const errorMessage = {
                type: 'notice',
                sender: 'system',
                content: 'Error: Received invalid message format',
                time: getCurrentTime()
            };
            saveAndDisplayMessage(errorMessage);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket 错误:', error);
        alert('连接服务器失败');
    };
}

function saveAndDisplayMessage(message, addToHistory = true) {
    if (currentServer && addToHistory) {
        const serverKey = getServerKey(currentServer);
        const messages = serverMessages.get(serverKey) || [];
        messages.push(message);
        serverMessages.set(serverKey, messages);
    }
    displayMessage(message);
}

function displayMessage(message, scrollToBottom = true) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    const username = localStorage.getItem('username');

    if (message.type === 'notice') {
        messageElement.className = 'message notice';
        const noticeContent = document.createElement('span');
        noticeContent.className = 'notice-content';

        if (message.content === 'right-key') {
            noticeContent.innerHTML = `✔ 连接成功啦 ~`;
        } else if (message.content === 'wrong-key') {
            noticeContent.innerHTML = `✖ 哎呀，密钥不对呢`;
        } else if (message.content === 'illegal-data') {
            noticeContent.innerHTML = `⚠ 消息格式有误，检查一下吧`;
        } else {
            noticeContent.innerHTML = `${message.content}`;
        }

        messageElement.appendChild(noticeContent);
    } else if (message.type === 'image') {
        const isOwnMessage = message.sender === username;
        messageElement.className = `message ${isOwnMessage ? 'sent' : 'received'}`;

        const messageInfo = document.createElement('div');
        messageInfo.className = 'message-info';
        messageInfo.textContent = `${isOwnMessage ? '' : message.sender + ' · '}${formatTime(message.time)}`;

        const messageBubble = document.createElement('div');
        messageBubble.className = 'message-bubble';

        const img = document.createElement('img');
        img.src = message.content;
        img.style.maxWidth = '300px';
        img.style.maxHeight = '300px';
        img.style.borderRadius = '5px';
        messageBubble.appendChild(img);

        if (isOwnMessage) {
            messageElement.appendChild(messageBubble);
            messageElement.appendChild(messageInfo);
        } else {
            messageElement.appendChild(messageInfo);
            messageElement.appendChild(messageBubble);
        }
    } else {
        const isOwnMessage = message.sender === username;
        messageElement.className = `message ${isOwnMessage ? 'sent' : 'received'}`;

        const messageInfo = document.createElement('div');
        messageInfo.className = 'message-info';
        messageInfo.textContent = `${isOwnMessage ? '' : message.sender + ' · '}${formatTime(message.time)}`;

        const messageBubble = document.createElement('div');
        messageBubble.className = 'message-bubble';
        messageBubble.textContent = message.content;

        if (isOwnMessage) {
            messageElement.appendChild(messageBubble);
            messageElement.appendChild(messageInfo);
        } else {
            messageElement.appendChild(messageInfo);
            messageElement.appendChild(messageBubble);
        }
    }

    messagesDiv.appendChild(messageElement);
    if (scrollToBottom) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

function formatTime(timeStr) {
    // 格式化时间: YYYY-MM-DD-HH-mm-ss
    const parts = timeStr.split('-');
    if (parts.length >= 6) {
        return `${parts[3]}:${parts[4]}`;
    }
    return timeStr;
}

function getCurrentTime() {
    return new Date().toISOString().replace('T', '-').replace('Z', '').split('.')[0];
}

function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();

    if (!message || !currentWs) return;

    const messageObj = {
        sender: username,
        content: message,
        type: "message",
        time: getCurrentTime()
    };

    try {
        currentWs.send(JSON.stringify(messageObj));
        saveAndDisplayMessage(messageObj);
        messageInput.value = '';
    } catch (error) {
        console.error('发送消息时出错:', error);
        const errorMessage = {
            type: 'notice',
            sender: 'system',
            content: '消息发送失败了，重试一下吧 ~',
            time: getCurrentTime()
        };
        saveAndDisplayMessage(errorMessage);
    }
}

function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connectionStatus');
    statusElement.textContent = connected ? '已连接' : '未连接';
    statusElement.className = 'connection-status ' + (connected ? 'connected' : 'disconnected');
}

function logout() {
    // 关闭 WebSocket
    if (currentWs) {
        currentWs.close();
    }

    // 清空聊天记录
    serverMessages.clear();
    localStorage.removeItem('username');

    // 显示退出消息
    const logoutMessage = {
        type: 'notice',
        sender: 'system',
        content: '下次再见啦 ~',
        time: getCurrentTime()
    };
    saveAndDisplayMessage(logoutMessage);

    // 回到登录页面
    setTimeout(() => {
        window.location.href = 'login.html';
    }, 1000);
}

async function addServer() {
    const ip = document.getElementById('serverIp').value.trim();
    const port = document.getElementById('serverPort').value.trim();
    const authKey = document.getElementById('authKey').value.trim();

    if (!ip || !port || !authKey) {
        const errorMessage = {
            type: 'notice',
            sender: 'system',
            content: '服务器信息要填写完整哦 ~',
            time: getCurrentTime()
        };
        saveAndDisplayMessage(errorMessage);
        return;
    }

    const server = { ip, port, authKey };
    await ipcRenderer.invoke('add-server', server);

    // 清空输入框
    document.getElementById('serverIp').value = '';
    document.getElementById('serverPort').value = '';
    document.getElementById('authKey').value = '';

    const successMessage = {
        type: 'notice',
        sender: 'system',
        content: '服务器添加成功！',
        time: getCurrentTime()
    };
    saveAndDisplayMessage(successMessage);

    loadServers();
    hideAddServerDialog();
}

async function deleteServer(server, event) {
    // 阻止事件冒泡
    event.stopPropagation();

    // 关闭 WebSocket
    if (currentServer && currentServer.ip === server.ip && currentServer.port === server.port) {
        if (currentWs) {
            currentWs.close();
        }
        currentServer = null;
        updateConnectionStatus(false);
    }

    // 删除服务器
    await ipcRenderer.invoke('delete-server', server);

    // 清空聊天记录
    const serverKey = getServerKey(server);
    serverMessages.delete(serverKey);

    const successMessage = {
        type: 'notice',
        sender: 'system',
        content: `服务器 ${server.ip}:${server.port} 已移除`,
        time: getCurrentTime()
    };
    saveAndDisplayMessage(successMessage);

    // 重新加载服务器列表
    loadServers();
}

// 更新服务器列表显示
function updateServerDisplay(server) {
    const addressElement = document.createElement('div');
    addressElement.className = 'server-address';
    addressElement.textContent = `${server.ip}:${server.port}`;

    const keyElement = document.createElement('div');
    keyElement.className = 'server-key';
    keyElement.textContent = `密钥: ${server.authKey}`;

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-server';
    deleteButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20" height="25" width="25">
            <path fill="#6361D9" d="M8.78842 5.03866C8.86656 4.96052 8.97254 4.91663 9.08305 4.91663H11.4164C11.5269 4.91663 11.6329 4.96052 11.711 5.03866C11.7892 5.11681 11.833 5.22279 11.833 5.33329V5.74939H8.66638V5.33329C8.66638 5.22279 8.71028 5.11681 8.78842 5.03866ZM7.16638 5.74939V5.33329C7.16638 4.82496 7.36832 4.33745 7.72776 3.978C8.08721 3.61856 8.57472 3.41663 9.08305 3.41663H11.4164C11.9247 3.41663 12.4122 3.61856 12.7717 3.978C13.1311 4.33745 13.333 4.82496 13.333 5.33329V5.74939H15.5C15.9142 5.74939 16.25 6.08518 16.25 6.49939C16.25 6.9136 15.9142 7.24939 15.5 7.24939H15.0105L14.2492 14.7095C14.2382 15.2023 14.0377 15.6726 13.6883 16.0219C13.3289 16.3814 12.8414 16.5833 12.333 16.5833H8.16638C7.65805 16.5833 7.17054 16.3814 6.81109 16.0219C6.46176 15.6726 6.2612 15.2023 6.25019 14.7095L5.48896 7.24939H5C4.58579 7.24939 4.25 6.9136 4.25 6.49939C4.25 6.08518 4.58579 5.74939 5 5.74939H6.16667H7.16638ZM7.91638 7.24996H12.583H13.5026L12.7536 14.5905C12.751 14.6158 12.7497 14.6412 12.7497 14.6666C12.7497 14.7771 12.7058 14.8831 12.6277 14.9613C12.5495 15.0394 12.4436 15.0833 12.333 15.0833H8.16638C8.05588 15.0833 7.94989 15.0394 7.87175 14.9613C7.79361 14.8831 7.74972 14.7771 7.74972 14.6666C7.74972 14.6412 7.74842 14.6158 7.74584 14.5905L6.99681 7.24996H7.91638Z" clip-rule="evenodd" fill-rule="evenodd"></path>
        </svg>
    `;
    deleteButton.title = '删除此服务器';

    return { addressElement, keyElement, deleteButton };
}

// 错误处理
function handleError(error, message) {
    console.error(`错误: ${message}`, error);
    const errorMessage = {
        type: 'notice',
        sender: 'system',
        content: `${message}，请稍后重试 ~`,
        time: getCurrentTime()
    };
    saveAndDisplayMessage(errorMessage);
}

// 在窗口关闭时关闭 WebSocket
window.addEventListener('beforeunload', () => {
    if (currentWs) {
        currentWs.close();
    }
});

// 处理图片文件上传
function handleFileUpload(event) {
    const file = event.target.files[0];
    const username = localStorage.getItem('username');
    
    if (file) {
        // 检查文件类型
        if (!file.type.startsWith('image/')) {
            alert('只能上传图片文件！');
            return;
        }

        // 检查文件大小（限制为5MB）
        if (file.size > 5 * 1024 * 1024) {
            alert('图片大小不能超过5MB！');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const base64Image = e.target.result;

            // 创建消息对象
            const message = {
                sender: username,
                type: 'image',
                content: base64Image,
                time: getCurrentTime()
            };

            // 发送消息到服务器
            if (currentWs && currentWs.readyState === WebSocket.OPEN) {
                currentWs.send(JSON.stringify(message));

                // 在本地显示图片消息
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message sent';

                const messageBubble = document.createElement('div');
                messageBubble.className = 'message-bubble';

                const img = document.createElement('img');
                img.src = base64Image;
                img.style.maxWidth = '300px';
                img.style.maxHeight = '300px';
                img.style.borderRadius = '5px';
                messageBubble.appendChild(img);

                const messageInfo = document.createElement('div');
                messageInfo.className = 'message-info';
                messageInfo.textContent = formatTime(message.time);

                messageDiv.appendChild(messageBubble);
                messageDiv.appendChild(messageInfo);

                document.getElementById('chatMessages').appendChild(messageDiv);

                // 滚动到底部
                const chatMessages = document.getElementById('chatMessages');
                chatMessages.scrollTop = chatMessages.scrollHeight;
            } else {
                alert('未连接到服务器，无法发送图片！');
            }
        };
        reader.readAsDataURL(file);
    }
    // 清除文件选择，这样可以重复选择同一个文件
    event.target.value = '';
}

function showAddServerDialog() {
    document.getElementById('addServerDialog').showModal();
}

function hideAddServerDialog() {
    document.getElementById('addServerDialog').close();
}

function toggleSidebar(event) {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('active');
    // 阻止事件冒泡，防止触发外部点击事件
    event.stopPropagation();
}

// 初始化应用
document.addEventListener('DOMContentLoaded', initializeApp);
