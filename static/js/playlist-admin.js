document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    const fileInput = document.querySelector('input[type="file"][name="file"]');
    const genreSelect = document.getElementById('genreSelect');
    const titleInput = document.getElementById('titleInput');
    const artistInput = document.getElementById('artistInput');
    const idInput = document.getElementById('idInput');
    const addSongBtn = document.getElementById('addSongBtn');
    const adminSongList = document.querySelector('.admin-song-list');

    let songs = [];

    async function loadCategories() {
        const list = document.querySelector(".category-list");
        const genreSelect = document.getElementById('genreSelect'); // asegúrate que esté bien seleccionado
        list.innerHTML = "";
        genreSelect.innerHTML = '<option disabled selected>Selecciona un género</option>';

        try {
            const response = await fetch("/api/folders");
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || "Error al cargar categorías");

            for (const folder of data.folders) {
                // Cargar en category-list
                fetch(`/api/category-songs/${folder}`)
                    .then(result => result.json())
                    .then(dataSongs => {
                        if (Array.isArray(dataSongs.songs) && dataSongs.songs.length > 0) {
                            const li = document.createElement("li");
                            li.innerHTML = `${folder} <button class="edit-btn">Editar</button>`;
                            list.appendChild(li);
                        }
                    });
                const option = document.createElement('option');
                option.value = folder;
                option.textContent = folder.charAt(0).toUpperCase() + folder.slice(1);
                genreSelect.appendChild(option);
            }

        } catch (error) {
            console.error(error);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "No se pudieron cargar las categorías."
            });
        }
    }

    function renderSongs() {
        adminSongList.innerHTML = '';
        songs.forEach(song => {
            const li = document.createElement('li');
            li.textContent = `${song.title} - ${song.artist} (${song.genre})`;
            adminSongList.appendChild(li);
        });
    }

    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            contents.forEach(c => c.style.display = 'none');
            document.getElementById(target).style.display = 'block';

            if (target === 'playlists') {
                titleInput.value = '';
                artistInput.value = '';
                idInput.value = '';
                fileInput.value = '';
                renderSongs();
            }
        });
    });

    async function uploadFile(file, publicId, genre) {
        const formData = new FormData();
        formData.append('file', file);
        if (publicId) formData.append('public_id', `${publicId}`);
        else formData.append('public_id', `${file.name}`);
        formData.append('genre', genre);

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error subiendo archivo');
        }
        const data = await response.json();
        return data;
    }


    addSongBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) {
            Swal.fire({
                icon: 'warning',
                title: 'Archivo requerido',
                text: 'Por favor selecciona un archivo para subir.'
            });
            return;
        }
        const title = titleInput.value.trim();
        const artist = artistInput.value.trim();
        const genre = genreSelect.value;
        const userId = idInput.value.trim();

        if (!title || !artist || !genre) {
            Swal.fire({
                icon: 'warning',
                title: 'Campos incompletos',
                text: 'Por favor completa todos los campos.'
            });
            return;
        }

        try {
            const uploadResult = await uploadFile(file, title, genre);
            const cloudinaryId = uploadResult.public_id;
            const songData = {
                title,
                artist,
                genre,
                id: cloudinaryId
            };

            const response = await fetch('/api/add-song', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(songData)
            });

            if (!response.ok) {
                const error = await response.json();
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: error.error || 'Error agregando canción.'
                });
                return;
            }

            const result = await response.json();
            Swal.fire({
                icon: 'success',
                title: '¡Éxito!',
                text: result.message || 'Canción agregada.'
            });

            songs.push(result.song);
            renderSongs();

            titleInput.value = '';
            artistInput.value = '';
            idInput.value = '';
            fileInput.value = '';

        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Error: ' + error.message
            });
        }
    });
    document.addEventListener("click", (e) => {
        if (e.target.classList.contains("edit-btn")) {
            const categoryName = e.target.parentElement.textContent.trim().replace("Editar", "").trim();
            document.getElementById("modalCategoryName").textContent = categoryName;
            openModal();
            fetch(`/api/category-songs/${categoryName}`)
                .then(res => res.json())
                .then(data => {
                    const songList = document.getElementById("modalSongList");
                    songList.innerHTML = "";
                    const songs = (data.songs || [])
                    if (songs.length === 0) {
                        songList.innerHTML = "<p>No hay canciones en esta categoría.</p>";
                    }

                    songs.forEach(song => {
                        const li = document.createElement("li");

                        const textSpan = document.createElement("span");
                        textSpan.textContent = `${song.title || song.public_id} - ${song.artist || "Artista desconocido"}`;

                        const deleteBtn = document.createElement("button");
                        deleteBtn.textContent = "Eliminar";
                        deleteBtn.addEventListener("click", () => deleteSong(song.public_id));

                        li.classList.add("song-item");
                        deleteBtn.classList.add("delete-btn");

                        li.appendChild(textSpan);
                        li.appendChild(deleteBtn);

                        songList.appendChild(li);

                    });
                });

        }
        const closeBtn = document.querySelector('#editCategoryModal .close-btn');
        closeBtn.addEventListener('click', closeModal);
    });


    function openModal() {
        document.getElementById("editCategoryModal").style.display = "flex";
    }

    function closeModal() {
        document.getElementById("editCategoryModal").style.display = "none";
    }

    function deleteSong(cloudinaryId) {
        fetch(`/api/delete-song/${cloudinaryId}`, {method: "DELETE"})
            .then(res => res.json())
            .then(data => {
                Swal.fire("Eliminada", data.message, "success");
                closeModal();
            });
    }

    document.getElementById("deleteCategoryBtn").addEventListener("click", () => {
        const category = document.getElementById("modalCategoryName").textContent;
        fetch(`/api/delete-category/${category.toLowerCase()}`, {method: "DELETE"})
            .then(res => res.json())
            .then(data => {
                Swal.fire("Categoría eliminada", data.message, "success");
                closeModal();
            });
    });
    document.getElementById("action-btn").addEventListener("click", async () => {
        const categoryName = document.getElementById("categoryName").value.trim();

        if (!categoryName) {
            Swal.fire({
                icon: "warning",
                title: "Nombre requerido",
                text: "Por favor ingresa un nombre para la categoría."
            });
            return;
        }

        try {
            const response = await fetch(`/api/create-folder/${categoryName}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({category: categoryName})
            });

            const result = await response.json();

            if (!response.ok) {
                Swal.fire({
                    icon: "error",
                    title: "Error",
                    text: result.error || "No se pudo crear la carpeta."
                });
                return;
            }

            Swal.fire({
                icon: "success",
                title: "Carpeta creada",
                text: result.message || "La categoría fue creada exitosamente."
            });

            document.getElementById("categoryName").value = "";

        } catch (error) {
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "Ocurrió un error: " + error.message
            });
        }
    });
    const socket = io();

    socket.on('connect', () => {
        console.log('✅ Conectado a Socket.IO server');
    });

    document.getElementById('sendChatMessageBtn').addEventListener('click', () => {
        const chatInput = document.getElementById('chatMessageInput');
        const msgText = chatInput.value.trim();
        if (msgText !== "") {
            const chatMsg = {
                text: msgText,
                sender: "Admin",
                id: Date.now(),
                reactions: {}
            };

            socket.emit('chat-message', chatMsg);
            addMessageToChatFull(chatMsg, true, socket);
            chatInput.value = "";
        }
    });

    socket.on('chat-message', (msg) => {
        addMessageToChatFull(msg, msg.sender === "Admin", socket);
    });

    document.getElementById('chatWindow').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.dataset.emoji) {
            const messageId = e.target.closest('.chat-message').dataset.id;
            const emoji = e.target.dataset.emoji;

            console.log(`🔄 Enviando reacción: ${emoji} para mensaje ${messageId}`);

            socket.emit('reaction', { messageId, emoji });
        }
    });
    socket.on('reaction', ({ messageId, emoji, count }) => {
        console.log(`✅ Reaction recibida: ${emoji} (${count}) para mensaje ${messageId}`);

        const msgDiv = document.querySelector(`.chat-message[data-msg-id='${messageId}']`);
        if (msgDiv) {
            const btn = msgDiv.querySelector(`button[data-reaction='${emoji}']`);
            if (btn) {
                btn.innerHTML = `${emoji} ${count}`;
            }
        }
    });


    document.getElementById('chatWindow').addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-msg-btn')) {
            const msgDiv = e.target.closest('.chat-message');
            const msgId = msgDiv.dataset.msgId;

            console.log(`🗑️ Enviando delete para mensaje ${msgId}`);

            socket.emit('delete-message', msgId);
        }
    });


    socket.on('delete-message', (msgId) => {
        console.log(`✅ Delete recibido para mensaje ${msgId}`);

        const msgDiv = document.querySelector(`.chat-message[data-msg-id='${msgId}']`);
        if (msgDiv) {
            msgDiv.remove();
        }
    });


    const chatInput = document.getElementById('chatMessageInput');
    let typingTimeout;
    chatInput.addEventListener('input', () => {
        socket.emit('typing', { sender: "Admin" });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('stop-typing', { sender: "Admin" });
        }, 3000);
    });

    socket.on('typing', data => {
        document.getElementById('typingStatus').textContent = `${data.sender} está escribiendo...`;
    });

    socket.on('stop-typing', data => {
        document.getElementById('typingStatus').textContent = "";
    });
    const emojiPickerContainer = document.getElementById('emojiPickerContainer');
    const emojiPicker = document.createElement('emoji-picker');

    emojiPicker.addEventListener('emoji-click', event => {
        const emoji = event.detail.unicode;
        const chatInput = document.getElementById('chatMessageInput');
        chatInput.value += emoji;
        chatInput.focus();

        emojiPickerContainer.style.display = 'none';
    });

    emojiPickerContainer.appendChild(emojiPicker);

    document.getElementById('emojiBtn').addEventListener('click', () => {
        if (emojiPickerContainer.style.display === 'none') {
            emojiPickerContainer.style.display = 'block';
        } else {
            emojiPickerContainer.style.display = 'none';
        }
    });
// === FUNCIONALIDAD BOTÓN GIF ===

    const gifBtn = document.getElementById('gifBtn');
    const gifModal = document.getElementById('gifModal');
    const closeGifModal = document.getElementById('closeGifModal');
    const gifSearchInput = document.getElementById('gifSearchInput');
    const gifResults = document.getElementById('gifResults');

    gifBtn.addEventListener('click', () => {
        gifModal.style.display = 'flex';
        gifSearchInput.value = '';
        gifResults.innerHTML = '';
        gifSearchInput.focus();
    });

    closeGifModal.addEventListener('click', () => {
        gifModal.style.display = 'none';
    });

    gifSearchInput.addEventListener('input', async () => {
        const query = gifSearchInput.value.trim();
        if (query.length < 2) return;

        const apiKey = 'BLKt8cqu30SWTx6JekoOydaeBrK9r5Iy'; // Tu API KEY
        const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=12&rating=g`);
        const data = await res.json();

        gifResults.innerHTML = '';
        data.data.forEach(gif => {
            const img = document.createElement('img');
            img.src = gif.images.fixed_height_small.url;
            img.style.cursor = 'pointer';
            img.style.borderRadius = '8px';
            img.addEventListener('click', () => {
                const chatMsg = {
                    text: `<img src="${gif.images.original.url}" alt="GIF" style="max-width:200px; max-height:200px;" />`,
                    sender: 'Admin',
                    id: Date.now(),
                    reactions: {}
                };

                socket.emit('chat-message', chatMsg);
                addMessageToChatFull(chatMsg, true, socket);
                gifModal.style.display = 'none';
            });


            gifResults.appendChild(img);
        });
    });
    const moderationModal = document.getElementById('moderationActionModal');
    const moderationTitle = document.getElementById('moderationModalTitle');
    const moderationUsernameInput = document.getElementById('moderationUsernameInput');
    const confirmModerationBtn = document.getElementById('confirmModerationBtn');
    const closeModerationModal = document.getElementById('closeModerationModal');

    let currentModerationAction = null; // puede ser 'silence', 'expel', 'restore'

    document.getElementById('silenceUserBtn').addEventListener('click', () => {
        openModerationModal('Silenciar Usuario', 'silence');
    });

    document.getElementById('expelUserBtn').addEventListener('click', () => {
        openModerationModal('Expulsar Usuario', 'expel');
    });

    document.getElementById('restoreUserBtn').addEventListener('click', () => {
        openModerationModal('Restaurar Usuario', 'restore');
    });

    closeModerationModal.addEventListener('click', () => {
        moderationModal.style.display = 'none';
    });

    confirmModerationBtn.addEventListener('click', () => {
        const username = moderationUsernameInput.value.trim();
        if (username === '') {
            Swal.fire('⚠️', 'Por favor ingresa un nombre de usuario.', 'warning');
            return;
        }

        if (currentModerationAction === 'silence') {
            socket.emit('silence-user', { username });
        } else if (currentModerationAction === 'expel') {
            socket.emit('expel-user', { username });
        } else if (currentModerationAction === 'restore') {
            socket.emit('restore-user', { username });
        }

        moderationModal.style.display = 'none';
        moderationUsernameInput.value = '';
    });

    function openModerationModal(title, action) {
        moderationTitle.textContent = title;
        currentModerationAction = action;
        moderationUsernameInput.value = '';
        moderationModal.style.display = 'flex';
        moderationUsernameInput.focus();
    }
    document.getElementById('goLiveBtn').addEventListener('click', () => {
        window.location.href = '/admin/live';
    });

    function updateCloudinaryId() {
        const title = titleInput.value.trim().toLowerCase().replace(/\s+/g, '-');
        const artist = artistInput.value.trim().toLowerCase().replace(/\s+/g, '-');
        idInput.value = `${title}`;
    }

    titleInput.addEventListener('input', updateCloudinaryId);
    artistInput.addEventListener('input', updateCloudinaryId);
    loadCategories();

});
