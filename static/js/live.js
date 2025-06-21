let stream;
let socket;
let micStream;
let micMuted = false;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusText = document.getElementById('statusText');
let playlistQueue = [];
const queueList = document.getElementById('queueList');
const audioPlayer = document.getElementById('audioPlayer');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const volumeControl = document.getElementById('volumeControl');
const seekBar = document.getElementById('seekBar');
const songTitle = document.getElementById('songTitle');

const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');
let typingTimeout;

startBtn.addEventListener('click', async () => {
    try {
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();

        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(destination);

        const audioSource = audioContext.createMediaElementSource(audioPlayer);
        audioSource.connect(destination);
        audioSource.connect(audioContext.destination);
        micSource.connect(audioContext.destination);

        const mixedStream = destination.stream;

        const mixedSource = audioContext.createMediaStreamSource(destination.stream);

        const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);

        mixedSource.connect(scriptNode);
        scriptNode.connect(audioContext.destination);

        socket = io();

        scriptNode.onaudioprocess = (audioProcessingEvent) => {
            const inputBuffer = audioProcessingEvent.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);

            const pcmData = new Float32Array(inputData);
            socket.emit('broadcast-audio', pcmData.buffer);
        };

        statusText.textContent = "🔴 Transmitiendo en vivo";
        statusText.style.color = "#ff4d4d";

        startBtn.disabled = true;
        stopBtn.disabled = false;

        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if (text !== "") {
                const msg = {
                    text: text,
                    sender: "Locutor",
                    id: Date.now(),
                    reactions: {}
                };
                socket.emit('chat-message', msg);
                addMessageToChatFull(msg, true);
                chatInput.value = "";
            }
        });

        socket.on('chat-message', (msg) => {
            addMessageToChatFull(msg, msg.sender === "Locutor");
        });

        socket.on('delete-message', (msgId) => {
            deleteMessageFromChat(msgId);
        });

        socket.on('reaction', ({ messageId, emoji, count }) => {
            updateMessageReaction(messageId, emoji, count);
        });

        chatInput.addEventListener('input', () => {
            socket.emit('typing', { sender: "Locutor" });
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                socket.emit('stop-typing', { sender: "Locutor" });
            }, 3000);
        });

        socket.on('typing', data => {
            document.getElementById('typingStatus').textContent = `${data.sender} está escribiendo...`;
        });

        socket.on('stop-typing', data => {
            document.getElementById('typingStatus').textContent = "";
        });
        document.getElementById('muteMicBtn').disabled = false;

    } catch (error) {
        statusText.textContent = "❌ Error al acceder al micrófono o audio";
        console.error(error);
    }
});

stopBtn.addEventListener('click', () => {
    if (socket) socket.disconnect();
    if (stream) stream.getTracks().forEach(track => track.stop());

    statusText.textContent = "🟢 Listo para transmitir";
    statusText.style.color = "#00ff94";
    document.getElementById('muteMicBtn').disabled = true;
    document.getElementById('muteMicBtn').textContent = "🎤 Silenciar Mic";
    micMuted = false;
    micStream = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
});

audioPlayer.addEventListener('ended', () => {
    console.log("Canción terminada.");
    playNextSongInQueue();
});

playBtn.addEventListener('click', () => {
    audioPlayer.play().catch(err => {
        console.error("Error al reproducir audioPlayer:", err);
    });
});

pauseBtn.addEventListener('click', () => {
    audioPlayer.pause();
});

volumeControl.addEventListener('input', () => {
    audioPlayer.volume = volumeControl.value;
});

audioPlayer.addEventListener('timeupdate', () => {
    if (!isNaN(audioPlayer.duration)) {
        const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        seekBar.value = percent;
    }
});

seekBar.addEventListener('input', () => {
    if (!isNaN(audioPlayer.duration)) {
        audioPlayer.currentTime = (seekBar.value / 100) * audioPlayer.duration;
    }
});

const categorySelect = document.getElementById('categorySelect');
const songList = document.getElementById('songList');

async function loadCategories() {
    try {
        const res = await fetch("/api/folders");
        const data = await res.json();

        if (!res.ok || !data.folders) throw new Error("No se pudieron cargar categorías");

        categorySelect.innerHTML = '<option disabled selected>Selecciona una categoría</option>';

        data.folders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder;
            option.textContent = folder.charAt(0).toUpperCase() + folder.slice(1);
            categorySelect.appendChild(option);
        });

    } catch (err) {
        console.error("Error cargando categorías:", err);
        songList.innerHTML = "<p style='color: #f66;'>Error al cargar categorías.</p>";
    }
}

