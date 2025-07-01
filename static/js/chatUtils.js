function formatTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function playChatSound() {
    const audio = new Audio('/static/sounds/message.mp3');
    audio.play().catch(e => console.log("Sound blocked"));
}

function addMessageToChatFull(msg, isOwn = false, socket) {
    const existingMsg = document.querySelector(`[data-msg-id="${msg.id}"]`);
    if (existingMsg) return;

    const msgDiv = document.createElement('div');
    msgDiv.classList.add('chat-message');
    msgDiv.classList.add(isOwn ? 'my-message' : 'user');
    msgDiv.classList.add('new-message');
    msgDiv.dataset.msgId = msg.id;

    msgDiv.innerHTML = `
        <div class="avatar">${msg.sender.charAt(0)}</div>
        <div class="message-content">
        <div class="message-header">
          <span class="username">Oyente</span>
          <span class="timestamp">[23:43]</span>
        </div>
            ${msg.quote ? `<div class="quote">"${msg.quote}"</div>` : ''}
            <div class="message-text">${msg.text}</div>
            <div class="reactions">
                <button data-reaction="👍">👍 ${msg.reactions?.['👍'] || 0}</button>
                <button data-reaction="❤️">❤️ ${msg.reactions?.['❤️'] || 0}</button>
                <button data-reaction="😂">😂 ${msg.reactions?.['😂'] || 0}</button>
                <button class="delete-msg-btn" title="Eliminar mensaje">🗑️</button>
            </div>
        </div>
    `;

    msgDiv.querySelector('.delete-msg-btn').addEventListener('click', () => {
        socket.emit('delete-message', msg.id);
    });

    msgDiv.querySelectorAll('.reactions button').forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.dataset.reaction;
            socket.emit('reaction', { messageId: msg.id, emoji });
        });
    });

    const chatWindow = document.getElementById('chatWindow') || document.getElementById('chatMessages');
    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    if (!isOwn) playChatSound();
}

function deleteMessageFromChat(messageId) {
    const msgDiv = document.querySelector(`[data-msg-id="${messageId}"]`);
    if (msgDiv) msgDiv.remove();
}

function updateMessageReaction(messageId, emoji, count) {
    const msgDiv = document.querySelector(`[data-msg-id="${messageId}"]`);
    if (msgDiv) {
        const btn = msgDiv.querySelector(`.reactions button[data-reaction="${emoji}"]`);
        if (btn) {
            btn.textContent = `${emoji} ${count}`;
        }
    }
}