categorySelect.addEventListener('change', async () => {
    const category = categorySelect.value;
    songList.innerHTML = "⏳ Cargando canciones...";

    try {
        const res = await fetch(`/api/category-songs/${category}`);
        const data = await res.json();

        if (!data.songs || data.songs.length === 0) {
            songList.innerHTML = "<p style='color: #aaa;'>No hay canciones en esta categoría.</p>";
            return;
        }

        songList.innerHTML = "";
        data.songs.forEach(song => {
            const btn = document.createElement('button');
            btn.textContent = `🎵 ${song.title}`;
            btn.addEventListener('click', () => {
                playlistQueue.push({
                    url: `/api/proxy-cloudinary/${encodeURIComponent(song.public_id)}`,
                    title: song.title
                });

                const li = document.createElement('li');
                li.textContent = `🎵 ${song.title}`;
                queueList.appendChild(li);

                if (audioPlayer.paused && playlistQueue.length === 1) {
                    playNextSongInQueue();
                } else {
                    console.log(`Añadida a la cola: ${song.title}`);
                }
            });

            songList.appendChild(btn);
        });

    } catch (err) {
        console.error("Error cargando canciones:", err);
        songList.innerHTML = "<p style='color: #f66;'>Error al cargar canciones.</p>";
    }
});

function playNextSongInQueue() {
    if (playlistQueue.length === 0) {
        console.log("Cola vacía. No hay más canciones para reproducir.");
        return;
    }

    const nextSong = playlistQueue.shift();

    if (queueList.firstChild) {
        queueList.removeChild(queueList.firstChild);
    }

    audioPlayer.src = nextSong.url;
    audioPlayer.play().catch(err => {
        console.error("Error reproduciendo canción:", err);
    });
    songTitle.textContent = `🎵 ${nextSong.title}`;
}

document.getElementById('clearQueueBtn').addEventListener('click', () => {
    playlistQueue = [];
    queueList.innerHTML = "";
    console.log("Cola limpiada.");
});
async function cargarProgramacionYReproducir() {
    try {
        const res = await fetch("/api/cargar-programacion");
        const data = await res.json();

        // Unir todas las canciones de todos los bloques horarios en una sola lista
        const cancionesUnidas = Object.values(data).flat();

        if (cancionesUnidas.length === 0) {
            console.log("🎧 No hay canciones programadas para hoy.");
            return;
        }

        // Obtener información detallada de cada canción desde Cloudinary
        const cancionesDetalles = await Promise.all(
            cancionesUnidas.map(async texto => {
                const [title] = texto.split(" - ");
                // Buscar la canción en la base de datos local por título
                const res = await fetch(`/api/todos-los-temas`);
                const cancionesDB = await res.json();

                const song = cancionesDB.find(c => c.title.trim() === title.trim());
                if (song) {
                    return {
                        url: `/api/proxy-cloudinary/${encodeURIComponent(song.public_id)}`,
                        title: song.title
                    };
                }
                return null;
            })
        );

        // Filtrar canciones que sí se encontraron
        const cancionesValidas = cancionesDetalles.filter(song => song !== null);

        // Agregar a la cola y al HTML
        cancionesValidas.forEach(song => {
            playlistQueue.push(song);
            const li = document.createElement('li');
            li.textContent = `🎵 ${song.title}`;
            queueList.appendChild(li);
        });

        if (audioPlayer.paused && playlistQueue.length > 0) {
            playNextSongInQueue();
        }

    } catch (err) {
        console.error("❌ Error al cargar y preparar la programación:", err);
    }
}

cargarProgramacionYReproducir();
async function cargarProgramacionEnCola() {
    try {
        const res = await fetch('/api/cargar-programacion');
        const data = await res.json();

        let cancionesAgregadas = new Set();

        // 🔁 Recorremos cada hora
        for (const hora in data) {
            const canciones = data[hora];

            for (const cancionTexto of canciones) {
                if (cancionesAgregadas.has(cancionTexto)) continue;
                cancionesAgregadas.add(cancionTexto);
                const [titulo] = cancionTexto.split(" - ");
                if (!titulo) continue;

                const cloudRes = await fetch('/api/cloudinary-files');
                const cloudFiles = await cloudRes.json();

                const match = cloudFiles.find(c => c.public_id.includes(titulo.trim()));
                if (!match) {
                    console.warn(`❌ No se encontró la canción: ${titulo}`);
                    continue;
                }

                // Agregar a la cola
                playlistQueue.push({
                    url: `/api/proxy-cloudinary/${encodeURIComponent(match.public_id)}`,
                    title: cancionTexto
                });
                const li = document.createElement('li');
                li.textContent = `🎵 ${cancionTexto}`;
                queueList.appendChild(li);
            }
        }

        console.log(`✅ Se cargaron ${playlistQueue.length} canciones en la cola.`);

    } catch (err) {
        console.error("❌ Error al cargar la programación:", err);
    }
}

playBtn.addEventListener('click', async () => {
    if (playlistQueue.length === 0) {
        await cargarProgramacionEnCola();
    }
    audioPlayer.play().catch(err => {
        console.error("Error al reproducir audioPlayer:", err);
    });
});
document.getElementById('muteMicBtn').addEventListener('click', () => {
    if (!micStream) return;
    micMuted = !micMuted;
    micStream.getAudioTracks().forEach(track => track.enabled = !micMuted);

    const btn = document.getElementById('muteMicBtn');
    btn.textContent = micMuted ? "🔇 Micrófono Muted" : "🎤 Silenciar Mic";
    btn.style.background = micMuted ? "#faa" : "";
});
loadCategories();
